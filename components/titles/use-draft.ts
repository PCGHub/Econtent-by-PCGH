"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/account/provider";
import { fingerprint } from "@/lib/projects/fingerprint";
import { SaveQueue } from "@/lib/projects/autosave";
import { projectRequest, saveProject } from "@/lib/projects/client";
import {
  parseProjectDraft,
  projectSignature,
  DEFAULT_SETTINGS,
  type Project,
} from "@/lib/projects/model";
import { parseTitlesDraft, type TitleSource } from "@/lib/titles/document";
import { durationOf, type TitleProject } from "@/lib/titles/model";
import type { LocalMedia } from "@/lib/composition/model";
export function useTitlesDraft(
  saved: Project | undefined,
  document: TitleProject,
  assets: Record<string, LocalMedia>,
) {
  const account = useAccount(),
    [savedId, setSavedId] = useState(saved?.id),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0);
  const queue = useRef<SaveQueue | null>(null),
    sources = useRef<TitleSource[]>(saved?.titles?.sources ?? []),
    latest = useRef({ document, assets }),
    signature = useRef(saved ? projectSignature(saved) : ""),
    operation = useRef<AbortController | null>(null),
    alive = useRef(true);
  useEffect(() => {
    latest.current = { document, assets };
  }, [document, assets]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
    };
  }, []);
  const accept = useCallback((p: Project) => {
    signature.current = projectSignature(p);
    sources.current = p.titles?.sources ?? [];
    if (alive.current)
      setMessage("Saved metadata · local backgrounds are not uploaded");
  }, []);
  useEffect(() => {
    if (saved && !queue.current)
      queue.current = new SaveQueue(
        saved,
        (revision, next) => saveProject(saved.id, revision, next),
        accept,
      );
  }, [saved, accept]);
  const save = useCallback(async () => {
    if (!account.user) {
      setError(
        "Sign in to save titles. Guest rendering and downloads remain available.",
      );
      return;
    }
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setSaving(true);
    setError("");
    const current = latest.current;
    try {
      const metadata: TitleSource[] = [];
      const used = new Set(
        current.document.scenes
          .filter((s) => ["image", "video"].includes(s.background.kind))
          .map((s) => s.background.assetId),
      );
      for (const id of used) {
        if (!id)
          throw Error(
            "Choose or reconnect every media background before the first save",
          );
        const media = current.assets[id],
          previous = sources.current.find((s) => s.id === id);
        if (media)
          metadata.push({
            id,
            kind: media.kind,
            name: media.file.name,
            sizeBytes: media.file.size,
            width: media.width,
            height: media.height,
            duration: media.duration,
            mimeType: media.file.type || "application/octet-stream",
            sha256: await fingerprint(media.file, controller.signal),
          });
        else if (previous) metadata.push(previous);
        else
          throw Error(
            "Missing local background metadata. Reconnect its original file.",
          );
      }
      const titles = parseTitlesDraft({
        version: 1,
        document: current.document,
        sources: metadata,
      });
      const draft = parseProjectDraft({
        title: current.document.title,
        source: null,
        status: "draft",
        settings: {
          ...DEFAULT_SETTINGS,
          cutStrategy: "precision",
          range: { start: 0, end: durationOf(current.document) },
        },
        titles,
      });
      controller.signal.throwIfAborted();
      if (projectSignature(draft) === signature.current) {
        setMessage("Saved metadata · local backgrounds are not uploaded");
        return;
      }
      if (!queue.current) {
        const result = await projectRequest("", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        if (!alive.current) return;
        const p = result.project as Project;
        queue.current = new SaveQueue(
          p,
          (revision, next) => saveProject(p.id, revision, next),
          accept,
        );
        setSavedId(p.id);
        accept(p);
      } else {
        queue.current.enqueue(draft);
        await queue.current.flush();
      }
    } catch (cause) {
      if (!controller.signal.aborted && alive.current) {
        setError(
          cause instanceof Error ? cause.message : "Titles were not saved",
        );
        setMessage("Changes not saved");
      }
    } finally {
      operation.current = null;
      if (alive.current) {
        setSaving(false);
        if (latest.current !== current) setTick((n) => n + 1);
      }
    }
  }, [account.user, accept]);
  useEffect(() => {
    if (!savedId || !account.user) return;
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [savedId, document, assets, account.user, save, tick]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!savedId) return;
      let dirty = true;
      try {
        dirty =
          JSON.stringify(latest.current.document) !==
          JSON.stringify(JSON.parse(signature.current).titles_draft?.document);
      } catch {}
      if (dirty || operation.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [savedId]);
  return { account, savedId, saving, message, error, save: () => void save() };
}
