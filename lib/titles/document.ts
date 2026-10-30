import {
  EFFECTS,
  FONTS,
  durationOf,
  type TitleProject,
  type TitleScene,
  type TitleText,
} from "./model";
export interface TitleSource {
  id: string;
  name: string;
  kind: "image" | "video";
  sizeBytes: number;
  width: number;
  height: number;
  duration: number;
  mimeType: string;
  sha256: string;
}
export interface TitlesDraft {
  version: 1;
  document: TitleProject;
  sources: TitleSource[];
}
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("Invalid titles object");
  return v as Record<string, unknown>;
};
const keys = (v: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    throw Error("Unexpected titles fields");
};
const str = (v: unknown, max = 120) => {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    throw Error("Invalid titles text");
  return v;
};
const num = (v: unknown, min: number, max: number) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw Error("Invalid titles number");
  return v;
};
const bool = (v: unknown) => {
  if (typeof v !== "boolean") throw Error("Invalid titles flag");
  return v;
};
const choice = <T extends string | number>(
  v: unknown,
  values: readonly T[],
): T => {
  if (!values.includes(v as T)) throw Error("Invalid titles option");
  return v as T;
};
const id = (v: unknown) => {
  const s = str(v, 100);
  if (!/^[\w-]{1,100}$/.test(s)) throw Error("Invalid titles ID");
  return s;
};
const color = (v: unknown) => {
  const s = str(v, 7);
  if (!/^#[0-9a-f]{6}$/i.test(s)) throw Error("Invalid titles color");
  return s;
};
export function parseTitleProject(value: unknown): TitleProject {
  const v = obj(value);
  keys(v, ["version", "title", "ratio", "scenes", "output"]);
  if (v.version !== 1) throw Error("Unsupported titles version");
  const output = obj(v.output);
  keys(output, ["shortEdge", "fps"]);
  if (!Array.isArray(v.scenes) || v.scenes.length < 1 || v.scenes.length > 12)
    throw Error("Titles require 1–12 scenes");
  const seen = new Set<string>();
  const unique = (value: unknown) => {
    const s = id(value);
    if (seen.has(s)) throw Error("Duplicate titles ID");
    seen.add(s);
    return s;
  };
  const scenes: TitleScene[] = v.scenes.map((value) => {
    const s = obj(value);
    keys(s, ["id", "name", "duration", "text", "background"]);
    const duration = num(s.duration, 1, 120),
      bg = obj(s.background);
    keys(bg, [
      "kind",
      "color",
      "secondary",
      "angle",
      "grain",
      "vignette",
      "assetId",
      "fit",
      "loop",
      "volume",
    ]);
    if (!Array.isArray(s.text) || s.text.length > 8)
      throw Error("At most eight title layers per scene");
    const text: TitleText[] = s.text.map((value) => {
      const t = obj(value);
      keys(t, [
        "id",
        "text",
        "x",
        "y",
        "width",
        "height",
        "rotation",
        "font",
        "fontSize",
        "weight",
        "color",
        "align",
        "tracking",
        "lineHeight",
        "outline",
        "outlineColor",
        "shadow",
        "background",
        "backgroundColor",
        "start",
        "end",
        "entrance",
        "exit",
        "animationDuration",
        "creditSpeed",
      ]);
      const start = num(t.start, 0, duration - 0.1),
        end = num(t.end, start + 0.099999, duration),
        x = num(t.x, 0, 1),
        y = num(t.y, 0, 1),
        width = num(t.width, 0.08, 1),
        height = num(t.height, 0.05, 1),
        entrance = choice(
          t.entrance,
          Object.keys(EFFECTS) as TitleText["entrance"][],
        ),
        content = str(t.text, 2000);
      if (x + width > 1.000001 || y + height > 1.000001)
        throw Error("Title box exceeds canvas");
      if (
        ["word-reveal", "letter-reveal"].includes(entrance) &&
        content.length > 240
      )
        throw Error("Reveal effects support at most 240 characters");
      return {
        id: unique(t.id),
        text: content,
        x,
        y,
        width,
        height,
        rotation: num(t.rotation, -180, 180),
        font: choice(t.font, Object.keys(FONTS) as TitleText["font"][]),
        fontSize: num(t.fontSize, 4, 120),
        weight: choice(t.weight, [400, 600, 700, 900]),
        color: color(t.color),
        align: choice(t.align, ["left", "center", "right"]),
        tracking: num(t.tracking, -0.05, 0.5),
        lineHeight: num(t.lineHeight, 0.8, 3),
        outline: num(t.outline, 0, 8),
        outlineColor: color(t.outlineColor),
        shadow: bool(t.shadow),
        background: choice(t.background, ["none", "tint", "solid"]),
        backgroundColor: color(t.backgroundColor),
        start,
        end,
        entrance,
        exit: choice(t.exit, ["none", "fade", "slide-up", "zoom"]),
        animationDuration: num(t.animationDuration, 0.05, 10),
        creditSpeed: num(t.creditSpeed, 1, 500),
      };
    });
    return {
      id: unique(s.id),
      name: str(s.name),
      duration,
      text,
      background: {
        kind: choice(bg.kind, ["solid", "gradient", "image", "video"]),
        color: color(bg.color),
        secondary: color(bg.secondary),
        angle: num(bg.angle, 0, 360),
        grain: bool(bg.grain),
        vignette: bool(bg.vignette),
        ...(bg.assetId === undefined ? {} : { assetId: id(bg.assetId) }),
        fit: choice(bg.fit, ["contain", "cover"]),
        loop: bool(bg.loop),
        volume: bg.volume === undefined ? 0 : num(bg.volume, 0, 1),
      },
    };
  });
  return {
    version: 1,
    title: str(v.title).trim() || "Untitled film",
    ratio: choice(v.ratio, ["16:9", "9:16", "1:1", "4:5"]),
    scenes,
    output: {
      shortEdge: choice(output.shortEdge, [360, 480, 720, 1080]),
      fps: choice(output.fps, [24, 30]),
    },
  };
}
export function parseTitlesDraft(value: unknown): TitlesDraft {
  const v = obj(value);
  keys(v, ["version", "document", "sources"]);
  if (v.version !== 1 || !Array.isArray(v.sources) || v.sources.length > 12)
    throw Error("Invalid titles draft");
  if (new TextEncoder().encode(JSON.stringify(v)).length > 24576)
    throw Error(
      "Titles metadata exceeds 24 KiB. Shorten text or use fewer scenes.",
    );
  const document = parseTitleProject(v.document),
    sources: TitleSource[] = v.sources.map((value) => {
      const s = obj(value);
      keys(s, [
        "id",
        "name",
        "kind",
        "sizeBytes",
        "width",
        "height",
        "duration",
        "mimeType",
        "sha256",
      ]);
      const kind = choice(s.kind, ["image", "video"]),
        hash = str(s.sha256, 64);
      if (!/^[a-f0-9]{64}$/.test(hash))
        throw Error("Invalid background fingerprint");
      return {
        id: id(s.id),
        name: str(s.name, 255),
        kind,
        sizeBytes: num(s.sizeBytes, 1, (kind === "image" ? 16 : 256) * 1048576),
        width: num(s.width, 1, 65535),
        height: num(s.height, 1, 65535),
        duration: num(s.duration, kind === "image" ? 0 : 0.001, 31536000),
        mimeType: str(s.mimeType, 100),
        sha256: hash,
      };
    });
  if (
    new Set(sources.map((s) => s.id)).size !== sources.length ||
    sources.reduce((n, s) => n + s.sizeBytes, 0) > 256 * 1048576
  )
    throw Error("Invalid background registry or combined file size");
  const used = new Set<string>();
  for (const scene of document.scenes) {
    if (["image", "video"].includes(scene.background.kind)) {
      const source = sources.find((s) => s.id === scene.background.assetId);
      if (!source || source.kind !== scene.background.kind)
        throw Error("Missing saved background metadata");
      used.add(source.id);
    }
  }
  if (sources.some((s) => !used.has(s.id)))
    throw Error("Unused saved background metadata");
  return { version: 1, document, sources };
}
export function outputSize(p: TitleProject) {
  const [rw, rh] = p.ratio.split(":").map(Number),
    edge = p.output.shortEdge;
  return {
    width: Math.round((edge * rw) / Math.min(rw, rh) / 2) * 2,
    height: Math.round((edge * rh) / Math.min(rw, rh) / 2) * 2,
  };
}
export function renderBudget(p: TitleProject) {
  const frames = Math.ceil(durationOf(p) * p.output.fps - 1e-7),
    { width, height } = outputSize(p);
  if (frames > 2880 || frames * width * height > 1800000000)
    throw Error(
      "This local titles renderer starts with short sequences: at most 2,880 frames and 1.8 billion frame-pixels. Choose 360/480 px, shorten scenes, or split the project. No quality was changed automatically.",
    );
  return {
    frames,
    width,
    height,
    duration: frames / p.output.fps,
    requestedDuration: durationOf(p),
  };
}
