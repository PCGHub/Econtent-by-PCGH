"use client";
import type { Json } from "../supabase/database.types";
import { browserSupabase } from "../supabase/browser";
import { fingerprint } from "../projects/fingerprint";
import { MEDIA_BUCKET, type CloudAsset, type StorageUsage } from "./model";
export const STORAGE_CHANGED = "econtent-storage-changed";
export async function mediaAction<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const client = browserSupabase();
  if (!client) throw Error("Cloud storage is not configured.");
  const { data, error } = await client
    .rpc("project_media_action", { action, payload: payload as Json })
    .abortSignal(AbortSignal.timeout(15000));
  if (error)
    throw Error(
      error.message.includes("project_media_action")
        ? "Cloud media setup is not available yet. Your settings and local files are safe."
        : error.message,
    );
  return data as T;
}
export function listMedia(projectId: string) {
  return mediaAction<{ usage: StorageUsage; assets: CloudAsset[] }>("list", {
    projectId,
  });
}
export async function uploadMedia(
  projectId: string,
  file: File,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (file.size > 50000000)
    throw Error(
      "This development preview supports cloud files up to 50 MB. Your local editing file is unchanged.",
    );
  const sha256 = await fingerprint(file, signal);
  const asset = await mediaAction<CloudAsset>("reserve", {
    projectId,
    sha256,
    name: file.name,
    sizeBytes: file.size,
    mimeType: file.type || "application/octet-stream",
  });
  signal.throwIfAborted();
  if (asset.state === "ready") return asset;
  const client = browserSupabase()!;
  // Reconcile an upload that reached storage before the previous browser request ended.
  const finalized = await mediaAction<CloudAsset>("finalize", {
    projectId,
    assetId: asset.id,
  }).catch(() => null);
  if (finalized) return finalized;
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw Error("Sign in again before uploading media.");
  const config = await import("../supabase/config").then(
    (m) => m.supabaseConfig()!,
  );
  const result = await fetch(
    `${config.url}/storage/v1/object/${MEDIA_BUCKET}/${asset.object_path}`,
    {
      method: "POST",
      signal: AbortSignal.any([signal, AbortSignal.timeout(600000)]),
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: file,
    },
  );
  if (!result.ok) {
    const error = await result.json().catch(() => ({}));
    throw Error(
      error.message || "Cloud video upload failed. Your local file is safe.",
    );
  }
  signal.throwIfAborted();
  const ready = await mediaAction<CloudAsset>("finalize", {
    projectId,
    assetId: asset.id,
  });
  window.dispatchEvent(new Event(STORAGE_CHANGED));
  return ready;
}
export async function downloadMedia(asset: CloudAsset, signal: AbortSignal) {
  const client = browserSupabase()!;
  const config = await import("../supabase/config").then(
    (m) => m.supabaseConfig()!,
  );
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw Error("Sign in again to restore media.");
  const result = await fetch(
    `${config.url}/storage/v1/object/authenticated/${MEDIA_BUCKET}/${asset.object_path}`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(600000)]),
      cache: "no-store",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );
  if (!result.ok)
    throw Error(
      "Cloud file is unavailable or expired. Reconnect your original file.",
    );
  const file = new File([await result.blob()], asset.name, {
    type: asset.mime_type,
  });
  if (
    file.size !== asset.size_bytes ||
    (await fingerprint(file, signal)) !== asset.sha256
  )
    throw Error("Cloud file failed verification. Reconnect the original file.");
  return file;
}
export async function removeMedia(projectId: string, assetId: string) {
  const asset = await mediaAction<CloudAsset>("deleting", {
    projectId,
    assetId,
  });
  const { error } = await browserSupabase()!
    .storage.from(MEDIA_BUCKET)
    .remove([asset.object_path]);
  if (error)
    throw Error(
      "Cloud file removal failed. Space has not been released; retry deletion.",
    );
  await mediaAction("release", { projectId, assetId });
  window.dispatchEvent(new Event(STORAGE_CHANGED));
}
