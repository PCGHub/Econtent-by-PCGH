export type TitleRatio = "16:9" | "9:16" | "1:1" | "4:5";
export type Effect =
  | "none"
  | "fade"
  | "slide-up"
  | "zoom"
  | "typewriter"
  | "word-reveal"
  | "letter-reveal"
  | "credit-roll";
export const EFFECTS: Record<Effect, string> = {
  none: "None",
  fade: "Fade In",
  "slide-up": "Slide Up",
  zoom: "Zoom In",
  typewriter: "Typewriter",
  "word-reveal": "Word Reveal",
  "letter-reveal": "Letter Reveal",
  "credit-roll": "Credit Roll",
};
export const FONTS = {
  serif: "Georgia, serif",
  sans: "Arial, Helvetica, sans-serif",
  editorial: '"Times New Roman", serif',
  mono: '"Courier New", monospace',
};
export interface TitleText {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  font: keyof typeof FONTS;
  fontSize: number;
  weight: 400 | 600 | 700 | 900;
  color: string;
  align: "left" | "center" | "right";
  tracking: number;
  lineHeight: number;
  outline: number;
  outlineColor: string;
  shadow: boolean;
  background: "none" | "tint" | "solid";
  backgroundColor: string;
  start: number;
  end: number;
  entrance: Effect;
  exit: "none" | "fade" | "slide-up" | "zoom";
  animationDuration: number;
  creditSpeed: number;
}
export interface TitleBackground {
  kind: "solid" | "gradient" | "image" | "video";
  color: string;
  secondary: string;
  angle: number;
  grain: boolean;
  vignette: boolean;
  assetId?: string;
  fit: "contain" | "cover";
  loop: boolean;
  volume?: number;
}
export interface TitleScene {
  id: string;
  name: string;
  duration: number;
  text: TitleText[];
  background: TitleBackground;
}
export interface TitleProject {
  version: 1;
  title: string;
  ratio: TitleRatio;
  scenes: TitleScene[];
  output: { shortEdge: 360 | 480 | 720 | 1080; fps: 24 | 30 };
}
/** Browser-local renderer boundary, independent of editor state. */
export interface TitleRenderProgress {
  stage: string;
  fraction?: number;
  completedFrames?: number;
  totalFrames?: number;
  startup?: import("../video/types").StartupProgress;
}
export interface TitlesRenderer {
  render(
    project: TitleProject,
    assets: ReadonlyMap<string, File>,
    signal: AbortSignal,
    onProgress: (progress: TitleRenderProgress) => void,
  ): Promise<Blob>;
}
export const clamp = (n: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, n));
export const durationOf = (p: TitleProject) =>
  p.scenes.reduce((sum, s) => sum + s.duration, 0);
export const startOf = (p: TitleProject, id: string) => {
  let start = 0;
  for (const s of p.scenes) {
    if (s.id === id) return start;
    start += s.duration;
  }
  return 0;
};
export function locate(p: TitleProject, time: number) {
  let start = 0;
  for (const [index, scene] of p.scenes.entries()) {
    if (time < start + scene.duration || index === p.scenes.length - 1)
      return {
        scene,
        index,
        start,
        time: clamp(time - start, 0, scene.duration),
      };
    start += scene.duration;
  }
  throw Error("A title project needs a scene");
}
export function setDuration(scene: TitleScene, duration: number): TitleScene {
  duration = clamp(duration, 1, 120);
  return {
    ...scene,
    duration,
    text: scene.text.map((t) => {
      const start = Math.min(t.start, duration - 0.1);
      return { ...t, start, end: clamp(t.end, start + 0.1, duration) };
    }),
  };
}
export function shiftRange(
  t: TitleText,
  kind: "move" | "start" | "end",
  delta: number,
  duration: number,
): TitleText {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (kind === "move") {
    const start = clamp(
      round(t.start + delta),
      0,
      duration - (t.end - t.start),
    );
    return { ...t, start, end: round(start + t.end - t.start) };
  }
  if (kind === "start")
    return { ...t, start: clamp(round(t.start + delta), 0, t.end - 0.1) };
  return { ...t, end: clamp(round(t.end + delta), t.start + 0.1, duration) };
}
export function sample(t: TitleText, time: number) {
  const active = time >= t.start && time < t.end,
    span = t.end - t.start,
    d = Math.max(0.05, Math.min(t.animationDuration, span / 2)),
    age = time - t.start,
    p = clamp(age / d),
    out = clamp((t.end - time) / d),
    ease = 1 - Math.pow(1 - p, 3);
  let opacity = active ? 1 : 0,
    dy = 0,
    scale = 1,
    text = t.text;
  if (t.entrance === "fade") opacity *= p;
  if (t.entrance === "slide-up") {
    dy = (1 - ease) * 0.06;
    opacity *= p;
  }
  if (t.entrance === "zoom") {
    scale = 0.72 + 0.28 * ease;
    opacity *= p;
  }
  if (t.entrance === "typewriter")
    text = Array.from(t.text)
      .slice(0, Math.floor(Array.from(t.text).length * p))
      .join("");
  if (t.entrance === "credit-roll")
    dy = 1 - (Math.max(0, age) * t.creditSpeed) / 100;
  if (t.exit === "fade") opacity *= out;
  if (t.exit === "slide-up") {
    dy -= (1 - out) * 0.06;
    opacity *= out;
  }
  if (t.exit === "zoom") {
    scale *= 1 + 0.15 * (1 - out);
    opacity *= out;
  }
  return { active, opacity, dy, scale, text, progress: p };
}
export function newText(
  duration: number,
  patch: Partial<TitleText> = {},
): TitleText {
  return {
    id: crypto.randomUUID(),
    text: "Your title",
    x: 0.1,
    y: 0.35,
    width: 0.8,
    height: 0.3,
    rotation: 0,
    font: "serif",
    fontSize: 40,
    weight: 600,
    color: "#f5e7cc",
    align: "center",
    tracking: 0.08,
    lineHeight: 1.15,
    outline: 0,
    outlineColor: "#000000",
    shadow: true,
    background: "none",
    backgroundColor: "#111827",
    start: 0,
    end: duration,
    entrance: "fade",
    exit: "fade",
    animationDuration: 0.8,
    creditSpeed: 18,
    ...patch,
  };
}
export function duplicate(scene: TitleScene): TitleScene {
  return {
    ...scene,
    id: crypto.randomUUID(),
    name: scene.name + " copy",
    background: { ...scene.background },
    text: scene.text.map((t) => ({ ...t, id: crypto.randomUUID() })),
  };
}
export function backgroundStyle(bg: TitleBackground) {
  return bg.kind === "gradient"
    ? `linear-gradient(${bg.angle}deg, ${bg.color}, ${bg.secondary})`
    : bg.color;
}
export const formatTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
