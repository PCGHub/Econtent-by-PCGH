"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import localFont from "next/font/local";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  FolderKanban,
  Grid2X2,
  LayoutList,
  Plus,
  RefreshCw,
  SearchX,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { useAccount } from "./provider";
import { browserSupabase } from "@/lib/supabase/browser";
import { projectRequest } from "@/lib/projects/client";
import type { Project } from "@/lib/projects/model";
import {
  dashboardCounts,
  dashboardProjects,
  type ProjectFilter,
  type ProjectSort,
} from "@/lib/projects/dashboard";
import { cn } from "@/lib/utils";
import {
  DashboardHeader,
  DashboardSidebar,
  DASHBOARD_TOOLS,
} from "./dashboard/navigation";
import { ProjectCard } from "./dashboard/project-card";
import styles from "./creator-dashboard.module.css";
const inter = localFont({
  src: "../../public/fonts/inter-latin.woff2",
  weight: "400 700",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});
type Snapshot = {
  ownerId: string | null;
  status: "loading" | "ready" | "error";
  projects: Project[];
  error: string;
};
const filters: { id: ProjectFilter; label: string }[] = [
  { id: "all", label: "All projects" },
  { id: "completed", label: "Completed" },
  { id: "attention", label: "Needs attention" },
  { id: "draft", label: "Drafts" },
];
const card =
  "rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,.025)]";
export function CreatorDashboard() {
  const { user, loading: accountLoading } = useAccount(),
    router = useRouter();
  const [collapsed, setCollapsed] = useState(false),
    [drawer, setDrawer] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState<ProjectFilter>("all"),
    [sort, setSort] = useState<ProjectSort>("recent"),
    [view, setView] = useState<"grid" | "list">("grid"),
    [reload, setReload] = useState(0),
    [signingOut, setSigningOut] = useState(false),
    [accountError, setAccountError] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>({
    ownerId: null,
    status: "loading",
    projects: [],
    error: "",
  });
  const opener = useRef<HTMLButtonElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    ownerId = user?.id;
  const closeDrawer = useCallback(() => setDrawer(false), []);
  useEffect(() => {
    if (!accountLoading && !user) {
      router.replace("/login?next=%2Fdashboard");
      router.refresh();
    }
  }, [accountLoading, user, router]);
  useEffect(() => {
    if (accountLoading || !ownerId) return;
    const controller = new AbortController();
    void projectRequest("?sort=recent", { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted)
          setSnapshot({
            ownerId,
            status: "ready",
            projects: r.projects,
            error: "",
          });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setSnapshot({
            ownerId,
            status: "error",
            projects: [],
            error: e instanceof Error ? e.message : "Could not load projects",
          });
      });
    return () => controller.abort();
  }, [accountLoading, ownerId, reload]);
  useEffect(() => {
    const query = matchMedia("(min-width:1024px)"),
      change = () => {
        if (query.matches) setDrawer(false);
      };
    query.addEventListener("change", change);
    try {
      if (localStorage.getItem("econtent-dashboard-collapsed") === "true")
        queueMicrotask(() => setCollapsed(true));
    } catch {}
    return () => query.removeEventListener("change", change);
  }, []);
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("econtent-dashboard-collapsed", String(next));
    } catch {}
  };
  const busy =
      accountLoading ||
      !user ||
      snapshot.ownerId !== ownerId ||
      snapshot.status === "loading",
    error = !busy && snapshot.status === "error" ? snapshot.error : "",
    projects = !busy && !error ? snapshot.projects : [],
    available = !busy && !error,
    counts = dashboardCounts(projects),
    filtered = dashboardProjects(projects, search, filter, sort),
    visible = filtered.slice(0, 6);
  const rawName =
      typeof user?.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name.trim()
        : "",
    name = rawName || user?.email?.split("@")[0] || "Creator";
  const focusProjects = () => {
    heading.current?.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
        ? "instant"
        : "smooth",
    });
    heading.current?.focus({ preventScroll: true });
  };
  const selectFilter = (next: ProjectFilter) => {
    setFilter(next);
    focusProjects();
  };
  const retry = () => {
    setSnapshot((s) => ({ ...s, status: "loading", error: "" }));
    setReload((value) => value + 1);
  };
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setAccountError("");
    try {
      const client = browserSupabase();
      if (!client)
        throw Error(
          "Account services are unavailable. Please reload and try again.",
        );
      const { error } = await client.auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch (e) {
      setAccountError(
        e instanceof Error
          ? e.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }
  const metrics = [
    {
      id: "all" as const,
      label: "Saved projects",
      note: "Your cloud workspace",
      icon: FolderKanban,
    },
    {
      id: "completed" as const,
      label: "Completed",
      note: "Saved edits ready to reopen",
      icon: CheckCircle2,
    },
    {
      id: "attention" as const,
      label: "Needs attention",
      note: "Review and retry failed edits",
      icon: TriangleAlert,
    },
    {
      id: "draft" as const,
      label: "Draft projects",
      note: "Ideas ready to continue",
      icon: FileText,
    },
  ];
  return (
    <div
      data-testid="creator-dashboard"
      className={cn(inter.className, styles.workspace, "min-h-dvh")}
    >
      <a
        href="#dashboard-main"
        inert={drawer}
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:not-sr-only focus:rounded-lg focus:bg-white focus:p-3 focus:text-sm focus:font-semibold"
      >
        Skip to dashboard
      </a>
      <DashboardSidebar
        collapsed={collapsed}
        toggle={toggleSidebar}
        drawer={drawer}
        close={closeDrawer}
        opener={opener}
      />
      <div
        inert={drawer}
        className={cn(
          "min-w-0 transition-[margin] duration-200 motion-reduce:transition-none",
          collapsed ? "lg:ml-[72px]" : "lg:ml-56",
        )}
      >
        <DashboardHeader
          user={user}
          name={name}
          drawer={drawer}
          setDrawer={setDrawer}
          opener={opener}
          search={search}
          setSearch={setSearch}
          onSearchSubmit={focusProjects}
          attention={counts.attention}
          available={available}
          onAttention={() => selectFilter("attention")}
          onRetry={retry}
          onSignOut={() => void signOut()}
          signingOut={signingOut}
        />
        <main
          id="dashboard-main"
          tabIndex={-1}
          className="mx-auto max-w-[1440px] px-4 pb-8 pt-7 outline-none sm:px-6 lg:px-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[.13em] text-slate-500">
                Creator workspace
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-[28px]">
                Your creative workspace
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Welcome back,{" "}
                <span className="font-medium text-slate-700">
                  {name.length > 40 ? name.slice(0, 40) + "…" : name}
                </span>
                . Pick up your latest edit or start something new.
              </p>
            </div>
            <Link
              href="/projects/new"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#155DFC] px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus className="size-4" aria-hidden="true" />
              New project
            </Link>
          </div>
          {accountError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
            >
              {accountError}
            </p>
          )}
          <section
            aria-label="Workspace overview"
            className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4"
          >
            {metrics.map(({ id, label, note, icon: Icon }) => (
              <button
                type="button"
                key={id}
                disabled={!available}
                onClick={() => selectFilter(id)}
                aria-label={`Show ${label.toLowerCase()}`}
                aria-pressed={filter === id}
                className={cn(
                  card,
                  "group flex min-h-[108px] items-start justify-between gap-2 p-4 text-left transition-colors hover:border-blue-300 disabled:cursor-default disabled:hover:border-slate-200 sm:p-5",
                )}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p
                    data-testid={`metric-${id}`}
                    className="mt-2 text-[26px] font-semibold leading-none tracking-tight"
                  >
                    {available ? counts[id] : "—"}
                  </p>
                  <p className="mt-2 hidden text-[11px] leading-4 text-slate-500 sm:block">
                    {note}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-lg p-2",
                    id === "attention" && available && counts.attention > 0
                      ? "bg-rose-50 text-rose-700"
                      : "bg-slate-50 text-slate-500",
                  )}
                >
                  <Icon className="size-[17px]" aria-hidden="true" />
                </span>
              </button>
            ))}
          </section>
          {available && projects.length === 200 && (
            <p className="mt-2 text-xs text-slate-500">
              Counts reflect the 200 most recently updated saved projects.
            </p>
          )}
          <section aria-labelledby="quick-create-heading" className="mt-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2
                  id="quick-create-heading"
                  className="text-[15px] font-semibold tracking-tight"
                >
                  Quick create
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Open a working studio and make it yours.
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Source media stays local
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {DASHBOARD_TOOLS.map(
                ({ name, href, description, icon: Icon, color }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      card,
                      "group flex items-center gap-3 p-4 transition-colors hover:border-blue-300 xl:block",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                        color,
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 xl:mt-3">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                        {name}
                        <ChevronRight
                          aria-hidden="true"
                          className="size-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5"
                        />
                      </h3>
                      <p className="mt-1 text-[11px] leading-[18px] text-slate-500">
                        {description}
                      </p>
                    </div>
                  </Link>
                ),
              )}
            </div>
          </section>
          <section aria-labelledby="recent-projects-heading" className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2
                  id="recent-projects-heading"
                  ref={heading}
                  tabIndex={-1}
                  className="scroll-mt-24 rounded text-[15px] font-semibold tracking-tight outline-none"
                >
                  Recent projects
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Reopen a saved edit. Exported files and original media stay on
                  your device.
                </p>
              </div>
              <Link
                href="/projects"
                className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#155DFC] hover:underline"
              >
                View all projects{" "}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Project status filter"
                className="flex max-w-full flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1"
              >
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                    className={cn(
                      "min-h-8 rounded-md px-2.5 text-[11px] font-medium transition-colors",
                      filter === item.id
                        ? "bg-blue-50 text-[#155DFC]"
                        : "text-slate-500 hover:bg-slate-50",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="dashboard-sort">
                  Sort recent projects
                </label>
                <select
                  id="dashboard-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ProjectSort)}
                  className="h-9 max-w-[155px] rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-600"
                >
                  <option value="recent">Most recent</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Project name</option>
                </select>
                <div
                  role="group"
                  aria-label="Project view"
                  className="flex rounded-lg border border-slate-200 bg-white p-0.5"
                >
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                    className={cn(
                      "rounded-md p-2",
                      view === "grid"
                        ? "bg-blue-50 text-[#155DFC]"
                        : "text-slate-500 hover:bg-slate-50",
                    )}
                  >
                    <Grid2X2 className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                    className={cn(
                      "rounded-md p-2",
                      view === "list"
                        ? "bg-blue-50 text-[#155DFC]"
                        : "text-slate-500 hover:bg-slate-50",
                    )}
                  >
                    <LayoutList className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
            {busy ? (
              <div
                role="status"
                className={cn(
                  card,
                  "flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500",
                )}
              >
                <RefreshCw
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Loading your projects…
              </div>
            ) : error ? (
              <div role="alert" className={cn(card, "p-6")}>
                <h3 className="text-sm font-semibold text-rose-800">
                  We couldn’t load your projects
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">{error}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="size-3.5" />
                  Retry loading projects
                </button>
              </div>
            ) : visible.length ? (
              <>
                <div
                  data-testid="dashboard-projects"
                  className={cn(
                    "grid gap-4",
                    view === "grid"
                      ? "sm:grid-cols-2 2xl:grid-cols-3"
                      : "grid-cols-1",
                  )}
                >
                  {visible.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      list={view === "list"}
                    />
                  ))}
                </div>
                <p
                  aria-live="polite"
                  className="mt-3 text-[11px] text-slate-500"
                >
                  {search || filter !== "all"
                    ? `${filtered.length} matching ${filtered.length === 1 ? "project" : "projects"}`
                    : `${projects.length} saved ${projects.length === 1 ? "project" : "projects"}`}
                  {filtered.length > 6
                    ? " · Showing the first 6. Open all projects for the full list."
                    : ""}
                </p>
              </>
            ) : (
              <div
                className={cn(
                  card,
                  "flex min-h-48 flex-col items-center justify-center p-6 text-center",
                )}
              >
                <span className="rounded-xl bg-slate-50 p-3 text-slate-400">
                  {projects.length ? (
                    <SearchX className="size-6" />
                  ) : (
                    <FolderKanban className="size-6" />
                  )}
                </span>
                <h3 className="mt-3 text-sm font-semibold">
                  {projects.length
                    ? "No matching projects"
                    : "A fresh space for your next idea"}
                </h3>
                <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
                  {projects.length
                    ? "Try another title or project status. Your saved projects are still in your workspace."
                    : "Create a project to save your edit settings and return to them later."}
                </p>
                {projects.length ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                    className="mt-4 min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                  >
                    Clear filters
                  </button>
                ) : (
                  <Link
                    href="/projects/new"
                    className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#155DFC] px-4 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="size-3.5" />
                    Create your first project
                  </Link>
                )}
              </div>
            )}
          </section>
          <div className="mt-7 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <section
              aria-label="Planned AI capabilities"
              className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-blue-100 bg-[#edf3ff] p-5"
            >
              <div className="flex min-w-0 gap-3">
                <span className="rounded-lg bg-white p-2 text-[#155DFC]">
                  <Sparkles className="size-[18px]" aria-hidden="true" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">
                      More creative possibilities
                    </h2>
                    <span className="rounded-full border border-blue-200 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                      Coming soon
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    AI voiceover, automatic highlights and background removal.
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    These capabilities aren’t available yet. Explore the working
                    studios above.
                  </p>
                </div>
              </div>
            </section>
            <section
              aria-label="Credits and subscriptions"
              className={cn(card, "flex items-start gap-3 p-5")}
            >
              <span className="rounded-lg bg-slate-50 p-2 text-slate-500">
                <Wallet className="size-[18px]" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Account services</h2>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                  <CreditCard className="size-3.5" aria-hidden="true" />
                  Credits & subscriptions{" "}
                  <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    Unavailable
                  </span>
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Balances, billing and plan management are not connected.
                </p>
              </div>
            </section>
          </div>
          <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-[11px] text-slate-500">
            <span>Econtent by PCGH · Your creative workspace</span>
            <Link
              href="/settings"
              className="rounded font-medium hover:text-[#155DFC]"
            >
              Account settings
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
