import { test } from "node:test";
import assert from "node:assert/strict";
import { fastCompatibility } from "../lib/video/compatibility";
const video = { codec_type: "video", codec_name: "h264" };
test("stream copy accepts tested H264 AAC/silent MP4 MOV and Matroska combinations", () => {
  for (const container of ["mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"])
    for (const codec of ["aac", undefined]) {
      assert.equal(
        fastCompatibility(container, [
          video,
          ...(codec ? [{ codec_type: "audio", codec_name: codec }] : []),
        ]).compatible,
        true,
      );
    }
});
test("unsupported codecs, containers, stream layouts and unknown metadata are distinct", () => {
  for (const codec of ["hevc", "mpeg4", "vp9", "av1"]) {
    const info = fastCompatibility("mov,mp4", [
      { ...video, codec_name: codec },
    ]);
    assert.equal(info.compatibilityIssue, "unsupported-codec");
    assert.match(info.incompatibility!, new RegExp(codec));
  }
  assert.equal(
    fastCompatibility("mov,mp4", [
      video,
      { codec_type: "audio", codec_name: "ac3" },
    ]).compatibilityIssue,
    "unsupported-codec",
  );
  assert.equal(
    fastCompatibility("unknown", [video]).compatibilityIssue,
    "incomplete-metadata",
  );
  assert.equal(
    fastCompatibility("ogg", [video]).compatibilityIssue,
    "unsupported-container",
  );
  for (const streams of [
    [video, video],
    [video, { codec_type: "subtitle", codec_name: "mov_text" }],
    [
      video,
      { codec_type: "audio", codec_name: "aac" },
      { codec_type: "audio", codec_name: "aac" },
    ],
    [{ ...video, disposition: { attached_pic: 1 } }],
  ])
    assert.equal(
      fastCompatibility("mov,mp4", streams).compatibilityIssue,
      "unsupported-streams",
    );
  assert.equal(
    fastCompatibility("mov,mp4", [{ ...video, codec_tag_string: "encv" }])
      .compatibilityIssue,
    "unsupported-streams",
  );
  assert.equal(
    fastCompatibility("mov,mp4", [{ codec_type: "video" }]).compatibilityIssue,
    "incomplete-metadata",
  );
});
