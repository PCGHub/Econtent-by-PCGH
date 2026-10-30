"use client";
import { useEffect, useRef, useState } from "react";
import type { TitleProject, TitleRenderProgress } from "@/lib/titles/model";
import type { LocalMedia } from "@/lib/composition/model";
import { BrowserTitlesRenderer } from "@/lib/titles/renderer";
import { downloadBlob } from "@/lib/video/download";
export function useTitlesRender(
  project: TitleProject,
  assets: Record<string, LocalMedia>,
) {
  const signature =
    JSON.stringify(project) +
    Object.entries(assets)
      .map(([id, m]) => id + ":" + m.url)
      .sort()
      .join("|");
  const [result, setResult] = useState<{
      signature: string;
      blob: Blob;
      url: string;
    }>(),
    [progress, setProgress] = useState<TitleRenderProgress>(),
    [state, setState] = useState<
      "idle" | "running" | "completed" | "cancelled" | "failed"
    >("idle"),
    [error, setError] = useState(""),
    [elapsed, setElapsed] = useState(0);
  const renderer = useRef<BrowserTitlesRenderer | null>(null),
    operation = useRef<AbortController | null>(null),
    resultRef = useRef<typeof result>(undefined),
    current = useRef({ signature, project, assets }),
    started = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    current.current = { signature, project, assets };
    if (operation.current) operation.current.abort();
    if (resultRef.current && resultRef.current.signature !== signature) {
      URL.revokeObjectURL(resultRef.current.url);
      resultRef.current = undefined;
      queueMicrotask(() => {
        setResult(undefined);
        setState("idle");
      });
    }
  }, [signature, project, assets]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
      renderer.current?.dispose();
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    };
  }, []);
  useEffect(() => {
    if (state !== "running") return;
    const timer = setInterval(
      () => setElapsed((performance.now() - started.current) / 1000),
      250,
    );
    return () => clearInterval(timer);
  }, [state]);
  const run = async (download = false) => {
    if (operation.current) return;
    const snapshot = current.current;
    if (resultRef.current?.signature === snapshot.signature) {
      if (download)
        downloadBlob(resultRef.current.blob, snapshot.project.title + ".mp4");
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    started.current = performance.now();
    setElapsed(0);
    setError("");
    setProgress({ stage: "Preparing title render" });
    setState("running");
    try {
      renderer.current ??= new BrowserTitlesRenderer();
      const blob = await renderer.current.render(
        snapshot.project,
        new Map(Object.entries(snapshot.assets).map(([id, m]) => [id, m.file])),
        controller.signal,
        (p) => {
          if (alive.current) setProgress(p);
        },
      );
      controller.signal.throwIfAborted();
      if (!alive.current || snapshot.signature !== current.current.signature)
        return;
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
      const next = {
        signature: snapshot.signature,
        blob,
        url: URL.createObjectURL(blob),
      };
      resultRef.current = next;
      setResult(next);
      setState("completed");
      if (download) downloadBlob(blob, snapshot.project.title + ".mp4");
    } catch (cause) {
      if (alive.current) {
        if (controller.signal.aborted) setState("cancelled");
        else {
          setState("failed");
          setError(
            cause instanceof Error ? cause.message : "Title rendering failed",
          );
        }
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (alive.current)
        setElapsed((performance.now() - started.current) / 1000);
    }
  };
  return {
    result: result?.signature === signature ? result : undefined,
    progress,
    state,
    error,
    elapsed,
    render: () => void run(),
    export: () => void run(true),
    cancel: () => operation.current?.abort(),
  };
}
