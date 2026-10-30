import {
  FONTS,
  sample,
  clamp,
  type TitleScene,
  type TitleText,
  type TitleRatio,
} from "./model";
export interface Glyph {
  value: string;
  x: number;
  y: number;
  index: number;
  unit: number;
}
/** One canvas layout implementation for live preview and every encoded frame. */
export function layoutText(
  ctx: CanvasRenderingContext2D,
  t: TitleText,
  w: number,
  h: number,
) {
  const scale = Math.min(w, h) / 360,
    size = t.fontSize * scale,
    pad = t.background === "none" ? 0 : 6 * scale,
    boxW = t.width * w,
    lineHeight = size * t.lineHeight;
  ctx.font = `${t.weight} ${size}px ${FONTS[t.font]}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const chars = Array.from(t.text),
    lines: { value: string; index: number; unit: number }[][] = [[]];
  let lineWidth = 0,
    unit = 0,
    inWord = false;
  for (const [index, value] of chars.entries()) {
    if (value === "\n") {
      lines.push([]);
      lineWidth = 0;
      inWord = false;
      continue;
    }
    if (!/\s/u.test(value) && !inWord) {
      unit++;
      inWord = true;
    } else if (/\s/u.test(value)) inWord = false;
    const width = ctx.measureText(value).width + size * t.tracking;
    if (lineWidth + width > boxW - 2 * pad && lines.at(-1)!.length) {
      lines.push([]);
      lineWidth = 0;
    }
    lines.at(-1)!.push({ value, index, unit });
    lineWidth += width;
  }
  const glyphs: Glyph[] = [];
  for (const [row, line] of lines.entries()) {
    const length =
      line.reduce(
        (n, c) => n + ctx.measureText(c.value).width + size * t.tracking,
        0,
      ) -
      size * t.tracking;
    let x =
      pad +
      (t.align === "center"
        ? (boxW - 2 * pad - length) / 2
        : t.align === "right"
          ? boxW - 2 * pad - length
          : 0);
    for (const char of line) {
      glyphs.push({ ...char, x, y: pad + row * lineHeight });
      x += ctx.measureText(char.value).width + size * t.tracking;
    }
  }
  return {
    glyphs,
    size,
    scale,
    height: lines.length * lineHeight + 2 * pad,
    units: unit,
    charCount: chars.length,
  };
}
export function requiredCreditSpeed(
  ctx: CanvasRenderingContext2D,
  t: TitleText,
  ratio: TitleRatio,
  fps = 24,
) {
  const [rw, rh] = ratio.split(":").map(Number),
    w = (360 * rw) / Math.min(rw, rh),
    h = (360 * rh) / Math.min(rw, rh),
    layout = layoutText(ctx, t, w, h);
  // Includes a full final-frame margin so the last line clears before the interval ends.
  const radians = (t.rotation * Math.PI) / 180,
    halfBox = (t.height * h) / 2;
  const bottom =
    halfBox +
    Math.max(
      -halfBox * Math.cos(radians),
      (layout.height - halfBox) * Math.cos(radians),
    ) +
    Math.abs(((t.width * w) / 2) * Math.sin(radians));
  return Math.ceil(
    (100 * (1 + t.y + bottom / h + 0.03)) /
      Math.max(0.05, t.end - t.start - 2 / fps),
  );
}
function drawText(
  ctx: CanvasRenderingContext2D,
  t: TitleText,
  time: number,
  w: number,
  h: number,
) {
  const state = sample(t, time);
  if (!state.active || state.opacity <= 0) return;
  const layout = layoutText(ctx, t, w, h),
    bw = t.width * w,
    bh = t.height * h;
  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.translate(t.x * w + bw / 2, t.y * h + bh / 2 + state.dy * h);
  ctx.scale(state.scale, state.scale);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.translate(-bw / 2, -bh / 2);
  if (t.background !== "none") {
    ctx.fillStyle = t.backgroundColor + (t.background === "tint" ? "b3" : "");
    ctx.fillRect(0, 0, bw, Math.max(bh, layout.height));
  }
  ctx.fillStyle = t.color;
  ctx.strokeStyle = t.outlineColor;
  ctx.lineWidth = t.outline * layout.scale * 2;
  ctx.lineJoin = "round";
  if (t.shadow) {
    ctx.shadowColor = "#00000088";
    ctx.shadowBlur = 16 * layout.scale;
    ctx.shadowOffsetY = 2 * layout.scale;
  }
  const cutoff = Array.from(state.text).length;
  for (const g of layout.glyphs) {
    if (t.entrance === "typewriter" && g.index >= cutoff) continue;
    let p = 1;
    if (t.entrance === "word-reveal")
      p = clamp(
        (state.progress - ((g.unit - 1) / Math.max(1, layout.units)) * 0.65) /
          0.35,
      );
    if (t.entrance === "letter-reveal")
      p = clamp(
        (state.progress - (g.index / Math.max(1, layout.charCount)) * 0.65) /
          0.35,
      );
    ctx.globalAlpha = state.opacity * p;
    const y = g.y + (1 - p) * 12 * layout.scale;
    if (t.outline) ctx.strokeText(g.value, g.x, y);
    ctx.fillText(g.value, g.x, y);
  }
  ctx.restore();
}
let grain: HTMLCanvasElement | undefined;
function grainTexture() {
  if (grain) return grain;
  grain = document.createElement("canvas");
  grain.width = grain.height = 180;
  const ctx = grain.getContext("2d")!,
    pixels = ctx.createImageData(180, 180);
  let seed = 1729;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const v = seed >>> 24;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
    pixels.data[i + 3] = 18;
  }
  ctx.putImageData(pixels, 0, 0);
  return grain;
}
export function drawTitleScene(
  ctx: CanvasRenderingContext2D,
  scene: TitleScene,
  time: number,
  w: number,
  h: number,
  media?: CanvasImageSource,
  overlayOnly = false,
) {
  ctx.clearRect(0, 0, w, h);
  const bg = scene.background;
  if (!overlayOnly) {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
    if (bg.kind === "gradient") {
      const angle = (bg.angle * Math.PI) / 180,
        dx = Math.sin(angle),
        dy = -Math.cos(angle),
        length = Math.abs(w * dx) + Math.abs(h * dy),
        gradient = ctx.createLinearGradient(
          w / 2 - (dx * length) / 2,
          h / 2 - (dy * length) / 2,
          w / 2 + (dx * length) / 2,
          h / 2 + (dy * length) / 2,
        );
      gradient.addColorStop(0, bg.color);
      gradient.addColorStop(1, bg.secondary);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
    if (media) {
      const source = media as HTMLVideoElement & HTMLImageElement;
      const mw = source.videoWidth || source.naturalWidth,
        mh = source.videoHeight || source.naturalHeight;
      if (mw && mh) {
        const scale =
          bg.fit === "cover"
            ? Math.max(w / mw, h / mh)
            : Math.min(w / mw, h / mh);
        ctx.drawImage(
          media,
          (w - mw * scale) / 2,
          (h - mh * scale) / 2,
          mw * scale,
          mh * scale,
        );
      }
    }
  }
  if (bg.vignette) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(w / 2, h / 2);
    const g = ctx.createRadialGradient(0, 0, 0.32, 0, 0, 1.42);
    g.addColorStop(0, "#0000");
    g.addColorStop(1, "#0008");
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  for (const t of scene.text) drawText(ctx, t, time, w, h);
  if (bg.grain) {
    const pattern = ctx.createPattern(grainTexture(), "repeat")!;
    pattern.setTransform(new DOMMatrix().scale(Math.min(w, h) / 360));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
  }
}
