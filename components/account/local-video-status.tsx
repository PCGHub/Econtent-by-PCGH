"use client";
import { useEffect, useState } from "react";
import type { SourceMetadata } from "@/lib/projects/model";
import {
  LOCAL_VIDEO_CHANGED,
  localVideoInfo,
  clearLocalVideos,
} from "@/lib/projects/local-video";
import { useAccount } from "./provider";
export function LocalVideoBadge({ source }: { source: SourceMetadata | null }) {
  const { user } = useAccount();
  const ownerId = user?.id;
  const [state, setState] = useState("Checking local video…");
  useEffect(() => {
    const controller = new AbortController();
    const check = () => {
      if (!ownerId || !source) return;
      void localVideoInfo(ownerId, source.sha256, controller.signal)
        .then((info) => {
          if (!controller.signal.aborted)
            setState(
              info && info.sizeBytes === source.sizeBytes
                ? "Video available on this device"
                : "Reconnect video required",
            );
        })
        .catch(() => {
          if (!controller.signal.aborted) setState("Reconnect video required");
        });
    };
    check();
    window.addEventListener(LOCAL_VIDEO_CHANGED, check);
    window.addEventListener("focus", check);
    return () => {
      controller.abort();
      window.removeEventListener(LOCAL_VIDEO_CHANGED, check);
      window.removeEventListener("focus", check);
    };
  }, [ownerId, source]);
  if (!source || !ownerId) return null;
  return (
    <p
      className="mt-2 text-xs font-medium text-slate-600"
      data-testid="local-video-availability"
    >
      {state}
    </p>
  );
}
export function ClearLocalVideos() {
  const { user } = useAccount();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function clear() {
    if (
      !user ||
      busy ||
      !window.confirm(
        "Remove all remembered Cutter videos for this account from this browser? Saved cloud projects and original files are not deleted.",
      )
    )
      return;
    setBusy(true);
    try {
      await clearLocalVideos(user.id);
      setMessage(
        "Remembered videos removed from this browser. Saved projects are unchanged.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Local storage could not be cleared.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 text-xs leading-5 text-slate-500">
      <p>
        Optional remembered Cutter videos stay in this browser profile only.
        Other devices need the original file. Clearing site data removes local
        copies.
      </p>
      {user && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void clear()}
          className="mt-2 rounded px-2 py-1 font-semibold text-blue-700 underline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          {busy
            ? "Removing local copies…"
            : "Clear remembered videos from this browser"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
