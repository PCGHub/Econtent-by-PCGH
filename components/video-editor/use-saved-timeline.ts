"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/account/provider";
import { fingerprint } from "@/lib/projects/fingerprint";
import {
  DEFAULT_SETTINGS,
  parseProjectDraft,
  type Project,
} from "@/lib/projects/model";
import { projectRequest, saveProject } from "@/lib/projects/client";
import {
  parseMultitrack,
  type MultitrackDraft,
  type MediaKind,
} from "@/lib/multitrack/draft";
import { uploadMedia } from "@/lib/storage/client";
type Original = { id: string; kind: MediaKind; file: File; duration: number };
type Snapshot = {
  title: string;
  originals: Original[];
  clips: MultitrackDraft["clips"];
  hooks: MultitrackDraft["hooks"];
  audio: MultitrackDraft["audio"];
  status: Project["status"];
};
export function useSavedTimeline(
  saved: Project | undefined,
  snapshot: Snapshot,
) {
  const { user } = useAccount(),
    [savedId, setSavedId] = useState(saved?.id),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  const current = useRef(saved),
    latest = useRef(snapshot),
    operation = useRef<AbortController | null>(null),
    hashes = useRef(new WeakMap<File, string>()),
    ack = useRef(""),
    alive = useRef(true);
  const signature = JSON.stringify(snapshot);
  useEffect(() => {
    latest.current = snapshot;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
    };
  }, []);
  const save = useCallback(
    async (includeMedia = false) => {
      if (!user) {
        setMessage("Sign in to save your timeline and source files.");
        return;
      }
      if (operation.current) return;
      const value = latest.current;
      if (
        saved?.multitrack?.sources.some(
          (s) => !value.originals.some((o) => o.id === s.id),
        )
      ) {
        if (includeMedia)
          setMessage(
            "Restore or reconnect all saved sources before saving this timeline.",
          );
        return;
      }
      if (!value.clips.length) {
        if (includeMedia) setMessage("Add media before saving this timeline.");
        return;
      }
      const controller = new AbortController();
      operation.current = controller;
      setSaving(true);
      setMessage("Saving timeline…");
      try {
        const sources = [];
        for (const original of value.originals) {
          let sha256 = hashes.current.get(original.file);
          if (!sha256) {
            sha256 = await fingerprint(original.file, controller.signal);
            hashes.current.set(original.file, sha256);
          }
          sources.push({
            id: original.id,
            kind: original.kind,
            name: original.file.name,
            sizeBytes: original.file.size,
            mimeType: original.file.type || "application/octet-stream",
            duration: original.duration,
            sha256,
          });
        }
        const multitrack = parseMultitrack({
          version: 1,
          sources,
          clips: value.clips,
          hooks: value.hooks,
          audio: value.audio,
        });
        const draft = parseProjectDraft({
          title: value.title.trim() || "Untitled video project",
          settings: DEFAULT_SETTINGS,
          source: null,
          status: value.status,
          multitrack,
        });
        const result = current.current
          ? await saveProject(
              current.current.id,
              current.current.revision,
              draft,
              controller.signal,
            )
          : ((
              await projectRequest("", {
                method: "POST",
                signal: controller.signal,
                body: JSON.stringify(draft),
              })
            ).project as Project);
        current.current = result;
        if (alive.current) setSavedId(result.id);
        ack.current = JSON.stringify(value);
        if (includeMedia) {
          for (const original of value.originals) {
            if (alive.current)
              setMessage("Timeline saved. Uploading source files…");
            await uploadMedia(result.id, original.file, controller.signal);
          }
        }
        if (alive.current)
          setMessage(
            includeMedia
              ? "Timeline and source files saved to your workspace."
              : "Timeline edits saved automatically.",
          );
      } catch (e) {
        if (alive.current)
          setMessage(
            e instanceof Error
              ? e.message
              : "Save failed. Your current edits remain here.",
          );
      } finally {
        operation.current = null;
        if (alive.current) setSaving(false);
      }
    },
    [user, saved],
  );
  useEffect(() => {
    if (!savedId) return;
    const timer = setTimeout(() => {
      if (ack.current !== signature) void save();
    }, 1200);
    return () => clearTimeout(timer);
  }, [signature, savedId, save]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (
        savedId &&
        (ack.current !== JSON.stringify(latest.current) || operation.current)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [savedId]);
  return { savedId, message, saving, save: () => void save(true) };
}
