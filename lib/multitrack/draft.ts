export type MediaKind = "video" | "image" | "audio";
export interface TrackSource {
  id: string;
  kind: MediaKind;
  name: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  duration: number;
}
export interface TrackClip {
  id: string;
  sourceId: string;
  start: number;
  end: number;
  speed: number;
}
export interface TrackText {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  font: string;
  size: number;
  color: string;
  frame: boolean;
  fadeIn: number;
  fadeOut: number;
}
export interface MultitrackDraft {
  version: 1;
  sources: TrackSource[];
  clips: TrackClip[];
  hooks: TrackText[];
  audio: {
    videoVolume: number;
    musicVolume: number;
    videoMuted: boolean;
    musicMuted: boolean;
  };
}
export function parseMultitrack(value: unknown): MultitrackDraft {
  const obj = (v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw Error("Invalid timeline data");
    return v as Record<string, unknown>;
  };
  const exact = (v: Record<string, unknown>, keys: string[]) => {
    if (
      Object.keys(v).length !== keys.length ||
      Object.keys(v).some((k) => !keys.includes(k))
    )
      throw Error("Unexpected timeline fields");
  };
  const num = (v: unknown, min: number, max: number) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      throw Error("Invalid timeline number");
    return v;
  };
  const str = (v: unknown, max = 100) => {
    if (
      typeof v !== "string" ||
      !v.trim() ||
      v.length > max ||
      /[\u0000-\u001f]/.test(v)
    )
      throw Error("Invalid timeline text");
    return v;
  };
  const bool = (v: unknown) => {
    if (typeof v !== "boolean") throw Error("Invalid timeline switch");
    return v;
  };
  const v = obj(value);
  exact(v, ["version", "sources", "clips", "hooks", "audio"]);
  if (
    v.version !== 1 ||
    !Array.isArray(v.sources) ||
    v.sources.length > 40 ||
    !Array.isArray(v.clips) ||
    v.clips.length > 100 ||
    !Array.isArray(v.hooks) ||
    v.hooks.length > 30
  )
    throw Error("Timeline exceeds supported limits");
  const sources = v.sources.map((raw) => {
    const s = obj(raw);
    exact(s, [
      "id",
      "kind",
      "name",
      "sizeBytes",
      "mimeType",
      "sha256",
      "duration",
    ]);
    const kind = str(s.kind) as MediaKind;
    if (!["video", "image", "audio"].includes(kind))
      throw Error("Invalid source kind");
    const sha256 = str(s.sha256);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw Error("Invalid source identity");
    const sizeBytes = num(s.sizeBytes, 1, 256 * 1048576);
    if (!Number.isSafeInteger(sizeBytes)) throw Error("Invalid source size");
    return {
      id: str(s.id),
      kind,
      name: str(s.name, 255),
      sizeBytes,
      mimeType: str(s.mimeType),
      sha256,
      duration: num(s.duration, 0.001, 31536000),
    };
  });
  if (
    new Set(sources.map((s) => s.id)).size !== sources.length ||
    sources.reduce((n, s) => n + s.sizeBytes, 0) > 256 * 1048576
  )
    throw Error("Duplicate sources or excessive media size");
  const clips = v.clips.map((raw) => {
    const c = obj(raw);
    exact(c, ["id", "sourceId", "start", "end", "speed"]);
    const sourceId = str(c.sourceId),
      s = sources.find((s) => s.id === sourceId);
    if (!s) throw Error("Timeline source missing");
    const start = num(c.start, 0, s.duration),
      end = num(c.end, start + 0.001, s.duration),
      speed = num(c.speed, 0.25, 2);
    return { id: str(c.id), sourceId, start, end, speed };
  });
  if (new Set(clips.map((c) => c.id)).size !== clips.length)
    throw Error("Duplicate clips");
  const hooks = v.hooks.map((raw) => {
    const h = obj(raw);
    exact(h, [
      "id",
      "text",
      "start",
      "end",
      "x",
      "y",
      "font",
      "size",
      "color",
      "frame",
      "fadeIn",
      "fadeOut",
    ]);
    const start = num(h.start, 0, 31536000),
      end = num(h.end, start + 0.001, 31536000),
      color = str(h.color, 20),
      font = str(h.font);
    if (
      !/^#[a-f0-9]{6}$/i.test(color) ||
      ![
        "Georgia, serif",
        "Impact, sans-serif",
        "Arial, sans-serif",
        "Times New Roman, serif",
        "Courier New, monospace",
        "Trebuchet MS, sans-serif",
      ].includes(font)
    )
      throw Error("Invalid title appearance");
    return {
      id: str(h.id),
      text: str(h.text, 1000),
      start,
      end,
      x: num(h.x, 0, 100),
      y: num(h.y, 0, 100),
      font,
      size: num(h.size, 1, 400),
      color,
      frame: bool(h.frame),
      fadeIn: num(h.fadeIn, 0, (end - start) / 2),
      fadeOut: num(h.fadeOut, 0, (end - start) / 2),
    };
  });
  const a = obj(v.audio);
  exact(a, ["videoVolume", "musicVolume", "videoMuted", "musicMuted"]);
  return {
    version: 1,
    sources,
    clips,
    hooks,
    audio: {
      videoVolume: num(a.videoVolume, 0, 1),
      musicVolume: num(a.musicVolume, 0, 1),
      videoMuted: bool(a.videoMuted),
      musicMuted: bool(a.musicMuted),
    },
  };
}
