"use client";
import { LocalVideoBadge } from "../local-video-status";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Clapperboard,
  Film,
  Layers3,
  RotateCcw,
  Type,
  Clock3,
} from "lucide-react";
import type { Project } from "@/lib/projects/model";
import {
  PROJECT_STATUS,
  projectKind,
  projectSeconds,
  durationLabel,
} from "@/lib/projects/dashboard";
import { cn } from "@/lib/utils";

function ProjectPreview({ project }: { project: Project }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [drawn, setDrawn] = useState("");
  const scene = project.titles?.document.scenes[0],
    ratio = project.titles?.document.ratio ?? "16:9";
  const signature =
    scene && ["solid", "gradient"].includes(scene.background.kind)
      ? JSON.stringify({ scene, ratio })
      : "";
  useEffect(() => {
    if (!signature) return;
    let active = true;
    void (async () => {
      const { drawTitleScene } = await import("@/lib/titles/raster");
      await document.fonts.ready;
      if (!active || !canvas.current) return;
      const data = JSON.parse(signature),
        [rw, rh] = data.ratio.split(":").map(Number),
        el = canvas.current;
      el.width = Math.round((180 * rw) / Math.min(rw, rh));
      el.height = Math.round((180 * rh) / Math.min(rw, rh));
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const text = data.scene.text[0],
        time = text
          ? Math.min(
              data.scene.duration - 0.01,
              text.start + (text.end - text.start) / 2,
            )
          : data.scene.duration / 2;
      drawTitleScene(ctx, data.scene, time, el.width, el.height);
      if (active) setDrawn(signature);
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [signature]);
  const Icon = project.titles ? Type : project.composition ? Layers3 : Film;
  return (
    <div
      className="relative flex aspect-[16/7] shrink-0 items-center justify-center overflow-hidden border-b border-slate-100 bg-[#eef2f8]"
      aria-label={`Preview for ${project.title}`}
    >
      <canvas
        ref={canvas}
        hidden={!signature || drawn !== signature}
        role="img"
        aria-label={`Saved title frame for ${project.title}`}
        className="h-full w-full object-contain"
      />
      {(!signature || drawn !== signature) && (
        <div className="flex items-center gap-3 text-slate-500">
          <span className="rounded-xl border border-white bg-white/80 p-3 shadow-sm">
            <Icon className="size-6 text-slate-400" aria-hidden="true" />
          </span>
          <span className="text-xs">
            {project.titles
              ? "Title preview unavailable"
              : "Local media preview unavailable"}
          </span>
        </div>
      )}
      {signature && drawn === signature && (
        <span className="absolute bottom-2 left-2 rounded-md bg-slate-950/75 px-2 py-1 text-[10px] font-medium text-white">
          Saved title frame
        </span>
      )}
    </div>
  );
}
export function ProjectCard({
  project,
  list,
}: {
  project: Project;
  list: boolean;
}) {
  const status = PROJECT_STATUS[project.status],
    date = new Date(project.updatedAt),
    validDate = Number.isFinite(date.getTime()),
    path = "/projects/" + project.id;
  return (
    <article
      aria-label={project.title}
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border bg-white shadow-[0_2px_8px_rgba(15,23,42,.025)] transition-shadow hover:shadow-md",
        project.status === "failed" ? "border-rose-200" : "border-slate-200",
        list && "sm:grid sm:grid-cols-[180px_minmax(0,1fr)]",
      )}
    >
      <ProjectPreview project={project} />
      <div className="flex min-w-0 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500">
              {projectKind(project)}
            </p>
            <h3
              className="mt-1 truncate text-sm font-semibold text-slate-900"
              title={project.title}
            >
              <Link href={path} className="rounded-sm hover:text-[#155DFC]">
                {project.title}
              </Link>
            </h3>
            {!project.composition && !project.titles && (
              <LocalVideoBadge source={project.source} />
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset",
              status.tone,
            )}
          >
            {status.label}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clapperboard className="size-3" aria-hidden="true" />
            {durationLabel(projectSeconds(project))}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" aria-hidden="true" />
            {validDate ? (
              <time dateTime={project.updatedAt}>
                Edited{" "}
                {date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </time>
            ) : (
              "Date unavailable"
            )}
          </span>
        </div>
        <p
          className={cn(
            "mt-3 min-h-10 text-xs leading-5",
            project.status === "failed" ? "text-rose-800" : "text-slate-500",
          )}
        >
          {status.description}
        </p>
        <Link
          href={path}
          aria-label={`${project.status === "failed" ? "Recover" : project.status === "completed" ? "Reopen" : "Continue"} ${project.title}`}
          className={cn(
            "mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors",
            project.status === "failed"
              ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-[#155DFC]",
          )}
        >
          {project.status === "failed" ? (
            <RotateCcw className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          )}
          {status.action}
        </Link>
      </div>
    </article>
  );
}
