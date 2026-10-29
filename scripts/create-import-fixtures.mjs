import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
export function createImportFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const cases = [
    {
      name: "h264-aac.mp4",
      video: "h264",
      audio: "aac",
      v: "libx264",
      a: "aac",
    },
    {
      name: "hevc-aac.mp4",
      video: "hevc",
      audio: "aac",
      v: "libx265",
      a: "aac",
    },
    {
      name: "hevc-main10.mp4",
      video: "hevc",
      audio: "aac",
      v: "libx265",
      a: "aac",
      pixFmt: "yuv420p10le",
    },
    {
      name: "hevc-hdr.mp4",
      video: "hevc",
      audio: "aac",
      v: "libx265",
      a: "aac",
      pixFmt: "yuv420p10le",
      hdr: true,
    },
    {
      name: "vp9-opus.webm",
      video: "vp9",
      audio: "opus",
      v: "libvpx-vp9",
      a: "libopus",
    },
    {
      name: "vp8-vorbis.webm",
      video: "vp8",
      audio: "vorbis",
      v: "libvpx",
      a: "libvorbis",
    },
    {
      name: "av1-opus.mkv",
      video: "av1",
      audio: "opus",
      v: "libaom-av1",
      a: "libopus",
    },
    {
      name: "h264-aac.mkv",
      video: "h264",
      audio: "aac",
      v: "libx264",
      a: "aac",
    },
    {
      name: "h264-pcm.mov",
      video: "h264",
      audio: "pcm_s16le",
      v: "libx264",
      a: "pcm_s16le",
    },
    {
      name: "mpeg4-mp3.avi",
      video: "mpeg4",
      audio: "mp3",
      v: "mpeg4",
      a: "libmp3lame",
    },
    {
      name: "h264-mp3.mp4",
      video: "h264",
      audio: "mp3",
      v: "libx264",
      a: "libmp3lame",
    },
    {
      name: "h264-ac3.mkv",
      video: "h264",
      audio: "ac3",
      v: "libx264",
      a: "ac3",
    },
    {
      name: "flv-mp3.flv",
      video: "flv1",
      audio: "mp3",
      v: "flv",
      a: "libmp3lame",
    },
    {
      name: "wmv-wmav1.wmv",
      video: "wmv2",
      audio: "wmav1",
      v: "wmv2",
      a: "wmav1",
    },
    {
      name: "wmv-wmav2.wmv",
      video: "wmv2",
      audio: "wmav2",
      v: "wmv2",
      a: "wmav2",
    },
    {
      name: "mpeg2-mp2.mpg",
      video: "mpeg2video",
      audio: "mp2",
      v: "mpeg2video",
      a: "mp2",
    },
    {
      name: "mpeg4-aac.3gp",
      video: "mpeg4",
      audio: "aac",
      v: "mpeg4",
      a: "aac",
    },
    {
      name: "h264-aac.avi",
      video: "h264",
      audio: "aac",
      v: "libx264",
      a: "aac",
    },
    {
      name: "h264-aac.flv",
      video: "h264",
      audio: "aac",
      v: "libx264",
      a: "aac",
    },
    {
      name: "h264-aac.ts",
      video: "h264",
      audio: "aac",
      v: "libx264",
      a: "aac",
    },
    {
      name: "vfr-h264-aac.mp4",
      video: "h264",
      audio: "aac",
      v: "libx264",
      a: "aac",
      vfr: true,
    },
    { name: "h264-silent.mp4", video: "h264", v: "libx264" },
  ];
  for (const item of cases) {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=24",
    ];
    if (item.a)
      args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000");
    args.push(
      "-t",
      "8",
      "-c:v",
      item.v,
      "-pix_fmt",
      item.pixFmt ?? "yuv420p",
      "-g",
      "48",
    );
    if (item.v === "libx264")
      args.push("-preset", "ultrafast", "-sc_threshold", "0");
    if (item.v === "libx265")
      args.push(
        "-preset",
        "ultrafast",
        "-x265-params",
        "pools=none:frame-threads=1:log-level=error" +
          (item.hdr
            ? ":colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc"
            : ""),
      );
    if (item.v.startsWith("libvpx"))
      args.push("-deadline", "realtime", "-cpu-used", "8");
    if (item.v === "libaom-av1")
      args.push("-cpu-used", "8", "-threads", "2", "-crf", "40", "-b:v", "0");
    if (item.vfr)
      args.push(
        "-vf",
        "select='if(lt(t,4),not(mod(n,2)),1)'",
        "-fps_mode",
        "vfr",
      );
    if (item.hdr)
      args.push(
        "-color_trc",
        "smpte2084",
        "-color_primaries",
        "bt2020",
        "-colorspace",
        "bt2020nc",
      );
    if (item.a) args.push("-c:a", item.a);
    if (item.a === "libmp3lame") args.push("-ar", "44100");
    args.push(join(dir, item.name));
    execFileSync("ffmpeg", args, { stdio: "pipe" });
  }
  const manifest = cases.map(({ name, video, audio }) => ({
    name,
    video,
    audio,
  }));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(
    JSON.stringify(
      createImportFixtures(process.argv[2] ?? "/tmp/econtent-import-fixtures"),
      null,
      2,
    ),
  );
