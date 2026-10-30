"use client";
import { useRef, type PointerEvent } from "react";
import {
  durationOf,
  startOf,
  formatTime,
  shiftRange,
  type TitleProject,
  type TitleText,
} from "@/lib/titles/model";
import styles from "./studio.module.css";
export function TitlesTimeline({
  project,
  time,
  sceneId,
  selected,
  onSeek,
  onScene,
  onText,
  onSelect,
}: {
  project: TitleProject;
  time: number;
  sceneId: string;
  selected?: string;
  onSeek: (time: number) => void;
  onScene: (id: string) => void;
  onText: (id: string, patch: Partial<TitleText>) => void;
  onSelect: (id: string) => void;
}) {
  const scene = project.scenes.find((s) => s.id === sceneId)!,
    start = startOf(project, sceneId),
    total = durationOf(project);
  const drag = useRef<{
    id: string;
    pointer: number;
    x: number;
    w: number;
    clip: TitleText;
    kind: "move" | "start" | "end";
  } | null>(null);
  const begin = (event: PointerEvent<HTMLDivElement>, clip: TitleText) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(clip.id);
    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
    drag.current = {
      id: clip.id,
      pointer: event.pointerId,
      x: event.clientX,
      w: rect.width,
      clip,
      kind:
        ((event.target as HTMLElement).dataset.trim as "start" | "end") ||
        "move",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4"
      aria-label="Titles timeline"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Your story, scene by scene</h2>
          <p className="mt-1 text-[10px] text-slate-500">
            Select a scene. Drag text bars to move timing; edge handles trim.
          </p>
        </div>
        <span className="text-xs tabular-nums text-slate-500">
          {project.scenes.length} scenes · {formatTime(total)}
        </span>
      </div>
      <div
        className="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1"
        aria-label="Scene sequence"
      >
        {project.scenes.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onScene(s.id)}
            className={
              "min-w-24 shrink-0 rounded-md border px-3 py-2 text-left text-[10px] " +
              (s.id === sceneId
                ? "border-blue-400 bg-blue-600 text-white"
                : "border-transparent bg-white text-slate-600")
            }
            style={{ flexGrow: s.duration }}
          >
            <span className="block truncate font-semibold">
              {String(i + 1).padStart(2, "0")} · {s.name}
            </span>
            <span className="opacity-70">{s.duration.toFixed(1)} s</span>
          </button>
        ))}
      </div>
      <label className="mt-3 block text-[10px] font-medium text-slate-500">
        Project playhead · {formatTime(time)}
        <input
          aria-label="Titles project playhead"
          type="range"
          min={0}
          max={total}
          step={0.01}
          value={time}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="mt-2 w-full accent-blue-600"
        />
      </label>
      <div className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-2">
        <span className="text-[10px] text-slate-400">{scene.name}</span>
        <div
          className={
            "flex justify-between text-[9px] text-slate-400 " + styles.ruler
          }
        >
          {[0, 0.25, 0.5, 0.75, 1].map((n) => (
            <button
              key={n}
              onClick={() => onSeek(start + n * scene.duration)}
              aria-label={`Seek scene to ${(n * scene.duration).toFixed(2)} seconds`}
            >
              {(n * scene.duration).toFixed(1)}s
            </button>
          ))}
        </div>
        {scene.text.map((clip, i) => (
          <div key={clip.id} className="contents">
            <button
              className="truncate text-left text-[10px] font-medium text-slate-500"
              onClick={() => onSelect(clip.id)}
            >
              T{i + 1} {clip.text.slice(0, 12)}
            </button>
            <div className="relative h-9 rounded-md bg-slate-100">
              <div
                role="group"
                tabIndex={0}
                aria-label={`Timing text ${i + 1}`}
                data-testid={"title-timing-" + clip.id}
                className={
                  "absolute inset-y-1 min-w-2 cursor-grab overflow-hidden rounded bg-violet-100 text-[9px] text-violet-800 " +
                  (selected === clip.id ? "ring-1 ring-violet-400" : "")
                }
                style={{
                  left: `${(clip.start / scene.duration) * 100}%`,
                  width: `${((clip.end - clip.start) / scene.duration) * 100}%`,
                  touchAction: "none",
                }}
                onPointerDown={(e) => begin(e, clip)}
                onPointerMove={(e) => {
                  const active = drag.current;
                  if (
                    !active ||
                    active.id !== clip.id ||
                    active.pointer !== e.pointerId
                  )
                    return;
                  e.preventDefault();
                  e.stopPropagation();
                  onText(
                    clip.id,
                    shiftRange(
                      active.clip,
                      active.kind,
                      ((e.clientX - active.x) / active.w) * scene.duration,
                      scene.duration,
                    ),
                  );
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  const active = drag.current;
                  if (active) {
                    onText(active.id, active.clip);
                    drag.current = null;
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  onText(
                    clip.id,
                    shiftRange(
                      clip,
                      "move",
                      e.key === "ArrowLeft" ? -0.1 : 0.1,
                      scene.duration,
                    ),
                  );
                }}
              >
                <button
                  type="button"
                  data-trim="start"
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    e.stopPropagation();
                    onText(
                      clip.id,
                      shiftRange(
                        clip,
                        "start",
                        e.key === "ArrowRight" ? 0.1 : -0.1,
                        scene.duration,
                      ),
                    );
                  }}
                  aria-label={`Trim text ${i + 1} start`}
                  className="absolute inset-y-0 left-0 z-10 w-3 cursor-ew-resize border-r border-violet-300 bg-violet-200/70"
                />
                <span className="pointer-events-none block truncate px-4 py-1">
                  {clip.start.toFixed(1)}–{clip.end.toFixed(1)} ·{" "}
                  {clip.entrance}
                </span>
                <button
                  type="button"
                  data-trim="end"
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    e.stopPropagation();
                    onText(
                      clip.id,
                      shiftRange(
                        clip,
                        "end",
                        e.key === "ArrowRight" ? 0.1 : -0.1,
                        scene.duration,
                      ),
                    );
                  }}
                  aria-label={`Trim text ${i + 1} end`}
                  className="absolute inset-y-0 right-0 z-10 w-3 cursor-ew-resize border-l border-violet-300 bg-violet-200/70"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
