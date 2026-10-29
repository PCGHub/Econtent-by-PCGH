import type { ProcessOptions, TimeRange } from "./types";
import { defaultStrategy } from "./workload";
import { COMPRESSION_PRESETS } from "./presets";

export function encodingArgs(
  options: ProcessOptions,
  input = "input",
  timelineStart?: number,
  seekPreroll = 0,
): string[] {
  const { start, end } = options.range;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start
  )
    throw new RangeError("Invalid cut range");
  if (
    options.maxOutputBytes !== undefined &&
    (!Number.isSafeInteger(options.maxOutputBytes) ||
      options.maxOutputBytes < 1024 ||
      options.maxOutputBytes > 512 * 1048576)
  )
    throw new RangeError("Invalid output memory budget");
  const common = [
    "-t",
    String(end - start),
    ...(options.maxOutputBytes === undefined
      ? []
      : ["-fs", String(options.maxOutputBytes)]),
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
  ];
  // Input-side accurate seek discards only the preceding GOP, instead of decoding from zero per clip.
  if (timelineStart !== undefined && !Number.isFinite(timelineStart))
    throw new RangeError("Invalid source timeline");
  // Probe packet PTS is absolute. Avoid seeking just before a keyframe when audio has negative priming timestamps.
  const coarseStart = Math.max(0, start - seekPreroll);
  const seek =
    seekPreroll > 0
      ? [
          "-ss",
          String(coarseStart),
          "-i",
          input,
          "-ss",
          String(start - coarseStart),
        ]
      : [
          ...(timelineStart !== undefined ? ["-seek_timestamp", "1"] : []),
          "-ss",
          String(start + (timelineStart ?? 0)),
          "-i",
          input,
        ];
  if (defaultStrategy(options) === "fast") {
    if (options.compression !== "off")
      throw new Error(
        "Fast Cut requires compression Off. Choose Precision Cut to compress.",
      );
    return [
      ...seek,
      ...common,
      ...(options.convertAudio
        ? ["-c:v", "copy", "-c:a", "aac", "-b:a", "128k"]
        : ["-c", "copy"]),
      "-avoid_negative_ts",
      "make_zero",
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      "-nostats",
      "-y",
      "output.mp4",
    ];
  }
  const preset =
    options.compression === "off"
      ? { crf: 18, preset: "ultrafast" }
      : COMPRESSION_PRESETS[options.compression];
  if (!preset) throw new RangeError("Unknown compression preset");
  return [
    ...seek,
    ...common,
    "-c:v",
    "libx264",
    "-crf",
    String(preset.crf),
    "-preset",
    preset.preset,
    "-vf",
    "setsar=sar*w*ceil(h/2)*2/(h*ceil(w/2)*2):max=65535,pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-fps_mode",
    "vfr",
    "-progress",
    "pipe:1",
    "-nostats",
    "-y",
    "output.mp4",
  ];
}

/** Both boundaries use the same preceding-keyframe rule so consecutive splits don't overlap. */
export function alignFastRange(
  range: TimeRange,
  keyframes: number[],
  duration: number,
): TimeRange {
  if (!keyframes.length)
    throw new Error("Cannot find source keyframes. Use Precision Cut.");
  const before = (time: number) => {
    let lo = 0,
      hi = keyframes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (keyframes[mid] <= time + 1e-6) lo = mid + 1;
      else hi = mid;
    }
    return keyframes[Math.max(0, lo - 1)];
  };
  const start = before(range.start);
  const end =
    Math.abs(range.end - duration) < 0.05 ? duration : before(range.end);
  if (end <= start)
    throw new Error(
      "This range is shorter than the source keyframe spacing. Use Precision Cut or a longer range.",
    );
  return { start, end };
}
