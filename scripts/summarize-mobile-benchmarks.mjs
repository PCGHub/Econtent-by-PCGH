import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const names = ["10mb", "30mb", "70mb", "110mb"];
const rows = [];
for (const name of names) {
  const source = "/tmp/econtent-mobile-bench/" + name + ".mp4";
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", source],
      { encoding: "utf8" },
    ),
  );
  const video = probe.streams.find((s) => s.codec_type === "video");
  const row = {
    fixture: name,
    input: {
      bytes: Number(probe.format.size),
      duration: Number(probe.format.duration),
      width: video.width,
      height: video.height,
      frameRate: video.avg_frame_rate,
      video: video.codec_name,
      audio: probe.streams.find((s) => s.codec_type === "audio")?.codec_name,
    },
    runs: [],
  };
  for (const mode of ["fast", "precision"])
    for (const version of ["baseline", "optimized"]) {
      const r = JSON.parse(
        readFileSync(
          `test-results/performance/${version}-${mode}-off-${name}.json`,
          "utf8",
        ),
      );
      row.runs.push({
        version,
        mode,
        rangeType:
          mode === "fast"
            ? "full-source-30-second-targets"
            : "one-30-second-range",
        ranges: r.ranges,
        clips: r.clips.length,
        loadMs: r.loadMs,
        processingMs: r.processingMs,
        cpuSeconds: r.processTreeCPUSeconds,
        peakSummedRSSMiB: r.peakProcessTreeRSSKiB / 1024,
        mounts: r.io.mounts,
        fullSourceWrites: r.io.writes,
        outputBytes: r.clips.reduce((sum, clip) => sum + clip.size, 0),
        outputDurations: r.clips.map((clip) => clip.probe.duration),
      });
    }
  rows.push(row);
}
const full = JSON.parse(
  readFileSync(
    "test-results/performance/optimized-precision-off-30mb-seven.json",
    "utf8",
  ),
);
const verification = JSON.parse(
  readFileSync("test-results/performance/output-verification.json", "utf8"),
);
const report = {
  baselineCommit: "3de6253c8c17281e8730c6dccf154ad3daa3d08c",
  browser: full.browserVersion,
  platform: full.platform,
  architecture: full.architecture,
  cpuQuota: "2 cores",
  memoryLimitGiB: 8,
  realAndroidTested: false,
  trialsPerCase: 1,
  precisionOffBefore: "CRF18/fast",
  precisionOffAfter: "CRF18/ultrafast",
  compressionPresetsChanged: false,
  measurement:
    "process calls including prepare/probe/read; excludes initial load, downloads and ZIP; RSS sums shared pages across processes",
  rows,
  fullSevenClipPrecision: {
    inputBytes: rows.find((row) => row.fixture === "30mb").input.bytes,
    processingMs: full.processingMs,
    loadMs: full.loadMs,
    peakSummedRSSMiB: full.peakProcessTreeRSSKiB / 1024,
    cpuSeconds: full.processTreeCPUSeconds,
    outputBytes: full.clips.reduce((sum, clip) => sum + clip.size, 0),
    outputDurations: full.clips.map((clip) => clip.probe.duration),
  },
  outputVerification: {
    decodedOutputs: verification.length,
    precisionOutputs: verification.filter((v) => v.report.includes("precision"))
      .length,
    precisionMaxDurationError: Math.max(
      ...verification
        .filter((v) => v.report.includes("precision"))
        .map((v) =>
          Math.abs(v.outputDuration - (v.requested.end - v.requested.start)),
        ),
    ),
    precisionFirstFrameMinPSNRdB: Math.min(
      ...verification
        .filter(
          (v) =>
            v.report.includes("precision") &&
            typeof v.firstFramePSNRdB === "number",
        )
        .map((v) => v.firstFramePSNRdB),
    ),
    fastOutputs: verification.filter((v) => v.report.includes("fast")).length,
    fastFirstFramesIdentical: verification
      .filter((v) => v.report.includes("fast"))
      .every((v) => v.firstFramePSNRdB === "identical"),
    fastMaxPacketOffsetSpreadMs: Math.max(
      ...verification
        .filter((v) => v.report.includes("fast"))
        .map((v) => v.timestampOffsetSpreadMs),
    ),
    rawDetails:
      "test-results/performance/output-verification.json (reproducible; not committed)",
  },
};
mkdirSync("docs/benchmarks", { recursive: true });
writeFileSync(
  "docs/benchmarks/mobile-processing.json",
  JSON.stringify(report, null, 2) + "\n",
);
for (const row of rows) {
  const find = (version, mode) =>
    row.runs.find((run) => run.version === version && run.mode === mode);
  console.log(
    JSON.stringify({
      fixture: row.fixture,
      bytes: row.input.bytes,
      fastSeconds: [
        find("baseline", "fast").processingMs / 1000,
        find("optimized", "fast").processingMs / 1000,
      ],
      precision30Seconds: [
        find("baseline", "precision").processingMs / 1000,
        find("optimized", "precision").processingMs / 1000,
      ],
      precisionOutputMB: [
        find("baseline", "precision").outputBytes / 1e6,
        find("optimized", "precision").outputBytes / 1e6,
      ],
    }),
  );
}
console.log(
  JSON.stringify({
    fullSeven: report.fullSevenClipPrecision,
    outputsVerified: verification.length,
  }),
);
