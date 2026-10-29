import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserVideoEngine } from "../lib/video/ffmpeg-browser";
import type { FFmpegWorker } from "../lib/video/ffmpeg-browser";

function fixture(fallback = false) {
  const calls: string[] = [];
  let outputDuration = 10;
  let time: ((event: { progress: number; time: number }) => void) | undefined;
  const worker = {
    loaded: false,
    on(event: string, cb: (event: { progress: number; time: number }) => void) {
      if (event === "progress") time = cb;
    },
    async load() {
      calls.push("load");
      worker.loaded = true;
      return true;
    },
    terminate() {
      calls.push("terminate");
      worker.loaded = false;
    },
    async createDir() {
      calls.push("mkdir");
      return true;
    },
    async deleteDir() {
      return true;
    },
    async mount() {
      calls.push("mount");
      if (fallback) throw new Error("unavailable");
      return true;
    },
    async unmount() {
      calls.push("unmount");
      return true;
    },
    async writeFile() {
      calls.push("write");
      return true;
    },
    async deleteFile(path: string) {
      calls.push("delete:" + path);
      return true;
    },
    async ffprobe(args: string[]) {
      calls.push(args.includes("keyframes.txt") ? "keyframes" : "probe");
      return 0;
    },
    async exec(args: string[]) {
      calls.push("exec");
      outputDuration = Number(args[args.indexOf("-t") + 1]);
      time?.({ progress: 0.001, time: 5e6 });
      return 0;
    },
    async readFile(path: string) {
      if (path === "source.json")
        return JSON.stringify({
          format: { format_name: "mov,mp4", duration: "30" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1280,
              height: 720,
              avg_frame_rate: "24/1",
            },
            { codec_type: "audio", codec_name: "aac" },
          ],
        });
      if (path === "keyframes.txt")
        return [0, 10, 20].map((n) => `pts_time=${n}|flags=K_`).join("\n");
      if (path === "output.json")
        return JSON.stringify({
          format: { duration: String(outputDuration) },
          streams: [
            { codec_type: "video", codec_name: "h264" },
            { codec_type: "audio", codec_name: "aac" },
          ],
        });
      return new Uint8Array([0, 0, 1]);
    },
  };
  return { worker: worker as unknown as FFmpegWorker, calls };
}
test("reuses one worker/source mount across clips and releases it on source replacement", async () => {
  Object.defineProperty(globalThis, "location", {
    value: { origin: "http://localhost" },
    configurable: true,
  });
  const { worker, calls } = fixture(),
    engine = new BrowserVideoEngine(async () => worker);
  const source = new File(["video"], "sample.mp4", { type: "video/mp4" });
  await engine.initialize();
  for (const start of [0, 10])
    await engine.process(source, {
      range: { start, end: start + 10 },
      compression: "off",
      cutStrategy: "fast",
      outputName: "clip.mp4",
    });
  await engine.initialize();
  assert.equal(calls.filter((x) => x === "load").length, 1);
  assert.equal(calls.filter((x) => x === "mount").length, 1);
  assert.equal(calls.filter((x) => x === "keyframes").length, 1);
  assert.equal(calls.filter((x) => x === "write").length, 0);
  assert.equal(calls.filter((x) => x === "delete:output.mp4").length, 2);
  await engine.process(new File(["new video"], "new.mp4"), {
    range: { start: 0, end: 10 },
    compression: "balanced",
    cutStrategy: "precision",
    outputName: "clip.mp4",
  });
  assert.equal(calls.filter((x) => x === "unmount").length, 1);
  await engine.dispose();
  assert.equal(worker.loaded, false);
});
test("unsupported WORKERFS falls back to one source transfer, not one per clip", async () => {
  const { worker, calls } = fixture(true),
    engine = new BrowserVideoEngine(async () => worker);
  const source = new File(["video"], "sample.mp4");
  await engine.initialize();
  for (const start of [0, 10])
    await engine.process(source, {
      range: { start, end: start + 10 },
      compression: "off",
      outputName: "clip.mp4",
    });
  assert.equal(calls.filter((x) => x === "write").length, 1);
  await engine.dispose();
});
test("aborted jobs cannot produce a clip; Fast Cut never silently compresses", async () => {
  const { worker } = fixture(),
    engine = new BrowserVideoEngine(async () => worker);
  await engine.initialize();
  const abort = new AbortController();
  abort.abort();
  const file = new File(["video"], "sample.mp4");
  await assert.rejects(
    engine.process(
      file,
      {
        range: { start: 0, end: 10 },
        compression: "off",
        outputName: "clip.mp4",
      },
      abort.signal,
    ),
    { name: "AbortError" },
  );
  await assert.rejects(
    engine.process(file, {
      range: { start: 0, end: 10 },
      compression: "balanced",
      cutStrategy: "fast",
      outputName: "clip.mp4",
    }),
    /Fast Cut requires/,
  );
  await engine.dispose();
});

test("core ffprobe ret=-1 is accepted only with fresh valid output metadata", async () => {
  const { worker } = fixture();
  worker.ffprobe = async () => -1;
  const engine = new BrowserVideoEngine(async () => worker);
  await engine.initialize();
  const original = worker.readFile.bind(worker);
  worker.readFile = async (path) =>
    path === "output.json"
      ? JSON.stringify({ format: { duration: "NaN" } })
      : original(path);
  await assert.rejects(
    engine.process(new File(["video"], "x.mp4"), {
      range: { start: 0, end: 10 },
      compression: "off",
      outputName: "x.mp4",
    }),
    /Invalid MP4/,
  );
  await engine.dispose();
});

test("inspection and repeated jobs reuse one metadata probe without decoding or rebuilding the worker", async () => {
  const { worker, calls } = fixture();
  const engine = new BrowserVideoEngine(async () => worker);
  await engine.initialize();
  const file = new File(["video"], "x.mp4");
  const info = await engine.inspect(file);
  assert.equal(info.width, 1280);
  assert.equal(info.height, 720);
  assert.equal(info.frameRate, 24);
  assert.equal(info.videoCodec, "h264");
  assert.equal(info.audioCodec, "aac");
  assert.equal(info.compatible, true);
  await engine.inspect(file);
  assert.equal(calls.filter((x) => x === "probe").length, 1);
  assert.ok(!calls.includes("exec"));
  assert.ok(!calls.includes("keyframes"));
  await engine.process(file, {
    range: { start: 0, end: 10 },
    compression: "off",
    outputName: "x.mp4",
  });
  assert.equal(calls.filter((x) => x === "mount").length, 1);
  assert.equal(calls.filter((x) => x === "keyframes").length, 1);
  await engine.dispose();
});
test("incompatible Fast Cut explains its codec and never starts an encode fallback", async () => {
  const { worker, calls } = fixture();
  const read = worker.readFile.bind(worker);
  worker.readFile = async (path) =>
    path === "source.json"
      ? JSON.stringify({
          format: { format_name: "mov,mp4", duration: "30" },
          streams: [
            {
              codec_type: "video",
              codec_name: "hevc",
              width: 1920,
              height: 1080,
              avg_frame_rate: "30/1",
            },
          ],
        })
      : read(path);
  const engine = new BrowserVideoEngine(async () => worker);
  await engine.initialize();
  const file = new File(["video"], "hevc.mp4");
  const info = await engine.inspect(file);
  assert.equal(info.compatible, false);
  assert.match(info.incompatibility!, /hevc/);
  await assert.rejects(
    engine.process(file, {
      range: { start: 0, end: 10 },
      compression: "off",
      outputName: "x.mp4",
    }),
    /hevc.*Precision/,
  );
  assert.ok(!calls.includes("exec"));
  assert.equal(worker.loaded, false);
});
test("failed source inspection cannot poison the retained metadata cache", async () => {
  const { worker, calls } = fixture();
  const read = worker.readFile.bind(worker);
  let bad = true;
  worker.readFile = async (path) =>
    path === "source.json" && bad ? "{}" : read(path);
  const engine = new BrowserVideoEngine(async () => worker);
  await engine.initialize();
  const file = new File(["video"], "x.mp4");
  await assert.rejects(engine.inspect(file), /duration/);
  bad = false;
  const info = await engine.inspect(file);
  assert.equal(info.compatible, true);
  assert.equal(calls.filter((x) => x === "mount").length, 2);
  await engine.dispose();
});

test("long sources scan only the requested window and preserve input-side seek", async () => {
  const { worker } = fixture();
  const read = worker.readFile.bind(worker);
  worker.readFile = async (path) =>
    path === "source.json"
      ? JSON.stringify({
          format: { format_name: "mov,mp4", duration: "6791.168" },
          streams: [{ codec_type: "video", codec_name: "h264" }],
        })
      : path === "keyframes.txt"
        ? "pts_time=0|flags=K_\npts_time=150|flags=K_"
        : read(path);
  let scan: string[] = [],
    encode: string[] = [];
  worker.ffprobe = async (args) => {
    if (args.includes("keyframes.txt")) scan = args;
    return 0;
  };
  const exec = worker.exec.bind(worker);
  worker.exec = async (args) => {
    encode = args;
    return exec(args);
  };
  const engine = new BrowserVideoEngine(async () => worker);
  await engine.initialize();
  await engine.process(new File(["source"], "long.mp4"), {
    range: { start: 0, end: 150 },
    compression: "off",
    outputName: "clip.mp4",
  });
  assert.equal(scan[scan.indexOf("-read_intervals") + 1], "0%151");
  assert.ok(!scan.includes("-show_frames"));
  assert.ok(encode.indexOf("-ss") < encode.indexOf("-i"));
  assert.equal(encode[encode.indexOf("-t") + 1], "150");
  assert.equal(encode[encode.indexOf("-c") + 1], "copy");
  await engine.dispose();
});
test("probe failures do not claim unsupported codecs; malformed MP4 headers have a distinct error", async () => {
  for (const malformed of [false, true]) {
    const { worker } = fixture();
    let log: ((event: { message: string }) => void) | undefined;
    const on = worker.on.bind(worker);
    worker.on = ((event: string, cb: unknown) => {
      if (event === "log") log = cb as typeof log;
      else on(event as "progress", cb as never);
    }) as typeof worker.on;
    worker.ffprobe = async () => {
      if (malformed) log?.({ message: "moov atom not found" });
      return 1;
    };
    const engine = new BrowserVideoEngine(async () => worker);
    await engine.initialize();
    await assert.rejects(
      engine.inspect(new File(["bad"], "damaged.mp4")),
      malformed
        ? /Malformed.*container header/
        : /Media probe failed.*compatibility is unknown/,
    );
    await engine.dispose();
  }
});
