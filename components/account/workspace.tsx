"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clapperboard,
  FolderOpen,
  Grid2X2,
  LayoutList,
  LogOut,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/account-ui";
import { useAccount } from "./provider";
import { browserSupabase } from "@/lib/supabase/browser";
import { projectRequest } from "@/lib/projects/client";
import { EMPTY_DRAFT, type Project } from "@/lib/projects/model";
import { cn } from "@/lib/utils";
export function Shell({
  children,
  active = "Dashboard",
}: {
  children: React.ReactNode;
  active?: string;
}) {
  const { user, loading } = useAccount();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
      router.refresh();
    }
  }, [loading, user, router]);
  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Logo />
          <nav className="flex flex-wrap items-center gap-1">
            {["Dashboard", "My Projects", "Settings"].map((item) => (
              <Link
                key={item}
                href={
                  item === "Dashboard"
                    ? "/dashboard"
                    : item === "My Projects"
                      ? "/projects"
                      : "/settings"
                }
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  active === item
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:bg-slate-50",
                )}
              >
                {item}
              </Link>
            ))}
          </nav>
          <Link href="/projects/new">
            <Button size="sm">
              <Plus /> New project
            </Button>
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">{children}</div>
    </div>
  );
}
function ProjectCard({
  project,
  onChange,
}: {
  project: Project;
  onChange: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(project.title);
  async function action(kind: "rename" | "duplicate" | "delete") {
    setBusy(true);
    setError("");
    try {
      if (kind === "rename")
        await projectRequest("/" + project.id, {
          method: "PATCH",
          body: JSON.stringify({ title, revision: project.revision }),
        });
      else if (kind === "duplicate")
        await projectRequest("/" + project.id + "/duplicate", {
          method: "POST",
          body: "{}",
        });
      else
        await projectRequest("/" + project.id, {
          method: "DELETE",
          body: JSON.stringify({ revision: project.revision }),
        });
      setDeleting(false);
      setRenaming(false);
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex aspect-[1.7] items-center justify-center rounded-xl bg-gradient-to-br from-[#172554] via-[#1d4ed8] to-[#38bdf8] text-white">
        <Clapperboard className="size-9 opacity-80" />
      </div>
      <div className="p-2">
        <h2 className="break-words font-semibold">{project.title}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Edited {new Date(project.updatedAt).toLocaleString()} ·{" "}
          {project.source
            ? project.source.durationSeconds.toFixed(1) + "s"
            : "No video connected"}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold",
              project.status === "completed"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700",
            )}
          >
            {project.status}
          </span>
          <Link href={"/projects/" + project.id}>
            <Button size="sm" variant="outline">
              Continue
              <ArrowRight />
            </Button>
          </Link>
        </div>
        <div className="mt-4 flex gap-4 text-xs font-semibold text-blue-600">
          <button disabled={busy} onClick={() => setRenaming(!renaming)}>
            Rename
          </button>
          <button disabled={busy} onClick={() => void action("duplicate")}>
            Duplicate
          </button>
          <button
            disabled={busy}
            onClick={() => setDeleting(true)}
            className="text-red-700"
          >
            Delete
          </button>
        </div>
        {renaming && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void action("rename");
            }}
          >
            <input
              aria-label="New project title"
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border p-2"
            />
            <Button size="sm" disabled={busy}>
              Rename project
            </Button>
          </form>
        )}
        {deleting && (
          <div
            role="alertdialog"
            aria-label={"Delete " + project.title}
            className="mt-3 rounded-xl bg-red-50 p-3 text-sm"
          >
            <p>
              Delete this project’s saved settings? This cannot be undone. Local
              video files are unaffected.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                disabled={busy}
                className="font-bold text-red-700"
                onClick={() => void action("delete")}
              >
                Confirm delete
              </button>
              <button disabled={busy} onClick={() => setDeleting(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
function ProjectWorkspace({ dashboard = false }: { dashboard?: boolean }) {
  const { user } = useAccount();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [grid, setGrid] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void projectRequest("?q=" + encodeURIComponent(query) + "&sort=" + sort, {
        signal: abort.signal,
      })
        .then((result) => {
          setProjects(result.projects);
          setError("");
        })
        .catch((cause) => {
          if (!abort.signal.aborted) setError(cause.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, sort, version]);
  const name =
    typeof user?.user_metadata.display_name === "string"
      ? user.user_metadata.display_name
      : "";
  return (
    <Shell active={dashboard ? "Dashboard" : "My Projects"}>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Workspace</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {dashboard
              ? "Welcome back" + (name ? ", " + name : "")
              : "My projects"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Keep your edits organized and ready to continue.
          </p>
        </div>
        <Link href="/projects/new">
          <Button size="lg">
            <Plus />
            Create new project
          </Button>
        </Link>
      </div>
      <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 size-4 text-slate-400" />
          <input
            aria-label="Search projects"
            value={query}
            maxLength={120}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            className="h-10 w-full rounded-xl bg-slate-50 pl-10 pr-3 text-sm"
          />
        </div>
        <select
          aria-label="Sort projects"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
        >
          <option value="recent">Recently edited</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            aria-label="Grid view"
            aria-pressed={grid}
            onClick={() => setGrid(true)}
            className={cn("rounded-lg p-2", grid && "bg-white")}
          >
            <Grid2X2 className="size-4" />
          </button>
          <button
            aria-label="List view"
            aria-pressed={!grid}
            onClick={() => setGrid(false)}
            className={cn("rounded-lg p-2", !grid && "bg-white")}
          >
            <LayoutList className="size-4" />
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-5 text-red-700">
          {error}{" "}
          <button onClick={() => setVersion(version + 1)} className="underline">
            Retry
          </button>
        </p>
      ) : loading ? (
        <p role="status" className="mt-6">
          Loading projects…
        </p>
      ) : projects.length ? (
        <div
          className={cn(
            "mt-6",
            grid
              ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              : "flex flex-col gap-3",
          )}
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.id + ":" + project.revision}
              project={project}
              onChange={() => setVersion((value) => value + 1)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <FolderOpen className="mx-auto size-9 text-slate-300" />
          <h2 className="mt-4 font-semibold">No projects found</h2>
          <p className="mt-2 text-sm text-slate-500">
            Try another search or start a new edit.
          </p>
        </div>
      )}
      <p className="mt-8 text-center text-xs text-slate-500">
        Only project metadata is saved. Reconnect the original video on another
        device. Showing up to 200 matching projects.
      </p>
    </Shell>
  );
}
export function DashboardPage() {
  return <ProjectWorkspace dashboard />;
}
export function ProjectsPage() {
  return <ProjectWorkspace />;
}
export function NewProject() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Shell active="My Projects">
      <form
        className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const title = String(new FormData(event.currentTarget).get("title"));
          try {
            const { project } = await projectRequest("", {
              method: "POST",
              body: JSON.stringify({ ...EMPTY_DRAFT, title }),
            });
            router.replace("/projects/" + project.id);
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not create project",
            );
            setBusy(false);
          }
        }}
      >
        <h1 className="text-2xl font-bold">Create project</h1>
        <label className="mt-6 block text-sm">
          Project title
          <input
            name="title"
            aria-label="Project title"
            required
            maxLength={120}
            defaultValue="Untitled project"
            className="mt-2 block w-full rounded-xl border p-3"
          />
        </label>
        <p className="my-4 text-sm text-slate-500">
          Settings and video metadata are saved to your account. Your video is
          processed locally.
        </p>
        {error && (
          <p role="alert" className="mb-3 text-red-700">
            {error}
          </p>
        )}
        <Button disabled={busy}>{busy ? "Creating…" : "Create project"}</Button>
      </form>
    </Shell>
  );
}
export function SettingsPage() {
  const { user } = useAccount();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Shell active="Settings">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold text-blue-600">Account</p>
        <h1 className="mt-2 text-3xl font-bold">Settings</h1>
        <form
          className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            const name = String(
              new FormData(event.currentTarget).get("name"),
            ).trim();
            setBusy(true);
            setError("");
            setMessage("");
            try {
              const { error } = await browserSupabase()!.auth.updateUser({
                data: { display_name: name },
              });
              if (error) throw error;
              setMessage("Profile updated.");
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Update failed",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="font-semibold">Profile</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Display name
              <input
                key={user?.id}
                name="name"
                required
                maxLength={80}
                defaultValue={user?.user_metadata.display_name ?? ""}
                className="mt-2 h-11 w-full rounded-xl border px-3"
              />
            </label>
            <label className="text-sm">
              Email address
              <input
                readOnly
                value={user?.email ?? ""}
                className="mt-2 h-11 w-full rounded-xl border bg-slate-50 px-3"
              />
            </label>
          </div>
          <Button disabled={busy} className="mt-5">
            Save changes
          </Button>
        </form>
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Security</h2>
          <Link
            href="/forgot-password"
            className="mt-4 block text-sm font-semibold text-blue-600"
          >
            Request password reset
          </Link>
          <button
            disabled={busy}
            className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-600"
            onClick={async () => {
              setBusy(true);
              setError("");
              const { error } = await browserSupabase()!.auth.signOut();
              if (error) {
                setError(error.message);
                setBusy(false);
              } else {
                router.replace("/login");
                router.refresh();
              }
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </section>
        <section className="mt-4 rounded-2xl border border-red-100 bg-red-50/50 p-6">
          <h2 className="font-semibold text-red-900">Account deletion</h2>
          <p className="mt-2 text-sm text-red-700">
            Self-service account deletion is not available in this development
            preview. You can delete individual projects from My Projects.
          </p>
        </section>
        {error && (
          <p role="alert" className="mt-4 text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-4 text-blue-700">
            {message}
          </p>
        )}
      </div>
    </Shell>
  );
}
