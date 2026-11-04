"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccount } from "./provider";
import {
  downloadMedia,
  listMedia,
  mediaAction,
  removeMedia,
  STORAGE_CHANGED,
  uploadMedia,
} from "@/lib/storage/client";
import {
  expiryMessage,
  storageBytes,
  type CloudAsset,
  type StorageUsage,
} from "@/lib/storage/model";
export function StorageMeter() {
  const { user } = useAccount();
  const [usage, setUsage] = useState<StorageUsage>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () =>
      void mediaAction<StorageUsage>("usage")
        .then((u) => {
          if (active) {
            setUsage(u);
            setError("");
          }
        })
        .catch(() => {
          if (active)
            setError(
              "Cloud media storage is unavailable. Saved editing settings remain accessible.",
            );
        });
    load();
    window.addEventListener(STORAGE_CHANGED, load);
    return () => {
      active = false;
      window.removeEventListener(STORAGE_CHANGED, load);
    };
  }, [user]);
  if (!user) return null;
  return (
    <section
      aria-label="Cloud storage usage"
      className="my-5 rounded-xl border border-blue-100 bg-white p-4 text-sm text-slate-700"
    >
      {usage ? (
        <>
          <div className="flex flex-wrap justify-between gap-2">
            <strong>
              {usage.plan === "premium" ? "Premium" : "Free"} cloud storage
            </strong>
            <span>
              {storageBytes(usage.usedBytes)} of{" "}
              {storageBytes(usage.limitBytes)} used
            </span>
          </div>
          <progress
            aria-label="Storage used"
            max={usage.limitBytes}
            value={usage.usedBytes}
            className="mt-3 h-2 w-full accent-blue-600"
          />
          <p className="mt-2 text-xs">
            {storageBytes(Math.max(0, usage.limitBytes - usage.usedBytes))}{" "}
            available · Files expire {usage.retentionDays} days after project
            creation. Deleting files restores space.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Development preview: 50 MB per cloud file and 900 MB shared test
            capacity. Editing limits are separate. No paid checkout is enabled.
          </p>
        </>
      ) : (
        <p role="status">{error || "Checking cloud storage…"}</p>
      )}
    </section>
  );
}
export function CloudMediaPanel({
  projectId,
  files,
  onRestore,
}: {
  projectId?: string;
  files: File[];
  onRestore?: (
    file: File,
    sha256: string,
    signal: AbortSignal,
  ) => Promise<void>;
}) {
  const { user } = useAccount();
  const [assets, setAssets] = useState<CloudAsset[]>([]),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0);
  const operation = useRef<AbortController | null>(null),
    restored = useRef(new Set<string>()),
    restoreRef = useRef(onRestore),
    filesRef = useRef(files);
  useEffect(() => {
    restoreRef.current = onRestore;
    filesRef.current = files;
  }, [onRestore, files]);
  const refresh = useCallback(async () => {
    if (!projectId) return;
    const data = await listMedia(projectId);
    setAssets(data.assets);
    return data.assets;
  }, [projectId]);
  useEffect(() => {
    if (!projectId || !user) return;
    const controller = new AbortController();
    operation.current = controller;
    let active = true;
    void (async () => {
      try {
        const data = await listMedia(projectId);
        if (!active) return;
        setAssets(data.assets);
        for (const asset of data.assets) {
          if (
            asset.state !== "ready" ||
            Date.parse(asset.expires_at) <= Date.now() ||
            restored.current.has(asset.sha256) ||
            !restoreRef.current
          )
            continue;
          // Existing connected files need no second in-memory copy.
          if (
            filesRef.current.some(
              (f) => f.name === asset.name && f.size === asset.size_bytes,
            )
          )
            continue;
          setBusy(true);
          setMessage("Restoring saved project media…");
          const file = await downloadMedia(asset, controller.signal);
          controller.signal.throwIfAborted();
          await restoreRef.current(file, asset.sha256, controller.signal);
          restored.current.add(asset.sha256);
        }
        if (active)
          setMessage(
            data.assets.some(
              (a) =>
                a.state === "ready" && Date.parse(a.expires_at) > Date.now(),
            )
              ? "Cloud media available. Saved source files reopen across devices."
              : "No cloud media saved. Save source files below to reopen without uploading again.",
          );
      } catch (e) {
        if (active && !controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Unable to restore cloud files.",
          );
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, user, tick]);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const load = () =>
      void listMedia(projectId)
        .then((data) => {
          if (active) setAssets(data.assets);
        })
        .catch(() => {});
    window.addEventListener(STORAGE_CHANGED, load);
    return () => {
      active = false;
      window.removeEventListener(STORAGE_CHANGED, load);
    };
  }, [projectId]);
  useEffect(() => () => operation.current?.abort(), []);
  async function upload() {
    if (!projectId || busy) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try {
      for (let i = 0; i < files.length; i++) {
        setMessage(
          `Saving source file ${i + 1} of ${files.length}… Keep this page open.`,
        );
        await uploadMedia(projectId, files[i], controller.signal);
      }
      await refresh();
      setMessage(
        "Source files saved to your workspace. You can reopen this project on another device.",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Media upload failed.");
      else setMessage("Upload interrupted. Retry to check its saved state.");
    } finally {
      setBusy(false);
    }
  }
  if (!user) return null;
  return (
    <section
      aria-label="Cloud project media"
      className="my-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-slate-700"
    >
      <h2 className="font-semibold">Save media to your workspace</h2>
      <p className="mt-2 text-xs">
        Source files you save here are uploaded to private cloud storage. Free:
        500 MB / 3 days. Premium: 5 GB / 30 days. Editing settings stay saved
        after files expire. Download finished videos for your own backup;
        exports are currently local.
      </p>
      {!projectId ? (
        <p className="mt-3">
          Save this project first, then save its source files here.
        </p>
      ) : (
        <>
          <p role="status" className="mt-3">
            {message || "Checking saved media…"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !files.length}
              onClick={() => void upload()}
            >
              Save source files to workspace
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setError("");
                setTick((n) => n + 1);
              }}
            >
              Retry cloud restore
            </Button>
            {busy && (
              <Button
                variant="outline"
                onClick={() => operation.current?.abort()}
              >
                Cancel media transfer
              </Button>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {assets.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2"
              >
                <span>
                  {a.name} · {storageBytes(a.size_bytes)} ·{" "}
                  {a.state === "ready"
                    ? expiryMessage(a.expires_at)
                    : a.state === "pending"
                      ? "Upload incomplete; reserved space"
                      : "Deletion pending"}
                  <span className="block text-xs text-slate-500">
                    Expires {new Date(a.expires_at).toLocaleString()}
                  </span>
                </span>
                <button
                  disabled={busy}
                  className="text-xs font-semibold text-red-700 underline"
                  onClick={async () => {
                    if (
                      !confirm(
                        "Delete this cloud file? Reopening will require the original file. Your edits will stay saved.",
                      )
                    )
                      return;
                    setBusy(true);
                    setError("");
                    try {
                      await removeMedia(projectId!, a.id);
                      await refresh();
                      setMessage(
                        "Cloud file removed. Its storage space is available again.",
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Deletion failed",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Delete cloud file
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
