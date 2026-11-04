import type { Project } from "../projects/model";
export const MEDIA_BUCKET = "econtent-project-media";
export interface CloudAsset {
  id: string;
  project_id: string;
  sha256: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  object_path: string;
  state: "pending" | "ready" | "deleting";
  expires_at: string;
}
export interface StorageUsage {
  plan: "free" | "premium";
  limitBytes: number;
  usedBytes: number;
  retentionDays: number;
  maxFileBytes: number;
}
export function storageBytes(bytes: number) {
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(2)} GB`
    : `${(bytes / 1e6).toFixed(1)} MB`;
}
export function expiryMessage(expiresAt: string, now = Date.now()) {
  const left = Date.parse(expiresAt) - now;
  return left <= 0
    ? "Files expired"
    : left <= 86400000
      ? `Expires in ${Math.max(1, Math.ceil(left / 3600000))} hours`
      : `Expires in ${Math.ceil(left / 86400000)} days`;
}
export function projectSources(p: Project) {
  return [
    p.source,
    p.composition?.layer,
    ...(p.studioTracks?.sources ?? []),
    ...(p.titles?.sources ?? []),
    ...(p.multitrack?.sources ?? []),
  ].filter((s): s is NonNullable<typeof s> => !!s);
}
