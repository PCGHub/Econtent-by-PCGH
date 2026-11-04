"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fingerprint } from "@/lib/projects/fingerprint";
import type { SourceMetadata } from "@/lib/projects/model";
import {
  LOCAL_VIDEO_CHANGED,
  LocalVideoMismatch,
  localVideoInfo,
  readRememberedVideo,
  rememberVideo,
  forgetVideo,
} from "@/lib/projects/local-video";
type State = {
  phase: "idle" | "checking" | "missing" | "available" | "writing" | "error";
  message: string;
};
export function useLocalVideo({
  ownerId,
  source,
  file,
  digest,
  onRestore,
}: {
  ownerId?: string;
  source?: SourceMetadata | null;
  file?: File;
  digest: string;
  onRestore: (file: File, signal: AbortSignal) => Promise<void>;
}) {
  const sha = source?.sha256 ?? digest;
  const [state, setState] = useState<State>({
    phase: source ? "checking" : "idle",
    message: "",
  });
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      operation.current?.abort();
      const controller = new AbortController();
      operation.current = controller;
      void (async () => {
        await Promise.resolve();
        if (!active) return;
        if (!ownerId || !sha) {
          setState({ phase: "idle", message: "" });
          return;
        }
        setState({
          phase: "checking",
          message: "Checking for a remembered video in this browser…",
        });
        try {
          const info = await localVideoInfo(ownerId, sha, controller.signal);
          if (!active || controller.signal.aborted) return;
          if (!info) {
            setState({
              phase: "missing",
              message:
                source && !file
                  ? "Project loaded — reconnect your video to continue."
                  : "No local copy stored. Reconnect will be needed next time.",
            });
            return;
          }
          if (source && !file) {
            setState({
              phase: "checking",
              message: "Verifying remembered video locally…",
            });
            try {
              const copy = await readRememberedVideo(
                ownerId,
                source,
                controller.signal,
              );
              if (!copy)
                throw new LocalVideoMismatch(
                  "The local copy is no longer available. Reconnect your video.",
                );
              const hash = await fingerprint(copy, controller.signal);
              if (hash !== source.sha256)
                throw new LocalVideoMismatch(
                  "The local copy failed its video fingerprint check. Reconnect the exact original file.",
                );
              controller.signal.throwIfAborted();
              await onRestore(copy, controller.signal);
            } catch (error) {
              if (
                error instanceof LocalVideoMismatch &&
                !controller.signal.aborted
              )
                await forgetVideo(ownerId, sha, controller.signal, false);
              throw error;
            }
          }
          if (!controller.signal.aborted)
            setState({
              phase: "available",
              message: "Video available on this device.",
            });
        } catch (error) {
          if (active && !controller.signal.aborted)
            setState({
              phase: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Local video unavailable. Reconnect the original file.",
            });
        }
      })();
    };
    load();
    window.addEventListener(LOCAL_VIDEO_CHANGED, load);
    return () => {
      active = false;
      operation.current?.abort();
      window.removeEventListener(LOCAL_VIDEO_CHANGED, load);
    };
  }, [ownerId, sha, source, file, onRestore]);
  const remember = useCallback(async () => {
    if (!ownerId || !file || !digest) return;
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setState({
      phase: "writing",
      message: "Remembering video in this browser. No upload…",
    });
    try {
      await rememberVideo(ownerId, digest, file, controller.signal);
      if (!controller.signal.aborted)
        setState({
          phase: "available",
          message: "Video available on this device.",
        });
    } catch (error) {
      if (!controller.signal.aborted)
        setState({
          phase: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to store local video. Reconnect remains available.",
        });
    }
  }, [ownerId, file, digest]);
  const remove = useCallback(async () => {
    if (!ownerId || !sha) return;
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setState({ phase: "writing", message: "Removing the local copy…" });
    try {
      await forgetVideo(ownerId, sha, controller.signal);
      if (!controller.signal.aborted)
        setState({
          phase: "missing",
          message:
            "Local copy removed. Current editing is unchanged; reconnect next time.",
        });
    } catch (error) {
      if (!controller.signal.aborted)
        setState({
          phase: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to remove local copy.",
        });
    }
  }, [ownerId, sha]);
  const cancel = () => {
    operation.current?.abort();
    setState({
      phase: "missing",
      message:
        "Local storage operation cancelled. You can reconnect the original video.",
    });
  };
  return {
    ...state,
    remember,
    remove,
    cancel,
    busy: state.phase === "checking" || state.phase === "writing",
    canRemember: !!ownerId && !!file && !!digest,
  };
}
