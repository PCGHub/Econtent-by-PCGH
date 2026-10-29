"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import VideoEditor, {
  type EditorSnapshot,
} from "@/components/editor/video-editor";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/account-ui";
import { useAccount } from "./provider";
import {
  EMPTY_DRAFT,
  parseProjectDraft,
  projectSignature,
  type Project,
  type ProjectDraft,
  type ProjectStatus,
} from "@/lib/projects/model";
import { fingerprint } from "@/lib/projects/fingerprint";
import { projectRequest, saveProject } from "@/lib/projects/client";
import { VIDEO_FILE_ACCEPT } from "@/lib/video/types";
import { SaveQueue } from "@/lib/projects/autosave";
export default function ProjectEditor({ project }: { project?: Project }) {
  const router = useRouter();
  const { user, loading } = useAccount();
  useEffect(()=>{if(project&&!loading&&!user){router.replace('/login?next='+encodeURIComponent('/projects/'+project.id));router.refresh()}},[project,loading,user,router]);
  const [draft, setDraft] = useState<ProjectDraft>(()=>project?{title:project.title,settings:project.settings,source:project.source,status:project.status}:EMPTY_DRAFT);
  const [saved, setSaved] = useState(project ? projectSignature(project) : "");
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

  const digestRef = useRef("");
  const snapshotFile = useRef<File | null>(null);
  const firstSnapshot = useRef(true);
  useEffect(() => {
    if (project && !queue.current)
      queue.current = new SaveQueue(
        project,
        (revision, value) => saveProject(project.id, revision, value),
        (value) => {
          setSaved(projectSignature(value));
          setMessage("Saved " + new Date(value.updatedAt).toLocaleTimeString());
        },
      );
  }, [project]);
  const signature = projectSignature(draft);
  const dirty = !!project && signature !== saved;
  useEffect(() => {
    dirtyRef.current = dirty;
    draftRef.current = draft;
  }, [dirty, draft]);
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
    if (!project || !queue.current) return;
    try {
      queue.current.enqueue(valid(draftRef.current));
      setMessage("Saving…");
      await queue.current.flush();
      setMessage(previous=>previous==="Saving…"?"Saved settings":previous);
      setError("");
    } catch (cause) {
      setMessage("Changes not saved");
      setError(cause instanceof Error ? cause.message : "Save failed");
      throw cause;
    }
  }, [project, valid]);
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 1200);
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
      const link = (event.target as Element).closest("a");
      if (
        dirtyRef.current &&
        link &&
        !link.hasAttribute("download") &&
        link.protocol === location.protocol &&
        link.origin === location.origin &&
        link.pathname !== location.pathname &&
        !window.confirm(
          "This project has unsaved changes. Leave without saving?",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", navigation, true);
    };
  }, []);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
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
    setBusy(true);
    setError("");
    try {
      if (project) await flush();
      else {
        const { project: created } = await projectRequest("", {
          method: "POST",
          body: JSON.stringify(valid(draftRef.current)),
        });
        router.push("/projects/" + created.id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  if(project&&!loading&&!user)return <p role="status" className="p-6">Sign in to resume this saved project.</p>;
  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <Logo />
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={user ? "/projects" : "/login"}
            className="text-sm font-semibold text-blue-600"
          >
            {loading ? "Account…" : user ? "My projects" : "Sign in"}
          </Link>
          {user && (
            <Button disabled={busy || checking} onClick={() => void save()}>
              {busy ? "Saving…" : project ? "Save project" : "Save to account"}
            </Button>
          )}
        </div>
      </header>
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
              ? message === "Saving…" ? message : "Unsaved changes"
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
              disabled={checking||loading}
              className="mt-6 block w-full"
              onChange={(event) => {const chosen=event.target.files?.[0];event.target.value="";void reconnect(chosen)}}
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
  );
}
