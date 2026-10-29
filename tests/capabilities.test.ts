import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCodecs,
  parseMuxers,
  conversionCapability,
} from "../lib/video/capabilities";
import { encodingArgs } from "../lib/video/command";
const core = {
  decoders: {
    h264: ["h264"],
    hevc: ["hevc"],
    aac: ["aac"],
    mp3: ["mp3float"],
    opus: ["opus"],
    vp9: ["vp9"],
    av1: ["av1"],
  },
  encoders: ["libx264", "aac"],
  muxers: ["mp4"],
};
const v = { codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p" };
test("loaded inventory resolves codec aliases and excludes headings without guessing codecs", () => {
  const parsed = parseCodecs(
    " V..... = Video\n V....D av1 AV1\n V....D libdav1d dav1d (codec av1)\n A....D mp3float MP3 (codec mp3)\n V....D libx264 x264 (codec h264)\nAborted()",
  );
  assert.deepEqual(parsed.av1, ["av1", "libdav1d"]);
  assert.deepEqual(parsed.mp3, ["mp3float"]);
  assert.deepEqual(parsed.h264, ["libx264"]);
  assert.equal(parsed.Video, undefined);
  assert.deepEqual(
    parseMuxers(
      " E = Muxing supported\n  E mp4 MP4\n  E matroska,webm Matroska",
    ),
    ["mp4", "matroska", "webm"],
  );
});
test("HEVC/VP9 conversion requires actual software decoders and preserves missing audio", () => {
  for (const codec_name of ["hevc", "vp9"]) {
    const result = conversionCapability(
      [
        { ...v, codec_name },
        { codec_type: "audio", codec_name: "opus" },
      ],
      core,
    );
    assert.equal(result.available, true);
    assert.equal(result.videoDecoder, codec_name);
    assert.equal(result.audioOnly, false);
  }
  const silent = conversionCapability([v], core);
  assert.equal(silent.available, true);
  assert.equal(silent.audioDecoder, undefined);
  assert.equal(
    conversionCapability([v], { ...core, encoders: [] }).available,
    false,
  );
});
test("no fake AV1 or missing audio support; encryption and HDR never silently reduce or discard content", () => {
  assert.match(
    conversionCapability([{ ...v, codec_name: "av1" }], core).reason!,
    /usable software decoder.*av1/,
  );
  assert.equal(
    conversionCapability([{ ...v, codec_name: "av1" }], {
      ...core,
      decoders: { ...core.decoders, av1: ["libdav1d"] },
    }).available,
    true,
  );
  assert.match(
    conversionCapability(
      [v, { codec_type: "audio", codec_name: "wmav2" }],
      core,
    ).reason!,
    /no decoder.*wmav2/,
  );
  assert.match(
    conversionCapability([{ ...v, codec_tag_string: "encv" }], core).reason!,
    /Encrypted/,
  );
  assert.match(
    conversionCapability(
      [{ ...v, codec_name: "hevc", color_transfer: "smpte2084" }],
      core,
    ).reason!,
    /HDR/,
  );
  assert.match(
    conversionCapability([{ ...v, pix_fmt: "yuv420p10le" }], core)
      .precisionLoss!,
    /8-bit/,
  );
  assert.equal(conversionCapability([v, v], core).omittedTracks, true);
});
test("audio-only conversion is distinct from full encoding and never enables encoding implicitly", () => {
  const result = conversionCapability(
    [v, { codec_type: "audio", codec_name: "mp3" }],
    core,
  );
  assert.equal(result.audioOnly, true);
  assert.equal(result.audioDecoder, "mp3float");
  const base = {
    range: { start: 3600, end: 3750 },
    compression: "off" as const,
    cutStrategy: "fast" as const,
    outputName: "clip.mp4",
  };
  const copy = encodingArgs(base);
  assert.equal(copy[copy.indexOf("-c") + 1], "copy");
  assert.ok(!copy.includes("aac"));
  const audio = encodingArgs({ ...base, convertAudio: true });
  assert.equal(audio[audio.indexOf("-c:v") + 1], "copy");
  assert.equal(audio[audio.indexOf("-c:a") + 1], "aac");
  assert.ok(!audio.includes("libx264"));
  assert.ok(audio.indexOf("-ss") < audio.indexOf("-i"));
  assert.equal(audio[audio.indexOf("-t") + 1], "150");
});

test("MPEG program-stream seeking uses a bounded preroll rather than decoding from zero for a late trim", () => {
  const args = encodingArgs(
    {
      range: { start: 5400, end: 5550 },
      compression: "off",
      cutStrategy: "precision",
      outputName: "clip.mp4",
    },
    "source",
    0.541667,
    30,
  );
  const seek = args.flatMap((x, i) =>
    x === "-ss" ? [{ index: i, value: args[i + 1] }] : [],
  );
  assert.equal(seek[0].value, "5370");
  assert.equal(seek[1].value, "30");
  assert.ok(seek[0].index < args.indexOf("-i"));
  assert.ok(seek[1].index > args.indexOf("-i"));
  assert.equal(args[args.indexOf("-t") + 1], "150");
});
