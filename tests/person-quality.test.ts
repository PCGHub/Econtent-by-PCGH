import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPersonMask, type BodyPoint } from "../lib/background/quality";
function person() {
  const w = 100,
    h = 100,
    data = new Uint8ClampedArray(w * h * 4),
    points: BodyPoint[] = Array.from({ length: 33 }, () => ({
      x: 0,
      y: 0,
      visibility: 0,
    }));
  const set = (id: number, x: number, y: number) => {
    points[id] = { x: x / 100, y: y / 100, visibility: 0.99 };
  };
  for (const [id, x, y] of [
    [0, 50, 16],
    [2, 53, 14],
    [5, 47, 14],
    [7, 57, 16],
    [8, 43, 16],
    [11, 36, 30],
    [12, 64, 30],
    [13, 28, 47],
    [14, 72, 47],
    [15, 23, 65],
    [16, 77, 65],
    [23, 42, 65],
    [24, 58, 65],
    [25, 42, 81],
    [26, 58, 81],
    [27, 42, 95],
    [28, 58, 95],
  ])
    set(id, x, y);
  const disc = (cx: number, cy: number, r: number) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (Math.hypot(x - cx, y - cy) <= r) data[(y * w + x) * 4 + 3] = 255;
  };
  disc(50, 16, 10);
  for (let y = 25; y <= 68; y++)
    for (let x = 32; x <= 68; x++) data[(y * w + x) * 4 + 3] = 255;
  for (const [a, b] of [
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
  ])
    for (let i = 0; i <= 20; i++) {
      const f = i / 20;
      disc(
        (points[a].x * (1 - f) + points[b].x * f) * 100,
        (points[a].y * (1 - f) + points[b].y * f) * 100,
        5,
      );
    }
  return { data, points, w, h };
}
function assess(
  p: ReturnType<typeof person>,
  time = 0,
  previous?: ReturnType<typeof assessPersonMask>["history"],
  raw?: Uint8ClampedArray,
) {
  let count = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] >= 128) count++;
  return assessPersonMask(
    p.data,
    p.w,
    p.h,
    p.points,
    time,
    count / (p.w * p.h),
    previous,
    raw,
  );
}
test("clear whole person passes without altering normal gaps or alpha pixels", () => {
  const p = person(),
    before = p.data.slice(),
    q = assess(p);
  assert.equal(q.safe, true, q.reason);
  assert.equal(q.matchedSegments, 8);
  assert.equal(q.matchedPoints, q.visiblePoints);
  assert.deepEqual(p.data, before);
});
test("missing wrist or a broken forearm rejects otherwise plausible foreground coverage", () => {
  for (const rect of [
    [16, 55, 30, 74],
    [23, 50, 31, 58],
  ]) {
    const p = person();
    for (let y = rect[1]; y <= rect[3]; y++)
      for (let x = rect[0]; x <= rect[2]; x++)
        p.data[(y * 100 + x) * 4 + 3] = 0;
    const q = assess(p);
    assert.equal(q.safe, false);
    assert.match(q.reason, /wrist|forearm/);
  }
});
test("holes through the torso reject the mask instead of painting invented body pixels", () => {
  const p = person();
  for (let y = 39; y <= 52; y++)
    for (let x = 43; x <= 57; x++) p.data[(y * 100 + x) * 4 + 3] = 0;
  const q = assess(p);
  assert.equal(q.safe, false);
  assert.match(q.reason, /torso/);
});
test("low-confidence visible limbs, no pose, malformed points and broadly uncertain masks fail closed", () => {
  const p = person();
  p.points[15].visibility = 0.6;
  assert.match(assess(p).reason, /uncertain/);
  p.points = undefined as unknown as BodyPoint[];
  assert.equal(assess(p).safe, false);
  const bad = person();
  bad.points[0].x = NaN;
  assert.equal(assess(bad).safe, false);
  const uncertain = person(),
    raw = uncertain.data.slice();
  for (let i = 3; i < raw.length; i += 4) if (raw[i]) raw[i] = 150;
  assert.match(assess(uncertain, 0, undefined, raw).reason, /uncertain/);
});
test("cropped-out joints are not confused with missing visible limbs", () => {
  const p = person();
  for (const id of [25, 26, 27, 28]) p.points[id].y = 1.2;
  assert.equal(assess(p).safe, true);
});
test("sudden coverage loss with stable body position fails, while manual seeks reset history", () => {
  const p = person(),
    first = assess(p);
  assert.ok(first.history);
  const previous = { ...first.history, coverage: 0.95 };
  assert.equal(assess(p, 0.04, previous).safe, false);
  assert.equal(assess(p, 2, previous).safe, true);
});
