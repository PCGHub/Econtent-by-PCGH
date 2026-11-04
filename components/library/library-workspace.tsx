"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StorageMeter } from "@/components/account/cloud-storage";
import { browserSupabase } from "@/lib/supabase/browser";
import { projectRequest } from "@/lib/projects/client";
import { EMPTY_DRAFT } from "@/lib/projects/model";
import { downloadMedia, removeMedia, uploadMedia } from "@/lib/storage/client";
import {
  expiryMessage,
  storageBytes,
  type CloudAsset,
} from "@/lib/storage/model";
import { downloadBlob } from "@/lib/video/download";
export function LibraryWorkspace() {
  const [items, setItems] = useState<CloudAsset[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [status, setStatus] = useState<"draft" | "completed">("draft");
  const [now] = useState(() => Date.now());
  const pendingProject = useRef<string | null>(null),
    operation = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const client = browserSupabase();
    if (!client) return;
    const { data, error } = await client
      .from("project_media")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setMessage(
        "Cloud library is unavailable. Your project settings remain saved.",
      );
      return;
    }
    setItems(data as unknown as CloudAsset[]);
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
    return () => operation.current?.abort();
  }, [load]);
  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    const controller = new AbortController();
    operation.current = controller;
    setMessage("Saving file to your private workspace…");
    try {
      if (!pendingProject.current) {
        const result = await projectRequest("", {
          method: "POST",
          body: JSON.stringify({
            ...EMPTY_DRAFT,
            title: file.name.slice(0, 120),
            status,
          }),
        });
        pendingProject.current = result.project.id;
      }
      await uploadMedia(pendingProject.current!, file, controller.signal);
      pendingProject.current = null;
      setFile(null);
      await load();
      window.dispatchEvent(new Event("econtent-storage-changed"));
      setMessage(
        "File saved. Deleting it or automatic expiry restores its storage space.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Upload failed. Retry to resume.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-6xl p-5">
      <h1 className="text-2xl font-bold">My Library</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your private cloud project files and saved exports. Editing settings
        remain in My Projects after files expire.
      </p>
      <StorageMeter />
      <section className="mt-5 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Save a file or finished export</h2>
        <p className="mt-2 text-xs text-slate-500">
          Uploading uses your storage allowance. Preview limit: 50 MB per file.
          Free files expire after 3 days; Premium after 30 days.
        </p>
        <input
          aria-label="Choose file to save"
          type="file"
          disabled={busy}
          className="mt-3 block w-full text-sm"
          onChange={(e) => {
            pendingProject.current = null;
            setFile(e.target.files?.[0] ?? null);
          }}
        />
        <select
          aria-label="File status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "draft" | "completed")}
          className="mt-3 rounded-lg border p-2 text-sm"
        >
          <option value="draft">Pending work</option>
          <option value="completed">Completed work</option>
        </select>
        <button
          disabled={busy || !file}
          onClick={() => void upload()}
          className="ml-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Working…" : "Save to Library"}
        </button>
        {busy && (
          <button
            className="ml-3 text-sm underline"
            onClick={() => operation.current?.abort()}
          >
            Cancel upload
          </button>
        )}
      </section>
      {message && (
        <p role="status" className="mt-4 text-sm">
          {message}
        </p>
      )}
      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border bg-white p-4">
            <h2 className="truncate font-semibold">{item.name}</h2>
            <p className="mt-2 text-xs">
              {storageBytes(item.size_bytes)} ·{" "}
              {item.state === "ready"
                ? expiryMessage(item.expires_at)
                : item.state === "pending"
                  ? "Incomplete upload"
                  : "Deletion pending"}
            </p>
            <time
              dateTime={item.expires_at}
              className="mt-2 block text-xs text-slate-500"
            >
              Expires {new Date(item.expires_at).toLocaleString()}
            </time>
            <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-blue-700">
              <Link href={"/projects/" + item.project_id}>Open project</Link>
              <button
                disabled={
                  busy ||
                  item.state !== "ready" ||
                  Date.parse(item.expires_at) <= now
                }
                onClick={async () => {
                  const c = new AbortController();
                  operation.current = c;
                  setBusy(true);
                  try {
                    downloadBlob(
                      await downloadMedia(item, c.signal),
                      item.name,
                    );
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : "Download failed",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Download
              </button>
              <button
                disabled={busy}
                className="text-red-700"
                onClick={async () => {
                  if (
                    !confirm(
                      "Delete this cloud file? Your saved editing settings will remain.",
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    await removeMedia(item.project_id, item.id);
                    await load();
                    setMessage("File removed. Space is available again.");
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : "Deletion failed",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete file
              </button>
            </div>
          </article>
        ))}
      </section>
      {!items.length && (
        <p className="mt-5 text-sm text-slate-500">No cloud files saved yet.</p>
      )}
    </div>
  );
}
