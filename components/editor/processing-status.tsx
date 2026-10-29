"use client";
import type { CutStrategy, JobProgress } from "@/lib/video/types";

export function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
const titles = {
  idle: "Ready",
  loading: "Loading FFmpeg",
  validating: "Validating video",
  preparing: "Preparing video",
  processing: "Processing video",
  finalizing: "Finalizing MP4",
  packaging: "Packaging ZIP",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};
export default function ProcessingStatus({
  progress,
  method,
  active,
  audioConverted,
  onCancel,
}: {
  progress: JobProgress;
  method?: CutStrategy;
  active: boolean;
  audioConverted?: boolean;
  onCancel: () => void;
}) {
  const percentage =
    progress.status === "completed"
      ? 100
      : Math.floor(progress.overallFraction * 100);
  const current =
    progress.clipFraction === undefined
      ? undefined
      : Math.floor(progress.clipFraction * 100);
  return (
    <section
      aria-label="Processing status"
      className={`${active ? "sticky top-2 z-10 " : ""}rounded-2xl border border-blue-100 bg-white p-4 shadow-sm md:p-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="status" aria-live="polite">
          <h2 className="font-semibold">{titles[progress.status]}</h2>
          {progress.clipCount && (
            <p className="text-sm text-slate-600">
              {active
                ? `Processing clip ${progress.clipIndex} of ${progress.clipCount}`
                : `${progress.completedClips} of ${progress.clipCount} clips ready`}
            </p>
          )}
        </div>
        {active && (
          <button
            className="shrink-0 rounded-lg border border-blue-600 px-4 py-2 font-semibold text-blue-700"
            onClick={onCancel}
          >
            Cancel processing
          </button>
        )}
      </div>
      {method && (
        <p
          data-testid="processing-method"
          className="mt-3 text-sm font-semibold text-blue-800"
        >
          {progress.status === "packaging"
            ? "ZIP packaging"
            : method === "fast"
              ? audioConverted
                ? "Fast Cut · video copy + AAC audio conversion"
                : "Fast Cut · stream copy"
              : "Precision Cut · re-encoding"}
        </p>
      )}
      {progress.clipCount && (
        <p
          data-testid="completed-clips"
          className="mt-2 text-sm text-slate-600"
        >
          Completed clips: {progress.completedClips} of {progress.clipCount}
        </p>
      )}
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span>
              {progress.status === "packaging"
                ? "ZIP progress"
                : "Overall job progress"}
            </span>
            <span data-testid="overall-percentage">
              {progress.indeterminate && progress.status !== "idle"
                ? `At least ${percentage}%`
                : `${percentage}%`}
            </span>
          </div>
          <progress
            aria-label="Overall job progress"
            className="block h-3 w-full overflow-hidden rounded-full accent-blue-600"
            max={1}
            value={
              progress.indeterminate && active
                ? undefined
                : progress.overallFraction
            }
          />
        </div>
        {active && progress.clipCount && (
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>Current clip</span>
              <span>
                {progress.status === "processing" &&
                !progress.indeterminate &&
                current !== undefined
                  ? `${current}%`
                  : "Working…"}
              </span>
            </div>
            <progress
              aria-label="Current clip progress"
              className="block h-2 w-full accent-blue-400"
              max={1}
              value={
                progress.status === "processing" && !progress.indeterminate
                  ? progress.clipFraction
                  : undefined
              }
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span>
          Elapsed{" "}
          <span data-testid="elapsed-time">
            {formatTime(progress.elapsedSeconds)}
          </span>
        </span>
        <span>
          {progress.etaSeconds === undefined
            ? active
              ? "Time remaining: estimating…"
              : ""
            : `Estimated time remaining: ~${formatTime(progress.etaSeconds)}`}
        </span>
      </div>
      {progress.message && (
        <p className="mt-2 text-sm text-slate-500">{progress.message}</p>
      )}
      {progress.status !== "idle" && progress.operation && (
        <div className="mt-3 text-xs text-slate-600">
          <p data-testid="processing-operation" className="mt-2">
            {active ? "Current step" : "Last step"}: {progress.operation} · step elapsed {formatTime(progress.operationElapsedSeconds ?? 0)}
          </p>
          <details className="mt-2">
          <summary className="cursor-pointer font-semibold">Processing diagnostics</summary>
          {progress.status === "processing" && (
            <p className="mt-1">
              {progress.lastMediaAdvanceSeconds === undefined
                ? "No advancing media timestamp received yet."
                : `Last measured media advance: ${formatTime(progress.lastMediaAdvanceSeconds)} ago.`}
            </p>
          )}
          <p className="mt-1">An operation without a response or advancing media timestamps for two minutes stops with a recovery error. This is a safety limit, not a completion estimate. Keep this tab in the foreground.</p>
          </details>
        </div>
      )}
      {active && progress.indeterminate && (
        <p className="mt-1 text-xs text-slate-500">
          This stage has no reliable percentage yet. Progress resumes when
          measured work is available.
        </p>
      )}
    </section>
  );
}
