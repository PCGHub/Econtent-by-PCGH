"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VideoEditor, {
  type EditorSnapshot,
} from "@/components/editor/video-editor";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace-shell";
import { useAccount } from "./provider";
import {
  EMPTY_DRAFT,
  parseProjectDraft,
  projectSignature,
  projectContentSignature,
  type Project,
  type ProjectDraft,
  type ProjectStatus,
} from "@/lib/projects/model";
import { fingerprint } from "@/lib/projects/fingerprint";
import { projectRequest, saveProject } from "@/lib/projects/client";
import { VIDEO_FILE_ACCEPT } from "@/lib/video/types";
import { SaveQueue } from "@/lib/projects/autosave";
const leaveMessage =
  "This project has unsaved edits. Leave without saving? Your last saved version will remain available.";
export default function ProjectEditor({ project }: { project?: Project }) {
  const router = useRouter();
  const { user, loading } = useAccount();
  useEffect(() => {
    if (project && !loading && !user) {
      router.replace(
        "/login?next=" + encodeURIComponent("/projects/" + project.id),
      );
      router.refresh();
    }
  }, [project, loading, user, router]);
  const [draft, setDraft] = useState<ProjectDraft>(() =>
    project
      ? {
          title: project.title,
          settings: project.settings,
          source: project.source,
          status: project.status,
        }
      : EMPTY_DRAFT,
  );
  const [saved, setSaved] = useState(project ? projectSignature(project) : "");
  const [savedContent, setSavedContent] = useState(
    project ? projectContentSignature(project) : "",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(!project?.source);
  const [file, setFile] = useState<File>();
  const [digest, setDigest] = useState("");
  const [checking, setChecking] = useState(false);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const queue = useRef<SaveQueue | null>(null);
  const abort = useRef<AbortController | null>(null);
  const createAbort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const leaving = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const discardPending = useCallback(() => {
    leaving.current = true;
    dirtyRef.current = false;
    clearTimeout(autosaveTimer.current);
    queue.current?.dispose();
    createAbort.current?.abort();
    abort.current?.abort();
  }, []);

  const digestRef = useRef("");
  const snapshotFile = useRef<File | null>(null);
  const firstSnapshot = useRef(true);
  useEffect(() => {
    if (project && !queue.current)
      queue.current = new SaveQueue(
        project,
        (revision, value, signal) =>
          saveProject(project.id, revision, value, signal),
        (value) => {
          if (!alive.current || leaving.current) return;
          setSavedContent(projectContentSignature(value));
          setSaved(projectSignature(value));
          setMessage("Saved " + new Date(value.updatedAt).toLocaleTimeString());
        },
      );
  }, [project]);
  const signature = projectSignature(draft);
  const dirty = !!project && signature !== saved;
  useEffect(() => {
    dirtyRef.current =
      !!project && projectContentSignature(draft) !== savedContent;
    draftRef.current = draft;
  }, [draft, project, savedContent]);
  const valid = useCallback((value: ProjectDraft) => {
    try {
      return parseProjectDraft(value);
    } catch (cause) {
      throw new Error(
        "Not saved: " +
          (cause instanceof Error ? cause.message : "Invalid settings"),
      );
    }
  }, []);
  const flush = useCallback(async () => {
    if (!project || !queue.current || leaving.current) return;
    setBusy(true);
    setError("");
    try {
      queue.current.enqueue(valid(draftRef.current));
      setMessage("Saving…");
      await queue.current.flush();
      if (!alive.current || leaving.current) return;
      setMessage((previous) =>
        previous === "Saving…" ? "Saved settings" : previous,
      );
      setError("");
    } catch (cause) {
      if (alive.current && !leaving.current) {
        setMessage("Changes not saved");
        setError(cause instanceof Error ? cause.message : "Save failed");
      }
      throw cause;
    } finally {
      if (alive.current && !leaving.current) setBusy(false);
    }
  }, [project, valid]);
  useEffect(() => {
    if (!dirty || leaving.current) return;
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 1200);
    autosaveTimer.current = timer;
    return () => clearTimeout(timer);
  }, [dirty, signature, flush]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !link ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self") ||
        link.protocol !== location.protocol ||
        link.origin !== location.origin ||
        (link.pathname === location.pathname && link.search === location.search)
      )
        return;
      // One decision only: accepting discard must not trigger another unload
      // prompt or wait for an unavailable cloud request before navigating.
      event.preventDefault();
      event.stopPropagation();
      if (dirtyRef.current && !window.confirm(leaveMessage)) return;
      discardPending();
      router.push(link.pathname + link.search + link.hash);
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", navigation, true);
    };
  }, [discardPending, router]);
  useEffect(() => {
    alive.current = true;
    leaving.current = false;
    return () => {
      alive.current = false;
      discardPending();
      queue.current = null;
    };
  }, [discardPending]);
  const verify = useCallback(
    async (next: File, signal: AbortSignal) => {
      const hash = await fingerprint(next, signal);
      if (
        project?.source &&
        (next.size !== project.source.sizeBytes ||
          hash !== project.source.sha256)
      )
        throw new Error(
          "This is a different video. Select the exact original file; saved cuts have not been applied.",
        );
      digestRef.current = hash;
      setDigest(hash);
    },
    [project],
  );
  const snapshot = useCallback(
    (value: EditorSnapshot) => {
      if (!value.file || !value.metadata.duration) return;
      const hash = digestRef.current;
      if (!hash) return;
      const changedFile = snapshotFile.current !== value.file;
      snapshotFile.current = value.file;
      const initial = firstSnapshot.current;
      firstSnapshot.current = false;
      setDraft((previous) => ({
        ...previous,
        settings: value.settings,
        source: {
          name: value.file!.name,
          sizeBytes: value.file!.size,
          durationSeconds: value.metadata.duration,
          width: value.metadata.width,
          height: value.metadata.height,
          mimeType: value.file!.type || "application/octet-stream",
          sha256: hash,
        },
        status:
          initial && project
            ? previous.status
            : changedFile
              ? "draft"
              : previous.status,
      }));
    },
    [project],
  );
  const status = useCallback(
    (value: ProjectStatus) =>
      setDraft((previous) => ({ ...previous, status: value })),
    [],
  );
  async function reconnect(next?: File) {
    if (!next || checking) return;
    if (next.size !== project?.source?.sizeBytes) {
      setError(
        "File size differs from the original video. Choose the exact original file.",
      );
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setChecking(true);
    setError("");
    try {
      await verify(next, controller.signal);
      controller.signal.throwIfAborted();
      setFile(next);
      setConnected(true);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Unable to reconnect video",
        );
    } finally {
      setChecking(false);
    }
  }
  async function save() {
    if (busy || leaving.current) return;
    setBusy(true);
    setError("");
    try {
      if (project) await flush();
      else {
        const controller = new AbortController();
        createAbort.current = controller;
        const { project: created } = await projectRequest("", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify(valid(draftRef.current)),
        });
        if (!alive.current || leaving.current) return;
        router.push("/projects/" + created.id);
      }
    } catch (cause) {
      if (alive.current && !leaving.current)
        setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      if (alive.current && !leaving.current) setBusy(false);
    }
  }
  function cancelSaving() {
    clearTimeout(autosaveTimer.current);
    createAbort.current?.abort();
    queue.current?.cancel();
  }
  function exitEditor() {
    if (dirtyRef.current && !window.confirm(leaveMessage)) return;
    discardPending();
    // The landing page can host the guest editor at the same URL. Reloading
    // there actually exits its local editor state instead of a same-route no-op.
    if (location.pathname === "/") window.location.reload();
    else router.push("/");
  }
  if (project && !loading && !user)
    return (
      <p role="status" className="p-6">
        Sign in to resume this saved project.
      </p>
    );
  return (
    <WorkspaceShell>
      <main className="min-h-screen bg-[#f8fafc] text-slate-900">
        <div
          role="toolbar"
          aria-label="Project saving"
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3 px-5 pt-4"
        >
          <button
            type="button"
            onClick={exitEditor}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Exit editor
          </button>
          {busy && (
            <Button variant="outline" onClick={cancelSaving}>
              Cancel saving
            </Button>
          )}
          {user && (
            <Button disabled={busy || checking} onClick={() => void save()}>
              {busy ? "Saving…" : project ? "Save project" : "Save to account"}
            </Button>
          )}
        </div>
        <section className="mx-auto max-w-6xl px-5 pt-6">
          <label className="text-sm font-semibold">
            Project title
            <input
              aria-label="Project title"
              maxLength={120}
              value={draft.title}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  title: event.target.value,
                }))
              }
              className="mt-2 block w-full max-w-lg rounded-xl border border-slate-200 bg-white p-3"
            />
          </label>
          <p role="status" className="mt-3 text-sm text-slate-500">
            {project
              ? dirty
                ? message === "Saving…"
                  ? message
                  : "Unsaved changes"
                : message || "Saved settings restored"
              : "Guest edit · Save settings to your account after signing in."}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Only editing settings and source metadata are saved. Original videos
            and exports stay on this device and must be reconnected after
            reopening.
          </p>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-50 p-4 text-red-700"
            >
              {error}
            </p>
          )}
        </section>
        {!connected ? (
          <section className="mx-auto max-w-5xl px-5 py-10">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h1 className="text-2xl font-bold">Reconnect original video</h1>
              <p className="mt-3 text-sm text-slate-500">
                Choose {project?.source?.name}. We verify its size and SHA-256
                fingerprint locally before restoring your editing settings. No
                video is uploaded.
              </p>
              <input
                aria-label="Reconnect video"
                type="file"
                accept={VIDEO_FILE_ACCEPT}
                disabled={checking || loading}
                className="mt-6 block w-full"
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  event.target.value = "";
                  void reconnect(chosen);
                }}
              />
              {checking && (
                <div role="status" className="mt-4">
                  Verifying original video…{" "}
                  <button
                    onClick={() => abort.current?.abort()}
                    className="font-semibold text-blue-600"
                  >
                    Cancel verification
                  </button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <VideoEditor
            initialSettings={project?.settings}
            initialSource={file}
            validateSource={verify}
            onSnapshot={snapshot}
            onStatus={status}
          />
        )}
        <span className="sr-only">
          {digest ? "Source identity verified" : ""}
        </span>
      </main>
    </WorkspaceShell>
  );
}
