// Investigation only: HEVC remux output is not exposed as standard H.264 export.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { execFileSync } from "node:child_process";
const root = resolve("public"),
  source = process.argv[2] ?? "/tmp/econtent-import-fixtures/hevc-aac.mp4";
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/") {
      res.setHeader("content-type", "text/html");
      res.end('<input id="source" type="file">');
      return;
    }
    const file = resolve(root, "." + path);
    if (!file.startsWith(root + "/")) throw Error();
    res.setHeader(
      "content-type",
      extname(file) === ".wasm" ? "application/wasm" : "application/javascript",
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator("#source").setInputFiles(source);
  const result = await page.evaluate(async () => {
    const { FFmpeg } = await import("/ffmpeg/ffmpeg/index.js");
    const ff = new FFmpeg();
    await ff.load({
      coreURL: location.origin + "/ffmpeg/core/ffmpeg-core.js",
      wasmURL: location.origin + "/ffmpeg/core/ffmpeg-core.wasm",
    });
    await ff.createDir("/source");
    const source = document.querySelector("#source").files[0];
    await ff.mount(
      "WORKERFS",
      { files: [new File([source], "input")] },
      "/source",
    );
    const started = performance.now();
    const exit = await ff.exec([
      "-ss",
      "0",
      "-i",
      "/source/input",
      "-t",
      "4",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c",
      "copy",
      "-tag:v",
      "hvc1",
      "-avoid_negative_ts",
      "make_zero",
      "-movflags",
      "+faststart",
      "-y",
      "hevc.mp4",
    ]);
    if (exit !== 0) throw Error("HEVC remux failed");
    const bytes = await ff.readFile("hevc.mp4");
    window.blob = new Blob([bytes], { type: "video/mp4" });
    const ms = performance.now() - started;
    ff.terminate();
    const video = document.createElement("video");
    video.muted = true;
    video.src = URL.createObjectURL(window.blob);
    document.body.append(video);
    const playback = await Promise.race([
      new Promise((resolve) => {
        video.onloadeddata = async () => {
          try {
            await video.play();
            setTimeout(
              () =>
                resolve({
                  played:
                    video.currentTime > 0 &&
                    video.videoWidth > 0 &&
                    video.getVideoPlaybackQuality().totalVideoFrames > 0,
                  currentTime: video.currentTime,
                  duration: video.duration,
                  videoWidth: video.videoWidth,
                  videoHeight: video.videoHeight,
                  decodedFrames:
                    video.getVideoPlaybackQuality().totalVideoFrames,
                }),
              500,
            );
          } catch {
            resolve({ played: false, error: "play() rejected" });
          }
        };
        video.onerror = () =>
          resolve({
            played: false,
            errorCode: video.error?.code,
            error: video.error?.message,
          });
      }),
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ played: false, error: "playback timeout" }),
          10000,
        ),
      ),
    ]);
    return {
      ms,
      bytes: bytes.byteLength,
      codecTag: "hvc1",
      canPlayType: video.canPlayType('video/mp4; codecs="hvc1"'),
      playback,
    };
  });
  await mkdir("test-results/universal/outputs", { recursive: true });
  const pending = page.waitForEvent("download");
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(window.blob);
    a.download = "hevc-remux.mp4";
    a.click();
  });
  const output = "test-results/universal/outputs/hevc-remux-investigation.mp4";
  await (await pending).saveAs(output);
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
      { encoding: "utf8" },
    ),
  );
  if (probe.streams[0].codec_name !== "hevc") throw Error("Unexpected codec");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    output,
    "-fps_mode",
    "passthrough",
    "-enc_time_base:v",
    "1:1000000",
    "-f",
    "null",
    "-",
  ]);
  const report = {
    browser: browser.version(),
    ...result,
    nativeDecodePassed: true,
    videoCodec: probe.streams[0].codec_name,
    audioCodec: probe.streams[1]?.codec_name,
    duration: Number(probe.format.duration),
    note: "Valid HEVC MP4 remux is not H.264 output, and one desktop playback result does not establish Android/device compatibility. Investigation only; unavailable as a product export target.",
  };
  await writeFile(
    "docs/benchmarks/hevc-remux.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
