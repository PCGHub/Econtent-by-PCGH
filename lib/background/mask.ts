/** Contract verified against pinned MediaPipe SelfieSegmentation 0.1.1675465747.
 * Its texture is red with confidence in ALPHA. Canvas getImageData unpremultiplies
 * red (often 255 at any nonzero confidence); averaging RGB is not confidence.
 */
export interface ChannelStats {
  min: number;
  max: number;
  mean: number;
}
export interface MaskStats {
  representation?: string;
  channels: ChannelStats[];
  coverage: number;
  valid: boolean;
  reason: string;
  width: number;
  height: number;
  time: number;
}
export function refineMask(
  raw: Uint8ClampedArray,
  target: Uint8ClampedArray,
  threshold: number,
  softness: number,
) {
  if (raw.length !== target.length || raw.length % 4)
    throw Error("Invalid mask dimensions");
  const sums = [0, 0, 0, 0],
    mins = [255, 255, 255, 255],
    maxs = [0, 0, 0, 0];
  let foreground = 0;
  const low = Math.max(0, threshold - softness / 2),
    high = Math.min(1, threshold + softness / 2);
  for (let i = 0; i < raw.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      const v = raw[i + c];
      sums[c] += v;
      mins[c] = Math.min(mins[c], v);
      maxs[c] = Math.max(maxs[c], v);
    }
    const value = raw[i + 3] / 255,
      t = Math.max(0, Math.min(1, (value - low) / Math.max(0.001, high - low))),
      alpha = Math.round(255 * t * t * (3 - 2 * t));
    target[i] = target[i + 1] = target[i + 2] = 255;
    target[i + 3] = alpha;
    if (alpha >= 128) foreground++;
  }
  const pixels = raw.length / 4,
    coverage = pixels ? foreground / pixels : 0;
  const reason = !pixels
    ? "Empty mask"
    : maxs[3] === 0
      ? "No person detected (empty alpha confidence)"
      : mins[3] === 255
        ? "Invalid mask: alpha is entirely opaque"
        : coverage < 0.001
          ? "No measurable person detected"
          : coverage > 0.999
            ? "Mask covers the entire frame; background separation is unavailable"
            : "";
  return {
    channels: sums.map((n, i) => ({
      min: mins[i],
      max: maxs[i],
      mean: pixels ? n / pixels : 0,
    })),
    coverage,
    valid: !reason,
    reason,
  };
}
export function outputSize(w: number, h: number, maxEdge = 720) {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return {
    width: Math.max(2, Math.round(w * scale)),
    height: Math.max(2, Math.round(h * scale)),
  };
}
export function backgroundRect(
  w: number,
  h: number,
  iw: number,
  ih: number,
  fit: "cover" | "contain",
  zoom: number,
  x: number,
  y: number,
) {
  const scale =
      (fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)) *
      zoom,
    width = iw * scale,
    height = ih * scale;
  return {
    x: ((w - width) * x) / 100,
    y: ((h - height) * y) / 100,
    width,
    height,
  };
}
