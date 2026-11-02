/** Conservative consistency checks, not a claim of pixel-perfect segmentation.
 * Evidence comes from visible pose landmarks and the FINAL refined alpha mask.
 * Never fill in missing anatomy or smooth previous silhouettes over moving limbs.
 */
export interface BodyPoint {
  x: number;
  y: number;
  visibility?: number;
}
export interface QualityHistory {
  time: number;
  coverage: number;
  centerX: number;
  centerY: number;
  shoulderSpan: number;
}
export interface PersonQuality {
  safe: boolean;
  reason: string;
  visiblePoints: number;
  matchedPoints: number;
  checkedSegments: number;
  matchedSegments: number;
  uncertainFraction: number;
  history?: QualityHistory;
}
const namedPoints: [number, string][] = [
  [0, "face"],
  [2, "left eye"],
  [5, "right eye"],
  [7, "left ear"],
  [8, "right ear"],
  [11, "left shoulder"],
  [12, "right shoulder"],
  [13, "left elbow"],
  [14, "right elbow"],
  [15, "left wrist"],
  [16, "right wrist"],
  [23, "left hip"],
  [24, "right hip"],
  [25, "left knee"],
  [26, "right knee"],
  [27, "left ankle"],
  [28, "right ankle"],
];
const limbs: [number, number, string][] = [
  [11, 13, "left upper arm"],
  [13, 15, "left forearm"],
  [12, 14, "right upper arm"],
  [14, 16, "right forearm"],
  [23, 25, "left thigh"],
  [25, 27, "left lower leg"],
  [24, 26, "right thigh"],
  [26, 28, "right lower leg"],
];
const visible = (p: BodyPoint | undefined, min = 0.8): p is BodyPoint =>
  !!p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Number.isFinite(p.visibility) &&
  (p.visibility ?? 0) >= min &&
  p.x >= 0.01 &&
  p.x <= 0.99 &&
  p.y >= 0.01 &&
  p.y <= 0.99;
export function assessPersonMask(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  points: BodyPoint[] | undefined,
  time: number,
  coverage: number,
  previous?: QualityHistory,
  raw?: Uint8ClampedArray,
): PersonQuality {
  const result: PersonQuality = {
    safe: false,
    reason: "",
    visiblePoints: 0,
    matchedPoints: 0,
    checkedSegments: 0,
    matchedSegments: 0,
    uncertainFraction: 0,
  };
  const fail = (why: string) => ({ ...result, reason: why });
  if (alpha.length !== width * height * 4 || !width || !height)
    return fail("Person mask dimensions are invalid.");
  if (
    !points ||
    points.length !== 33 ||
    points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return fail(
      "No reliable person detected. A clear single person must be visible.",
    );
  const peak = (x: number, y: number, radius: number) => {
    const cx = Math.round(x * (width - 1)),
      cy = Math.round(y * (height - 1)),
      r = Math.max(1, Math.round(Math.min(width, height) * radius));
    let value = 0;
    for (let yy = Math.max(0, cy - r); yy <= Math.min(height - 1, cy + r); yy++)
      for (
        let xx = Math.max(0, cx - r);
        xx <= Math.min(width - 1, cx + r);
        xx++
      )
        value = Math.max(value, alpha[(yy * width + xx) * 4 + 3]);
    return value / 255;
  };
  const anchors = namedPoints.filter(([id]) => visible(points[id]));
  result.visiblePoints = anchors.length;
  if (
    anchors.length < 3 ||
    ![11, 12, 23, 24].some((id) => visible(points[id], 0.7))
  )
    return fail(
      "Person detection is uncertain or too occluded. Move the person clearly into frame.",
    );
  const uncertainParts = namedPoints.filter(
    ([id]) =>
      id >= 11 &&
      points[id].x > 0.05 &&
      points[id].x < 0.95 &&
      points[id].y > 0.05 &&
      points[id].y < 0.95 &&
      (points[id].visibility ?? 0) >= 0.15 &&
      (points[id].visibility ?? 0) < 0.8,
  );
  if (uncertainParts.length)
    return fail(
      "Body detection is uncertain or occluded: " +
        uncertainParts.map(([, name]) => name).join(", ") +
        ". Use a clearer shot.",
    );
  const missing: string[] = [];
  for (const [id, name] of anchors) {
    const radius = id <= 8 ? 0.012 : 0.025;
    if (peak(points[id].x, points[id].y, radius) >= 0.65)
      result.matchedPoints++;
    else missing.push(name);
  }
  if (missing.length)
    return fail(
      "Incomplete person mask: " + missing.join(", ") + " not retained.",
    );
  for (const [a, b, name] of limbs) {
    if (!visible(points[a]) || !visible(points[b])) continue;
    const start = points[a],
      end = points[b];
    if (Math.hypot((start.x - end.x) * width, (start.y - end.y) * height) < 8)
      continue;
    result.checkedSegments++;
    let matches = 0;
    for (let i = 1; i <= 7; i++) {
      const f = i / 8;
      if (
        peak(
          start.x * (1 - f) + end.x * f,
          start.y * (1 - f) + end.y * f,
          0.018,
        ) >= 0.6
      )
        matches++;
    }
    if (matches >= 6) result.matchedSegments++;
    else missing.push(name);
  }
  if (missing.length)
    return fail("Incomplete person mask: " + missing.join(", ") + " has gaps.");
  if ([11, 12, 23, 24].every((id) => visible(points[id], 0.65))) {
    let weak = 0,
      total = 0;
    const [ls, rs, lh, rh] = [11, 12, 23, 24].map((id) => points[id]);
    for (let row = 0; row < 5; row++) {
      const v = 0.25 + row * 0.125,
        lx = ls.x * (1 - v) + lh.x * v,
        ly = ls.y * (1 - v) + lh.y * v,
        rx = rs.x * (1 - v) + rh.x * v,
        ry = rs.y * (1 - v) + rh.y * v;
      for (let column = 0; column < 5; column++) {
        const u = 0.25 + column * 0.125;
        total++;
        if (peak(lx * (1 - u) + rx * u, ly * (1 - u) + ry * u, 0.006) < 0.85)
          weak++;
      }
    }
    if (weak / total > 0.08)
      return fail(
        "The torso contains holes or uncertain areas. Person detection is not reliable enough to export.",
      );
  }
  const data = raw ?? alpha;
  let candidate = 0,
    uncertain = 0;
  const step = Math.max(1, Math.floor((width * height) / 4096));
  for (let pixel = 0; pixel < width * height; pixel += step) {
    const value = data[pixel * 4 + 3] / 255;
    if (value > 0.1) {
      candidate++;
      if (value < 0.9) uncertain++;
    }
  }
  result.uncertainFraction = candidate ? uncertain / candidate : 1;
  if (result.uncertainFraction > 0.4)
    return fail(
      "Too much of the person mask is uncertain, possibly from blur or occlusion.",
    );
  if (coverage < 0.01 || coverage > 0.98)
    return fail(
      "Person/background separation is insufficient. Use a clearer, less tightly cropped shot.",
    );
  const shoulders = [points[11], points[12]],
    centerX = (shoulders[0].x + shoulders[1].x) / 2,
    centerY = (shoulders[0].y + shoulders[1].y) / 2,
    shoulderSpan = Math.hypot(
      shoulders[0].x - shoulders[1].x,
      shoulders[0].y - shoulders[1].y,
    );
  if (!Number.isFinite(centerX + centerY + shoulderSpan))
    return fail("Body position could not be verified.");
  const history = { time, coverage, centerX, centerY, shoulderSpan };
  result.history = history;
  if (previous && time > previous.time && time - previous.time <= 0.2) {
    const displacement = Math.hypot(
      centerX - previous.centerX,
      centerY - previous.centerY,
    );
    if (displacement > 0.3)
      return fail(
        "Person tracking jumped abruptly. A scene cut or another person may have interrupted detection.",
      );
    const stable =
      displacement < 0.04 &&
      Math.abs(shoulderSpan - previous.shoulderSpan) <
        previous.shoulderSpan * 0.2;
    if (stable && coverage < previous.coverage * 0.55)
      return fail(
        "Person mask suddenly lost a large area while the body stayed in place.",
      );
  }
  return {
    ...result,
    safe: true,
    reason:
      "Visible-body checks passed. Review the cutout; these checks cannot guarantee every edge.",
  };
}
