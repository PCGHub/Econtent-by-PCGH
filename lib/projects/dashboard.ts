import type { Project, ProjectStatus } from "./model";
export type ProjectFilter = "all" | "completed" | "attention" | "draft";
export type ProjectSort = "recent" | "oldest" | "name";
export const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; tone: string; action: string; description: string }
> = {
  completed: {
    label: "Completed",
    tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    action: "Reopen project",
    description:
      "Revisit your saved edit. Reconnect local media if requested to export again.",
  },
  failed: {
    label: "Failed",
    tone: "bg-rose-50 text-rose-800 ring-rose-200",
    action: "Review & retry",
    description:
      "Processing did not finish. Review saved settings, reconnect local media if needed, then retry in the editor.",
  },
  draft: {
    label: "Draft",
    tone: "bg-slate-100 text-slate-700 ring-slate-200",
    action: "Continue editing",
    description: "Your settings are saved. Pick up where you left off.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "bg-amber-50 text-amber-900 ring-amber-200",
    action: "Resume editing",
    description:
      "Reopen your settings and start processing again when you are ready.",
  },
  processing: {
    label: "Processing saved",
    tone: "bg-blue-50 text-blue-800 ring-blue-200",
    action: "Check project",
    description:
      "Last saved while processing. Reopen to check the edit; browser jobs do not continue in the cloud.",
  },
};
export function dashboardCounts(projects: Project[]) {
  return {
    all: projects.length,
    completed: projects.filter((p) => p.status === "completed").length,
    attention: projects.filter((p) => p.status === "failed").length,
    draft: projects.filter((p) => p.status === "draft").length,
  };
}
export function dashboardProjects(
  projects: Project[],
  search: string,
  filter: ProjectFilter,
  sort: ProjectSort,
) {
  const query = search.trim().toLocaleLowerCase();
  return projects
    .filter(
      (p) =>
        p.title.toLocaleLowerCase().includes(query) &&
        (filter === "all" ||
          (filter === "attention"
            ? p.status === "failed"
            : p.status === filter)),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
        : ((Date.parse(a.updatedAt) || 0) - (Date.parse(b.updatedAt) || 0)) *
            (sort === "oldest" ? 1 : -1) || a.id.localeCompare(b.id),
    );
}
export function projectKind(p: Project) {
  return p.titles
    ? "Cinematic Titles"
    : p.composition
      ? "Overlay Studio"
      : "Video Cutter";
}
export function projectSeconds(p: Project) {
  const selected = p.settings.range.end - p.settings.range.start;
  return p.titles
    ? p.titles.document.scenes.reduce((sum, s) => sum + s.duration, 0)
    : selected > 0
      ? selected
      : p.source?.durationSeconds;
}
export function durationLabel(seconds: number | undefined) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0)
    return "No media attached";
  const whole = Math.round(seconds);
  return whole >= 3600
    ? `${Math.floor(whole / 3600)}:${String(Math.floor(whole / 60) % 60).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`
    : `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
