import {parseStudioDraft,type StudioDraft} from "../composition/studio-draft";
import type {Json} from "../supabase/database.types";
import {parseCompositionDraft,type CompositionDraft} from "../composition/draft";
import type { CompressionPreset, CutStrategy, EditMode } from "../video/types";
import { createCutPlan } from "../video/planner";
export interface EditorSettings {
  mode: EditMode;
  range: { start: number; end: number };
  clipDuration: number;
  keepRemainder: boolean;
  compression: CompressionPreset;
  cutStrategy: CutStrategy;
}
export interface SourceMetadata {
  name: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  mimeType: string;
  sha256: string;
}
export type ProjectStatus =
  | "draft"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed";
export interface ProjectDraft {
  title: string;
  composition?: CompositionDraft | null;
  studioTracks?: StudioDraft | null;
  settings: EditorSettings;
  source: SourceMetadata | null;
  status: ProjectStatus;
}
export interface Project extends ProjectDraft {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export const DEFAULT_SETTINGS: EditorSettings = {
  mode: "manual-trim",
  range: { start: 0, end: 0 },
  clipDuration: 30,
  keepRemainder: true,
  compression: "off",
  cutStrategy: "fast",
};
export const EMPTY_DRAFT: ProjectDraft = {
  title: "Untitled project",
  settings: DEFAULT_SETTINGS,
  source: null,
  status: "draft",
};
export const PROJECT_COLUMNS =
  "id,title,edit_mode,cut_start,cut_end,clip_duration,keep_remainder,compression,cut_strategy,source_metadata,composition,studio_tracks,status,revision,created_at,updated_at";
export function isProjectId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("Unexpected project fields");
}
function text(value: unknown, label: string, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error(`${label} is invalid`);
  return value.trim();
}
function number(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${label} is invalid`);
  return value;
}
function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new Error(`${label} is invalid`);
  return value as T;
}
export function parseProjectDraft(input: unknown): ProjectDraft {
  const data = object(input, "Project");
  keys(data, ["title", "settings", "source", "status", "composition", "studioTracks"]);
  const cfg = object(data.settings, "Settings");
  keys(cfg, [
    "mode",
    "range",
    "clipDuration",
    "keepRemainder",
    "compression",
    "cutStrategy",
  ]);
  const range = object(cfg.range, "Cut range");
  keys(range, ["start", "end"]);
  if (typeof cfg.keepRemainder !== "boolean")
    throw new Error("Keep remainder must be true or false");
  const settings: EditorSettings = {
    mode: choice(
      cfg.mode,
      ["full-split", "section-split", "manual-trim", "compress-only"],
      "Editing mode",
    ),
    range: {
      start: number(range.start, "Start", 0, 31536000),
      end: number(range.end, "End", 0, 31536000),
    },
    clipDuration: number(cfg.clipDuration, "Clip duration", 0.001, 31536000),
    keepRemainder: cfg.keepRemainder,
    compression: choice(
      cfg.compression,
      ["off", "high", "balanced", "small"],
      "Compression",
    ),
    cutStrategy: choice(cfg.cutStrategy, ["fast", "precision"], "Cut method"),
  };
  if (settings.range.end < settings.range.start)
    throw new Error("End must be at or after start");
  if (settings.compression !== "off" && settings.cutStrategy !== "precision")
    throw new Error("Compression requires Precision Cut");
  let source: SourceMetadata | null = null;
  if (data.source !== null) {
    const meta = object(data.source, "Source metadata");
    keys(meta, [
      "name",
      "sizeBytes",
      "durationSeconds",
      "width",
      "height",
      "mimeType",
      "sha256",
    ]);
    const sha256 = text(meta.sha256, "Source fingerprint", 64);
    if (!/^[a-f0-9]{64}$/.test(sha256))
      throw new Error("Invalid source fingerprint");
    source = {
      name: text(meta.name, "Video name", 255),
      sizeBytes: number(meta.sizeBytes, "Video size", 1, 268435456),
      durationSeconds: number(
        meta.durationSeconds,
        "Video duration",
        0.001,
        31536000,
      ),
      width: number(meta.width, "Video width", 1, 65535),
      height: number(meta.height, "Video height", 1, 65535),
      mimeType: text(meta.mimeType, "Video type", 100),
      sha256,
    };
    for (const key of ["sizeBytes", "width", "height"] as const)
      if (!Number.isInteger(source[key]))
        throw new Error("Video metadata must use whole-number sizes");
    if (settings.range.end > source.durationSeconds + 0.001)
      throw new Error("Saved range exceeds video duration");
    createCutPlan({
      mode: settings.mode,
      sourceDuration: source.durationSeconds,
      selectedRange: settings.range,
      clipDuration: settings.clipDuration,
      keepRemainder: settings.keepRemainder,
    });
  }
  const composition=data.composition==null?undefined:parseCompositionDraft(data.composition);
  if(composition){
    if(!source)throw new Error("Composition requires main source metadata");
    if(settings.mode!=="manual-trim"||settings.cutStrategy!=="precision"||settings.compression!=="off"||settings.range.start!==composition.settings.trimStart||settings.range.end!==composition.settings.trimEnd)throw new Error("Composition and project ranges must match");
    if(source.sizeBytes+composition.layer.sizeBytes>256*1048576)throw new Error("Combined composition source size exceeds limit");
  }
  const studioTracks=data.studioTracks==null?undefined:parseStudioDraft(data.studioTracks,settings.range.end-settings.range.start);
  if(studioTracks&&(!composition||!source||source.sizeBytes+composition.layer.sizeBytes+studioTracks.sources.reduce((n,a)=>n+a.sizeBytes,0)>256*1048576))throw new Error("Studio tracks require a composition within the source memory limit");
  if(composition?.settings.tracks)throw new Error("Persist timed tracks in studioTracks, not composition settings");
  return {
    ...(studioTracks?{studioTracks}:{}),
    ...(composition?{composition}:{}),
    title: text(data.title, "Project title", 120),
    settings,
    source,
    status: choice(
      data.status,
      ["draft", "processing", "completed", "cancelled", "failed"],
      "Project status",
    ),
  };
}
export function toRow(draft: ProjectDraft) {
  return {
    title: draft.title,
    edit_mode: draft.settings.mode,
    cut_start: draft.settings.range.start,
    cut_end: draft.settings.range.end,
    clip_duration: draft.settings.clipDuration,
    keep_remainder: draft.settings.keepRemainder,
    compression: draft.settings.compression,
    cut_strategy: draft.settings.cutStrategy,
    source_metadata: draft.source ? {...draft.source} : null,
    composition: draft.composition ? JSON.parse(JSON.stringify({settings:{...draft.composition.settings},layer:{...draft.composition.layer}})) as Json : null,
    studio_tracks: draft.studioTracks ? JSON.parse(JSON.stringify(draft.studioTracks)) as Json : null,
    status: draft.status,
  };
}
export function fromRow(row: Record<string, unknown>): Project {
  const draft = parseProjectDraft({
    title: row.title,
    settings: {
      mode: row.edit_mode,
      range: { start: row.cut_start, end: row.cut_end },
      clipDuration: row.clip_duration,
      keepRemainder: row.keep_remainder,
      compression: row.compression,
      cutStrategy: row.cut_strategy,
    },
    source: row.source_metadata,
    composition: row.composition,
    studioTracks: row.studio_tracks,
    status: row.status,
  });
  if (
    !isProjectId(String(row.id)) ||
    !Number.isSafeInteger(row.revision) ||
    Number(row.revision) < 1
  )
    throw new Error("Invalid saved project revision");
  return {
    ...draft,
    id: String(row.id),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
export function projectSignature(draft: ProjectDraft): string {
  return JSON.stringify(toRow(draft));
}
