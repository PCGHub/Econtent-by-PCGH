// Run sequentially on an otherwise idle host. No Android result is implied.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const [version = "baseline", directory = "/tmp/econtent-mobile-bench"] =
  process.argv.slice(2);
if (!["baseline", "optimized"].includes(version))
  throw new Error("Use baseline or optimized");
mkdirSync("test-results/performance", { recursive: true });
for (const name of ["10mb", "30mb", "70mb", "110mb"]) {
  const file = directory + "/" + name + ".mp4";
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_format", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
  const duration = Number(probe.format.duration);
  const ranges = [];
  for (let start = 0; start < duration - 0.001; start += 30)
    ranges.push([start, Math.min(start + 30, duration)]);
  for (const [mode, selected, label] of [
    ["fast", ranges, name],
    ["precision", [[1.25, 31.25]], name],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/benchmark-video.mjs",
        version,
        file,
        mode,
        "off",
        JSON.stringify(selected),
      ],
      {
        env: { ...process.env, ECONTENT_BENCH_LABEL: label },
        stdio: "inherit",
      },
    );
    if (result.status !== 0)
      throw new Error("Benchmark failed: " + version + " " + name + " " + mode);
  }
}
if (version === "optimized") {
  // Full seven-clip mobile-report-sized workload; discard only the short remainder.
  const ranges = Array.from({ length: 7 }, (_, i) => [i * 30, (i + 1) * 30]);
  const result = spawnSync(
    process.execPath,
    [
      "scripts/benchmark-video.mjs",
      version,
      directory + "/30mb.mp4",
      "precision",
      "off",
      JSON.stringify(ranges),
    ],
    {
      env: { ...process.env, ECONTENT_BENCH_LABEL: "30mb-seven" },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) throw new Error("Full precision job failed");
  const copy=spawnSync(process.execPath,['scripts/benchmark-video.mjs',version,directory+'/30mb.mp4','fast','off',JSON.stringify(ranges)],{env:{...process.env,ECONTENT_BENCH_LABEL:'30mb-seven'},stdio:'inherit'});
  if(copy.status!==0)throw new Error('Full Fast job failed');
}
