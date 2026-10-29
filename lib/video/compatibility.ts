/** Conservative MP4 stream-copy policy, separate from demux/probe success. */
export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  codec_tag_string?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  disposition?: { attached_pic?: number };
}
export type CompatibilityIssue =
  | "unsupported-codec"
  | "unsupported-container"
  | "unsupported-streams"
  | "incomplete-metadata";
export function fastCompatibility(
  container: string,
  streams: ProbeStream[],
): {
  compatible: boolean;
  incompatibility?: string;
  compatibilityIssue?: CompatibilityIssue;
} {
  const reject = (
    compatibilityIssue: CompatibilityIssue,
    incompatibility: string,
  ) => ({ compatible: false, compatibilityIssue, incompatibility });
  const videos = streams.filter((s) => s.codec_type === "video");
  const audios = streams.filter((s) => s.codec_type === "audio");
  const video = videos[0],
    audio = audios[0];
  if (!container || container === "unknown")
    return reject(
      "incomplete-metadata",
      "Probe could not identify the container. Compatibility is unknown; re-export or repair this source before retrying.",
    );
  if (!video?.codec_name || audios.some((s) => !s.codec_name))
    return reject(
      "incomplete-metadata",
      "Probe could not identify every selected codec. The file may have incomplete or damaged stream metadata. Re-export or repair it before retrying.",
    );
  if (streams.some((s) => ["encv", "enca"].includes(s.codec_tag_string ?? "")))
    return reject(
      "unsupported-streams",
      "Encrypted tracks cannot be processed by this browser editor. Use an authorized unencrypted source export.",
    );
  if (
    videos.length !== 1 ||
    audios.length > 1 ||
    video.disposition?.attached_pic ||
    streams.some((s) => !["video", "audio"].includes(s.codec_type ?? ""))
  )
    return reject(
      "unsupported-streams",
      "Fast Cut requires one video track, at most one audio track and no extra subtitle/data/attachment tracks. Re-export the desired tracks; Precision Cut exports only the first video and audio tracks.",
    );
  if (!container.split(",").some((c) => ["mov", "mp4", "matroska"].includes(c)))
    return reject(
      "unsupported-container",
      `Container ${container} has not been validated for MP4 stream-copy remuxing. Re-export as MP4/MOV or Matroska, or explicitly try Precision Cut if the source is decodable.`,
    );
  if (video.codec_name !== "h264")
    return reject(
      "unsupported-codec",
      `Detected video codec ${video.codec_name}. Fast Cut currently supports H.264 video for broadly playable MP4 outputs; this codec is not enabled for stream copy. Explicitly try Precision Cut to convert to H.264, or re-export from the original app. Decoder availability is not guaranteed.`,
    );
  if (audio && !["aac", "mp3"].includes(audio.codec_name!))
    return reject(
      "unsupported-codec",
      `Detected audio codec ${audio.codec_name}. Fast Cut supports AAC, MP3 or no audio in MP4. Explicitly try Precision Cut to convert audio to AAC, or re-export compatible audio.`,
    );
  return { compatible: true };
}

export class MediaInspectionError extends Error {
  readonly code: "probe-failed" | "malformed-metadata";
  constructor(code: "probe-failed" | "malformed-metadata", message: string) {
    super(
      `${code === "probe-failed" ? "Media probe failed" : "Malformed or incomplete media metadata"}: ${message}`,
    );
    this.code = code;
    this.name = "MediaInspectionError";
  }
}
