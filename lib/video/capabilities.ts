import type { ProbeStream } from "./compatibility";
export interface CoreCapabilities {
  decoders: Record<string, string[]>;
  encoders: string[];
  muxers: string[];
}
export interface ConversionCapability {
  available: boolean;
  reason?: string;
  videoDecoder?: string;
  audioDecoder?: string;
  audioOnly: boolean;
  precisionLoss?: string;
  omittedTracks: boolean;
}
/** Parse the actual loaded core's CLI inventory, including decoder aliases. */
export function parseCodecs(text: string): Record<string, string[]> {
  const codecs: Record<string, string[]> = {};
  for (const line of text.split("\n")) {
    const match =
      /^\s*[VAS][A-Z.]{5}\s+([a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)?)\s+(.+)$/.exec(
        line,
      );
    if (!match) continue;
    const [, name, description] = match;
    const codec = /\(codec ([a-zA-Z0-9_]+)\)/.exec(description)?.[1] ?? name;
    (codecs[codec] ??= []).push(name);
  }
  return codecs;
}
export function parseMuxers(text: string): string[] {
  return text
    .split("\n")
    .flatMap(
      (line) => /^\s*E\s+([a-zA-Z0-9_,]+)\s+/.exec(line)?.[1].split(",") ?? [],
    );
}
export function conversionCapability(
  streams: ProbeStream[],
  core: CoreCapabilities,
): ConversionCapability {
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const base = {
    available: false,
    audioOnly: false,
    omittedTracks:
      streams.filter((s) => s.codec_type === "video").length > 1 ||
      streams.filter((s) => s.codec_type === "audio").length > 1 ||
      streams.some((s) => !["video", "audio"].includes(s.codec_type ?? "")),
  };
  const fail = (reason: string) => ({ ...base, reason });
  if (streams.some((s) => ["encv", "enca"].includes(s.codec_tag_string ?? "")))
    return fail(
      "Encrypted media is not supported. Re-export an authorized unencrypted source.",
    );
  if (!video?.codec_name)
    return fail(
      "No identified playable video track was found. Repair or re-export this file.",
    );
  if (video.disposition?.attached_pic)
    return fail(
      "The first video track is cover art. Re-export the desired video track before conversion.",
    );
  if (["smpte2084", "arib-std-b67"].includes(video.color_transfer ?? ""))
    return fail(
      "HDR/PQ/HLG conversion requires verified tone mapping, which this editor does not provide. Export an SDR source first; no silent HDR or color reduction is applied.",
    );
  if (
    !core.muxers.includes("mp4") ||
    !core.encoders.includes("libx264") ||
    (audio && !core.encoders.includes("aac"))
  )
    return fail(
      "This loaded core lacks the required MP4 muxer or H.264/AAC encoder.",
    );
  const decoder = (codec: string) =>
    core.decoders[codec]?.includes(codec) ? codec : core.decoders[codec]?.[0];
  // The bundled native AV1 registration has no usable software decode implementation.
  const videoDecoder =
    video.codec_name === "av1"
      ? core.decoders.av1?.find((d) => ["libdav1d", "libaom-av1"].includes(d))
      : decoder(video.codec_name);
  if (!videoDecoder)
    return fail(
      `The loaded FFmpeg core has no usable software decoder for video codec ${video.codec_name}. Re-export to H.264/AAC with a trusted local converter.`,
    );
  const audioDecoder = audio?.codec_name
    ? decoder(audio.codec_name)
    : undefined;
  if (audio && !audioDecoder)
    return fail(
      `The loaded FFmpeg core has no decoder for audio codec ${audio.codec_name ?? "unknown"}. Audio will not be silently discarded; re-export compatible audio first.`,
    );
  return {
    ...base,
    available: true,
    videoDecoder,
    audioDecoder,
    audioOnly:
      video.codec_name === "h264" &&
      (!video.pix_fmt ||
        video.pix_fmt === "yuv420p" ||
        video.pix_fmt === "yuvj420p") &&
      !base.omittedTracks &&
      !!audio &&
      audio.codec_name !== "aac",
    precisionLoss:
      video.pix_fmt && !["yuv420p", "yuvj420p"].includes(video.pix_fmt)
        ? `Conversion changes ${video.pix_fmt} to 8-bit 4:2:0 H.264 for MP4 playback. It is lossy; source content is not downscaled and display aspect ratio is retained.`
        : undefined,
  };
}
