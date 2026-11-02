import { test } from "node:test";
import assert from "node:assert/strict";
import { refineMask, outputSize, backgroundRect } from "../lib/background/mask";
test("MediaPipe red/alpha confidence is never interpreted as grayscale RGB", () => {
  const raw = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 200, 255, 0, 0, 140, 255, 0, 0, 20, 0, 0, 0, 0,
    ]),
    out = new Uint8ClampedArray(raw.length),
    before = raw.slice();
  const stats = refineMask(raw, out, 0.55, 0.12);
  assert.deepEqual(
    Array.from(out.filter((_, i) => i % 4 === 3)),
    [255, 255, 124, 0, 0],
  );
  assert.equal(stats.valid, true);
  assert.equal(stats.coverage, 0.4);
  assert.deepEqual(raw, before);
  assert.equal(stats.channels[1].max, 0);
  assert.equal(stats.channels[3].max, 255);
});
test("invalid masks are explicit and cannot pass as a composited original", () => {
  for (const pixel of [
    [0, 0, 0, 0],
    [255, 255, 255, 255],
    [255, 0, 0, 255],
  ]) {
    const data = new Uint8ClampedArray([...pixel, ...pixel]);
    const stats = refineMask(
      data,
      new Uint8ClampedArray(data.length),
      0.55,
      0.12,
    );
    assert.equal(stats.valid, false);
    assert.ok(stats.reason);
  }
  assert.throws(() =>
    refineMask(new Uint8ClampedArray(3), new Uint8ClampedArray(3), 0.5, 0.1),
  );
});
test("high-confidence subject stays opaque while boundary softness remains adjustable", () => {
  const raw = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 140, 0, 0, 0, 0,
    ]),
    out = new Uint8ClampedArray(12);
  refineMask(raw, out, 0.55, 0.3);
  assert.equal(out[3], 255);
  assert.ok(out[7] > 0 && out[7] < 255);
  assert.equal(out[11], 0);
});
test("portrait output caps the longest edge and landscape background framing is predictable", () => {
  assert.deepEqual(outputSize(1080, 1920), { width: 405, height: 720 });
  assert.deepEqual(outputSize(3840, 2160), { width: 720, height: 405 });
  assert.deepEqual(outputSize(360, 640), { width: 360, height: 640 });
  assert.deepEqual(backgroundRect(360, 640, 640, 360, "contain", 1, 50, 50), {
    x: 0,
    y: 218.75,
    width: 360,
    height: 202.5,
  });
  const fill = backgroundRect(360, 640, 640, 360, "cover", 1, 0, 0);
  assert.ok(Math.abs(fill.x) < 0.001);
  assert.equal(fill.height, 640);
  assert.ok(fill.width > 360);
});
