import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const runs = [];
for (const version of ["import-before", "import-after"]) {
  const name = version + "-precision-off-hevc-long";
  const raw = JSON.parse(
    await readFile("test-results/performance/" + name + ".json", "utf8"),
  );
  const clips = [];
  for (const [i, clip] of raw.clips.entries()) {
    const path = `test-results/performance/outputs/${name}/clip-${i + 1}.mp4`;
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-xerror",
      "-i",
      path,
      "-fps_mode",
      "passthrough",
      "-enc_time_base:v",
      "1:1000000",
      "-f",
      "null",
      "-",
    ]);
    const frame = (file, time) =>
      execFileSync(
        "ffmpeg",
        [
          "-v",
          "error",
          ...(time === undefined
            ? []
            : ["-seek_timestamp", "1", "-ss", String(time)]),
          "-i",
          file,
          "-map",
          "0:v:0",
          "-frames:v",
          "1",
          "-pix_fmt",
          "yuv420p",
          "-f",
          "rawvideo",
          "-",
        ],
        { maxBuffer: 4 * 1024 * 1024 },
      );
    const ref = frame("/tmp/econtent-hevc-long.mp4", clip.range.start),
      actual = frame(path);
    if (ref.length !== actual.length)
      throw Error("First-frame dimensions differ");
    let mse = 0;
    for (let n = 0; n < ref.length; n++) mse += (ref[n] - actual[n]) ** 2;
    const psnr =
      mse === 0 ? Infinity : 10 * Math.log10(255 ** 2 / (mse / ref.length));
    if (psnr < 35)
      throw Error("Long trim first-frame accuracy failed: " + psnr);
    clips.push({
      ...clip,
      firstFramePSNR: Number.isFinite(psnr) ? psnr : "identical",
      fullyDecoded: true,
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    });
  }
  const {
    browserVersion,
    platform,
    architecture,
    loadMs,
    processingMs,
    io,
    peakProcessTreeRSSKiB,
    processTreeCPUSeconds,
    jsHeapBytes,
  } = raw;
  runs.push({
    version,
    browserVersion,
    platform,
    architecture,
    loadMs,
    processingMs,
    io,
    peakProcessTreeRSSKiB,
    processTreeCPUSeconds,
    jsHeapBytes,
    clips,
  });
}
const report = {
  fixture: {
    codec: "hevc",
    audio: "aac",
    width: 1152,
    height: 480,
    fps: 24,
    durationSeconds: 6791.280518,
    bytes: 238333231,
    generation:
      "30s testsrc2 + sine, libx265 ultrafast240k/pools=none/frame-threads=1, AAC32k; stream-loop/copy to6791.168s. Synthetic, not customer footage.",
  },
  method:
    "Same desktop Linux x64 Chromium154,2-core CPU quota,8GiB host memory cap, single-thread core0.12.10. Single trials, requested ranges0-150 and5400-5550. Times include source preparation and output verification/read, exclude core loading, fingerprinting and downloads/ZIP. Approximate summed process-tree RSS double-counts shared pages. No Android hardware or speed claim.",
  beforeCommit: "9f075e7a12eda22d6b721c09bb0f022233876998",
  runs,
};
await writeFile(
  "docs/benchmarks/hevc-long-import.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log("Verified4 long HEVC conversion outputs; summary written.");
