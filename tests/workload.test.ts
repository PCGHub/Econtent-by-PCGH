import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultStrategy,
  deviceProfile,
  frameRate,
  needsPrecisionConfirmation,
  outputBudget,
  workloadDescription,
} from "../lib/video/workload";
import { encodingArgs } from "../lib/video/command";
test("Off defaults to copy at the engine boundary; explicit precision is retained", () => {
  assert.equal(defaultStrategy({ compression: "off" }), "fast");
  assert.equal(
    defaultStrategy({ compression: "off", cutStrategy: "precision" }),
    "precision",
  );
  assert.equal(defaultStrategy({ compression: "balanced" }), "precision");
  const base = {
    range: { start: 1, end: 5 },
    compression: "off" as const,
    outputName: "clip.mp4",
  };
  assert.ok(encodingArgs(base).includes("copy"));
  const precise = encodingArgs({ ...base, cutStrategy: "precision" });
  assert.equal(precise[precise.indexOf("-preset") + 1], "ultrafast");
  assert.equal(precise[precise.indexOf("-crf") + 1], "18");
  assert.ok(precise.includes("128k"));
  for (const preset of ["high", "balanced", "small"] as const) {
    const args = encodingArgs({
      ...base,
      compression: preset,
      cutStrategy: "precision",
    });
    assert.equal(
      args[args.indexOf("-preset") + 1],
      preset === "small" ? "fast" : "medium",
    );
  }
});
test("measured average frame rate parsing rejects invalid or unknown values", () => {
  assert.equal(frameRate("30000/1001"), 30000 / 1001);
  assert.equal(frameRate("24"), 24);
  for (const value of ["0/0", "30/0", "-24", "NaN", "10000", "1/2/3", null])
    assert.equal(frameRate(value), undefined);
});
test("mobile/low-memory workload confirmation and retained-output caps are conservative guards", () => {
  const android = deviceProfile({
    userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130.0",
    deviceMemory: 4,
  });
  assert.equal(android.mobile, true);
  assert.equal(needsPrecisionConfirmation(android), true);
  assert.equal(outputBudget(android), 128 * 1048576);
  assert.equal(
    needsPrecisionConfirmation({ mobile: false, memoryGiB: 2 }),
    true,
  );
  assert.equal(
    needsPrecisionConfirmation({ mobile: false, memoryGiB: 8 }),
    false,
  );
  assert.equal(
    deviceProfile({ userAgent: "Desktop", userAgentData: { mobile: true } })
      .mobile,
    true,
  );
  const summary = workloadDescription(
    {
      duration: 210,
      sizeBytes: 30000000,
      width: 1280,
      height: 720,
      frameRate: 30,
      videoCodec: "h264",
      audioCodec: "aac",
      container: "mp4",
      compatible: true,
    },
    210,
    "precision",
  );
  assert.match(summary, /6,300 frames/);
  assert.match(summary, /file size alone cannot predict/);
  assert.doesNotMatch(summary, /minutes remaining/);
});
