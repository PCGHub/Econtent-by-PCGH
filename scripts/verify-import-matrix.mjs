import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createImportFixtures } from "./create-import-fixtures.mjs";
const root = process.cwd(),
  dir = process.argv[2] ?? "/tmp/econtent-import-fixtures",
  reportPath = process.argv[3] ?? "test-results/import-matrix.json";
const cases = existsSync(join(dir, "manifest.json"))
  ? JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"))
  : createImportFixtures(dir);
const out = join(root, "test-results/universal/outputs");
await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/") {
      res.setHeader("content-type", "text/html");
      res.end('<input type="file" id="source">');
      return;
    }
    const base = path.startsWith("/ffmpeg/")
      ? join(root, "public")
      : join(root, "test-results/universal/site");
    const file = resolve(base, "." + path);
    if (!file.startsWith(base + "/")) throw Error();
    res.setHeader(
      "content-type",
      extname(file) === ".wasm" ? "application/wasm" : extname(file) === ".json" ? "application/json" : "application/javascript",
    );
    if(path.includes('/releases/')){res.setHeader('Cache-Control','public,max-age=31536000,immutable');if(path.endsWith('.wasm'))res.setHeader('Content-Encoding','br')}
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  ...(process.env.ECONTENT_CHROMIUM_PATH
    ? { executablePath: process.env.ECONTENT_CHROMIUM_PATH }
    : {}),
  args: ["--enable-precise-memory-info"],
});
const page = await browser.newPage();
const reports = [];
let peakRSSKiB = 0;
function sample() {
  try {
    const rows = execFileSync("ps", ["-eo", "pid=,ppid=,rss="], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .map((s) => s.trim().split(/\s+/));
    const children = new Set([String(process.pid)]);
    for (let n = 0; n < 8; n++)
      for (const [pid, ppid] of rows) if (children.has(ppid)) children.add(pid);
    peakRSSKiB = Math.max(
      peakRSSKiB,
      rows
        .filter(([pid]) => children.has(pid))
        .reduce((n, [, , rss]) => n + Number(rss), 0),
    );
  } catch {}
}
const timer = setInterval(sample, 250);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const setup = await page.evaluate(async () => {
    const { BrowserVideoEngine } = await import("/engine/ffmpeg-browser.js");
    window.engine = new BrowserVideoEngine();
    const start = performance.now();
    await window.engine.initialize();
    const ff = window.engine.ffmpeg;
    const read = ff.readFile.bind(ff);
    ff.readFile = async (path) => {
      const data = await read(path);
      if (path === "output.json")
        window.outputProbe = JSON.parse(
          typeof data === "string" ? data : new TextDecoder().decode(data),
        );
      return data;
    };
    return {
      loadMs: performance.now() - start,
      capabilities: window.engine.capabilities,
    };
  });
  for (const item of cases) {
    peakRSSKiB = 0;
    await page.locator("#source").setInputFiles(join(dir, item.name));
    const result = await page.evaluate(async () => {
      const source = document.querySelector("#source").files[0],
        engine = window.engine;
      let started = performance.now();
      const info = await engine.inspect(source);
      const inspectionMs = performance.now() - started;
      const method =
        source.name.startsWith("vfr-") && info.conversion?.available
          ? "precision"
          : info.compatible
            ? "fast"
            : info.conversion?.available && info.conversion.audioOnly
              ? "audio-only"
              : info.conversion?.available
                ? "precision"
                : "unsupported";
      if (method === "unsupported") return { info, inspectionMs, method };
      started = performance.now();
      let clip;
      try {
        clip = await engine.process(source, {
          range: { start: 2.25, end: 6.25 },
          compression: "off",
          cutStrategy: method === "precision" ? "precision" : "fast",
          convertAudio: method === "audio-only",
          outputName: "clip.mp4",
        });
      } catch (error) {
        return {
          info,
          inspectionMs,
          method,
          error: String(error),
          outputProbe: window.outputProbe,
        };
      }
      if (
        window.outputProbe?.packets ||
        window.outputProbe?.frames ||
        window.outputProbe?.packets_and_frames
      )
        throw Error("Metadata probe leaked packet/frame enumeration state");
      window.lastBlob = clip.blob;
      return {
        info,
        inspectionMs,
        method,
        processMs: performance.now() - started,
        alignedRange: clip.alignedRange,
        duration: clip.outputDuration,
        bytes: clip.blob.size,
        sourceAccess: engine.sourceAccess,
        heap: performance.memory?.usedJSHeapSize,
      };
    });
    sample();
    result.peakProcessTreeRSSKiB = peakRSSKiB;
    if (result.error)
      throw Error(JSON.stringify({ source: item.name, ...result }));
    if (result.method !== "unsupported") {
      const pending = page.waitForEvent("download");
      await page.evaluate(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(window.lastBlob);
        a.download = "clip.mp4";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      const file = join(out, item.name + ".mp4");
      await (await pending).saveAs(file);
      const probe = JSON.parse(
        execFileSync(
          "ffprobe",
          ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
          { encoding: "utf8" },
        ),
      );
      const video = probe.streams.find((s) => s.codec_type === "video"),
        audio = probe.streams.find((s) => s.codec_type === "audio");
      if (
        video?.codec_name !== "h264" ||
        video.pix_fmt !== "yuv420p" ||
        (item.audio ? audio?.codec_name !== "aac" : !!audio)
      )
        throw Error("Invalid output codec for " + item.name);
      if (
        audio &&
        Math.abs(Number(audio.start_time) - Number(video.start_time)) > 0.15
      )
        throw Error("A/V timestamp start mismatch for " + item.name);
      if (
        result.method === "precision" &&
        Math.abs(Number(probe.format.duration) - 4) > 0.1
      )
        throw Error("Invalid precision duration for " + item.name);
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-xerror",
        "-i",
        file,
        "-fps_mode",
        "passthrough",
        "-enc_time_base:v",
        "1:1000000",
        "-f",
        "null",
        "-",
      ]);
      result.validation = {
        decoded: true,
        video: video.codec_name,
        audio: audio?.codec_name,
        pixelFormat: video.pix_fmt,
        width: video.width,
        height: video.height,
        duration: Number(probe.format.duration),
        videoStart: Number(video.start_time),
        audioStart: audio ? Number(audio.start_time) : undefined,
        audioDuration: audio ? Number(audio.duration) : undefined,
      };
    }
    reports.push({ source: item.name, ...result });
    console.log(
      JSON.stringify({
        source: item.name,
        method: result.method,
        ms: result.processMs,
        reason: result.info.conversion?.reason,
      }),
    );
  }
  // Verify why native AV1 registration is not advertised as software conversion support.
  await page.locator("#source").setInputFiles(join(dir, "av1-opus.mkv"));
  const av1Experiment = await page.evaluate(async () => {
    const source = document.querySelector("#source").files[0];
    await window.engine.inspect(source);
    const ff = window.engine.ffmpeg;
    const logs = [];
    ff.on("log", ({ message }) => logs.push(message));
    const code = await ff.exec([
      "-ss",
      "2.25",
      "-i",
      window.engine.input,
      "-t",
      "1",
      "-map",
      "0:v:0",
      "-an",
      "-f",
      "null",
      "-",
    ]);
    return {
      exit: code,
      diagnostic: logs
        .filter((s) =>
          /hardware|decoder|implementation|Error|Failed|decode/i.test(s),
        )
        .slice(-12),
    };
  });
  await page.locator("#source").setInputFiles(join(dir, "h264-aac.mp4"));
  const outputBudgetExperiment = await page.evaluate(async () => {
    const source = document.querySelector("#source").files[0];
    let message;
    try {
      await window.engine.process(source, {
        range: { start: 0, end: 6 },
        compression: "off",
        cutStrategy: "precision",
        maxOutputBytes: 4096,
        outputName: "limited.mp4",
      });
      throw Error("Unexpected successful limited export");
    } catch (error) {
      message = String(error);
      if (!message.includes("Output memory safety limit")) throw error;
    }
    return { rejected: true, reason: message };
  });
  await page.evaluate(() => window.engine.dispose());
  const report = {
    coreSha256: createHash("sha256")
      .update(await readFile("public/ffmpeg/core/ffmpeg-core.wasm"))
      .digest("hex"),
    coreVersion: "0.12.10",
    wrapperVersion: "0.12.15",
    browser: browser.version(),
    host: { platform: process.platform, architecture: process.arch },
    method:
      "Desktop single trials, selected range2.25-6.25s from8s synthetic files, core load excluded per process time, approximate summed process-tree RSS double-counts shared pages; no Android hardware.",
    ...setup,
    cases: reports,
    av1Experiment,
    outputBudgetExperiment,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
} finally {
  clearInterval(timer);
  await browser.close();
  await new Promise((r) => server.close(r));
}
