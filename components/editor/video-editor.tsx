"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { EditorSettings, ProjectStatus } from "@/lib/projects/model";
import { BrowserVideoEngine } from "@/lib/video/ffmpeg-browser";
import { createCutPlan } from "@/lib/video/planner";
import { downloadBlob } from "@/lib/video/download";
import { zipClips } from "@/lib/video/zip";
import ProcessingStatus from "./processing-status";
import { JobProgressTracker } from "@/lib/video/progress";
import {
  deviceProfile,
  needsPrecisionConfirmation,
  outputBudget,
  workloadDescription,
  type SourceInspection,
} from "@/lib/video/workload";
import { CUT_PRESETS_SECONDS, VIDEO_FILE_ACCEPT } from "@/lib/video/types";
import type {
  CompressionPreset,
  CutStrategy,
  EditMode,
  ProcessedClip,
  JobProgress,
} from "@/lib/video/types";

const ClipCard = memo(function ClipCard({
  clip,
  selected,
  onToggle,
}: {
  clip: ProcessedClip;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(clip.blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize an external Blob URL with its lifetime.
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [clip.blob]);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(clip.id)}
        />
        {clip.name}
      </label>
      <video
        className="my-3 aspect-video w-full rounded-lg bg-slate-900"
        src={url}
        controls
        preload="none"
        aria-label={`Preview ${clip.name}`}
      />
      <p className="text-sm text-slate-500">
        Requested {clip.range.start.toFixed(3)}–{clip.range.end.toFixed(3)}{" "}
        seconds · {(clip.blob.size / 1048576).toFixed(2)} MB
      </p>
      {clip.cutStrategy === "fast" && clip.alignedRange && (
        <p className="mt-1 text-sm text-amber-800">
          Fast Cut target keyframe range {clip.alignedRange.start.toFixed(3)}–
          {clip.alignedRange.end.toFixed(3)} seconds. Stream-copy boundaries can
          include timestamp padding or extra frames.
        </p>
      )}
      {clip.outputDuration !== undefined && (
        <p className="mt-1 text-sm text-slate-500">
          Exported duration: {clip.outputDuration.toFixed(3)} seconds ·{" "}
          {clip.cutStrategy === "fast"
            ? clip.audioConverted
              ? "Video copy + AAC audio conversion"
              : "Stream copy"
            : "H.264/AAC precision encode"}
        </p>
      )}
      <button
        className="mt-3 font-semibold text-blue-600"
        onClick={() => downloadBlob(clip.blob, clip.name)}
      >
        Download MP4
      </button>
    </article>
  );
});

export interface EditorSnapshot {
  settings: EditorSettings;
  file?: File;
  metadata: { duration: number; width: number; height: number };
}
export default function VideoEditor({
  initialSettings,
  initialSource,
  validateSource,
  onSnapshot,
  onStatus,
}: {
  initialSettings?: EditorSettings;
  initialSource?: File;
  validateSource?: (file: File, signal: AbortSignal) => Promise<void>;
  onSnapshot?: (snapshot: EditorSnapshot) => void;
  onStatus?: (status: ProjectStatus) => void;
}) {
  const [source, setSource] = useState<File | undefined>(initialSource);
  const [url, setUrl] = useState("");
  const [metadata, setMetadata] = useState({
    duration: 0,
    width: 0,
    height: 0,
  });
  const [mode, setMode] = useState<EditMode>(
    initialSettings?.mode ?? "manual-trim",
  );
  const [start, setStart] = useState(initialSettings?.range.start ?? 0);
  const [end, setEnd] = useState(initialSettings?.range.end ?? 0);
  const [seconds, setSeconds] = useState(initialSettings?.clipDuration ?? 30);
  const [keep, setKeep] = useState(initialSettings?.keepRemainder ?? true);
  const [strategy, setStrategy] = useState<CutStrategy>(
    initialSettings?.cutStrategy ?? "fast",
  );
  const [compression, setCompression] = useState<CompressionPreset>(
    initialSettings?.compression ?? "off",
  );
  const [clips, setClips] = useState<ProcessedClip[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const toggleSelection = useCallback(
    (id: string) =>
      setSelected((previous) =>
        previous.includes(id)
          ? previous.filter((value) => value !== id)
          : [...previous, id],
      ),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState("");
  const [inspection, setInspection] = useState<SourceInspection>();
  const [awaitingAudioConversion, setAwaitingAudioConversion] = useState(false);
  const [jobAudioConverted, setJobAudioConverted] = useState(false);
  const [awaitingPrecision, setAwaitingPrecision] = useState(false);
  const [modeNotice, setModeNotice] = useState("");
  const [jobMethod, setJobMethod] = useState<CutStrategy>(
    initialSettings?.cutStrategy ?? "fast",
  );
  const [progress, setProgress] = useState<JobProgress>(() =>
    new JobProgressTracker([]).snapshot(),
  );
  const tracker = useRef<JobProgressTracker | null>(null);
  const engine = useRef<BrowserVideoEngine | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const verifying = useRef<AbortController | null>(null);
  const [checking, setChecking] = useState(false);
  const restoreRange = useRef(!!initialSource);
  const player = useRef<HTMLVideoElement>(null);
  const audioReview = useRef<HTMLElement>(null);
  useEffect(() => {
    if (awaitingAudioConversion) {
      audioReview.current?.focus({ preventScroll: true });
      audioReview.current?.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }
  }, [awaitingAudioConversion]);
  const precisionReview = useRef<HTMLElement>(null);
  useEffect(() => {
    if (awaitingPrecision) {
      precisionReview.current?.focus({ preventScroll: true });
      precisionReview.current?.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }
  }, [awaitingPrecision]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      verifying.current?.abort();
      controller.current?.abort();
      void engine.current?.dispose();
    };
  }, []);
  useEffect(() => {
    if (!source) return;
    const next = URL.createObjectURL(source);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize an external Blob URL with its lifetime.
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [source]);

  useEffect(() => {
    if (!busy && !zipping) return;
    const timer = setInterval(() => {
      if (tracker.current) setProgress(tracker.current.snapshot());
    }, 250);
    return () => clearInterval(timer);
  }, [busy, zipping]);

  async function choose(file?: File) {
    if (!file || busy || zipping || checking) return;
    setError("");
    if (!file.size) {
      setError(
        "Choose a non-empty video file. Its actual container and codecs are inspected locally.",
      );
      return;
    }
    // Conservative safety guard, not a measured compatibility claim.
    if (file.size > 256 * 1048576) {
      setError(
        "This preview limits source files to 256 MB to reduce browser memory failures.",
      );
      return;
    }
    const abort = new AbortController();
    verifying.current = abort;
    setChecking(true);
    try {
      await validateSource?.(file, abort.signal);
      abort.signal.throwIfAborted();
    } catch (cause) {
      if (mounted.current && !abort.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Video verification failed",
        );
      return;
    } finally {
      if (mounted.current) setChecking(false);
    }
    if (!mounted.current) return;
    restoreRange.current = false;
    setInspection(undefined);
    setAwaitingAudioConversion(false);
    setJobAudioConverted(false);
    setAwaitingPrecision(false);
    if (compression === "off") {
      setStrategy("fast");
      setModeNotice(
        "Fast Cut selected for this new video. Compatibility is checked before exporting.",
      );
    }
    void engine.current?.dispose();
    engine.current = null;
    tracker.current = null;
    setProgress(new JobProgressTracker([]).snapshot());
    setMetadata({ duration: 0, width: 0, height: 0 });
    setClips([]);
    setSelected([]);
    setSource(file);
    setStart(0);
    setEnd(0);
  }
  let plan: ReturnType<typeof createCutPlan> = [];
  let planError = "";
  if (metadata.duration) {
    try {
      plan = createCutPlan({
        mode,
        sourceDuration: metadata.duration,
        selectedRange: { start, end },
        clipDuration: seconds,
        keepRemainder: keep,
      });
    } catch (cause) {
      planError = cause instanceof Error ? cause.message : "Invalid settings";
    }
  }

  const effectiveStrategy = compression === "off" ? strategy : "precision";
  useEffect(() => {
    onSnapshot?.({
      settings: {
        mode,
        range: { start, end },
        clipDuration: seconds,
        keepRemainder: keep,
        compression,
        cutStrategy: effectiveStrategy,
      },
      file: source,
      metadata,
    });
  }, [
    mode,
    start,
    end,
    seconds,
    keep,
    compression,
    effectiveStrategy,
    source,
    metadata,
    onSnapshot,
  ]);
  async function inspectVideo() {
    if (!source || busy || zipping || checking) return;
    player.current?.pause();
    const abort = new AbortController();
    controller.current = abort;
    const worker = engine.current ?? new BrowserVideoEngine();
    engine.current = worker;
    setBusy(true);
    setError("");
    const job = new JobProgressTracker([]);
    tracker.current = job;
    try {
      await worker.initialize((p) => {
        if (mounted.current) setProgress(job.update(0, p));
      }, abort.signal);
      const info = await worker.inspect(source, abort.signal);
      if (!mounted.current) return;
      setInspection(info);
      setMetadata({
        duration: info.duration,
        width: info.width,
        height: info.height,
      });
      if (
        !restoreRange.current &&
        (!metadata.duration || end === metadata.duration)
      )
        setEnd(info.duration);
      setModeNotice(
        "Source inspected locally. Review codec compatibility before processing. Inspection does not create outputs.",
      );
      setProgress(new JobProgressTracker([]).snapshot());
    } catch (cause) {
      if (mounted.current) {
        setInspection(undefined);
        setError(
          abort.signal.aborted
            ? "Inspection cancelled"
            : cause instanceof Error
              ? cause.message
              : "Media probe failed; compatibility is unknown.",
        );
        setProgress(job.finish(abort.signal.aborted ? "cancelled" : "failed"));
      }
    } finally {
      tracker.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  async function processVideo(confirmPrecision = false, convertAudio = false) {
    if (!source || !plan.length || busy || zipping || planError) return;
    // Avoid continuing the source preview's decoder alongside mobile encoding/copying.
    player.current?.pause();
    const abort = new AbortController();
    controller.current = abort;
    const worker = engine.current ?? new BrowserVideoEngine();
    engine.current = worker;
    const job = new JobProgressTracker(plan.map((clip) => clip.duration));
    tracker.current = job;
    let currentClip = 0;
    const publish = (p: Parameters<JobProgressTracker["update"]>[1]) => {
      if (mounted.current && !abort.signal.aborted)
        setProgress(job.update(currentClip, p));
    };
    setModeNotice("");
    setJobMethod(effectiveStrategy);
    setJobAudioConverted(convertAudio);
    setAwaitingAudioConversion(false);
    setAwaitingPrecision(false);
    setBusy(true);
    setError("");
    setClips([]);
    setSelected([]);
    setProgress(
      job.update(0, { status: "preparing", message: "Starting video job…" }),
    );
    try {
      await worker.initialize(publish, abort.signal);
      const info = await worker.inspect(source, abort.signal);
      if (!mounted.current) return;
      setInspection(info);
      if (effectiveStrategy === "precision" && !info.conversion?.available) {
        throw new Error(
          info.conversion?.reason ?? "Conversion is unavailable in this build.",
        );
      }
      if (
        effectiveStrategy === "fast" &&
        !info.compatible &&
        info.conversion?.available &&
        info.conversion.audioOnly &&
        !convertAudio
      ) {
        setAwaitingAudioConversion(true);
        tracker.current = null;
        setProgress(new JobProgressTracker([]).snapshot());
        return;
      }
      if (
        effectiveStrategy === "fast" &&
        !info.compatible &&
        !(
          convertAudio &&
          info.conversion?.available &&
          info.conversion.audioOnly
        )
      ) {
        setError(
          `${info.incompatibility} Fast Cut did not start. ${info.conversion?.available ? "Choose Precision Cut explicitly or reconnect a compatible MP4." : (info.conversion?.reason ?? "No verified conversion path is available.")}`,
        );
        setProgress(
          job.finish(
            "failed",
            "Fast Cut is incompatible with this source. No encoding fallback was started.",
          ),
        );
        onStatus?.("failed");
        return;
      }
      const device = deviceProfile(navigator);
      if (
        effectiveStrategy === "precision" &&
        (needsPrecisionConfirmation(device) ||
          info.conversion?.precisionLoss ||
          info.conversion?.omittedTracks) &&
        !confirmPrecision
      ) {
        setAwaitingPrecision(true);
        tracker.current = null;
        setProgress(new JobProgressTracker([]).snapshot());
        return;
      }
      onStatus?.("processing");
      let outputBytes = 0;
      for (const [index, range] of plan.entries()) {
        currentClip = index;
        abort.signal.throwIfAborted();
        publish({
          status: "preparing",
          message: `Preparing clip ${index + 1} of ${plan.length}…`,
        });
        const clip = await worker.process(
          source,
          {
            range,
            compression,
            cutStrategy: effectiveStrategy,
            convertAudio,
            maxOutputBytes: outputBudget(device) - outputBytes,
            outputName: `econtent-${String(range.index).padStart(3, "0")}.mp4`,
          },
          abort.signal,
        );
        outputBytes += clip.blob.size;
        if (outputBytes > outputBudget(device))
          throw new Error(
            "Output memory safety limit reached for this device. Download the completed clips and export a smaller section.",
          );
        if (mounted.current) {
          setClips((previous) => [...previous, clip]);
          setSelected((previous) => [...previous, clip.id]);
          setProgress(job.finishClip(index));
        }
      }
      if (mounted.current) {
        setProgress(
          job.finish(
            "completed",
            "MP4 exports ready. Preview before downloading.",
          ),
        );
        onStatus?.("completed");
      }
    } catch (cause) {
      await worker.dispose();
      if (engine.current === worker) engine.current = null;
      if (mounted.current) {
        setProgress(
          job.finish(
            abort.signal.aborted ? "cancelled" : "failed",
            abort.signal.aborted
              ? "Processing cancelled. Completed clips are still available."
              : "Video processing failed.",
          ),
        );
        onStatus?.(abort.signal.aborted ? "cancelled" : "failed");
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Processing failed. Try a smaller H.264/AAC MP4 file.",
          );
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function downloadZip(all: boolean) {
    if (busy || zipping) return;
    const abort = new AbortController();
    controller.current = abort;
    const job = new JobProgressTracker([]);
    tracker.current = job;
    setZipping(true);
    setError("");
    setProgress(
      job.update(0, { status: "packaging", message: "Preparing ZIP…" }),
    );
    try {
      const blob = await zipClips(
        all ? clips : clips.filter((clip) => selected.includes(clip.id)),
        (fraction) => {
          if (mounted.current && !abort.signal.aborted)
            setProgress(
              job.update(0, {
                status: "packaging",
                fraction,
                message: "Packaging selected MP4 files…",
              }),
            );
        },
        abort.signal,
      );
      abort.signal.throwIfAborted();
      downloadBlob(blob, "econtent-clips.zip");
      if (mounted.current)
        setProgress(job.finish("completed", "ZIP download ready."));
    } catch (cause) {
      if (mounted.current) {
        setProgress(
          job.finish(
            abort.signal.aborted ? "cancelled" : "failed",
            abort.signal.aborted
              ? "ZIP packaging cancelled."
              : "ZIP packaging failed.",
          ),
        );
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "ZIP creation failed. Download individual clips instead.",
          );
      }
    } finally {
      if (mounted.current) setZipping(false);
    }
  }
  const field =
    "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 disabled:opacity-50";
  const action =
    "rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50";
  return (
    <section className="mx-auto max-w-6xl space-y-6 px-5 py-8 text-slate-900">
      <div>
        <h1 className="text-3xl font-bold">Your local video workspace</h1>
        <p className="mt-2 text-slate-500">
          Cut, compress, preview and download. Video files stay on your device.
          No watermark.
        </p>
      </div>
      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void choose(event.dataTransfer.files[0]);
        }}
        className="block cursor-pointer rounded-2xl border-2 border-dashed border-blue-200 bg-white p-6 focus-within:ring-2 focus-within:ring-blue-500"
      >
        <span className="font-semibold text-blue-600">
          Choose or drop a video
        </span>
        <input
          aria-label="Choose video"
          className="mt-3 block w-full"
          type="file"
          accept={VIDEO_FILE_ACCEPT}
          disabled={busy || zipping || checking}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void choose(file);
          }}
        />
        <p className="mt-2 text-sm text-slate-500">
          Import MP4, MOV, WebM, MKV, AVI, FLV, WMV, MPEG, 3GP and more when the
          bundled FFmpeg build can read them. Export H.264/AAC MP4. 256 MiB
          safety cap; codec support and capacity vary. Files stay on this
          device.
        </p>
      </label>
      {checking && (
        <div
          role="status"
          className="flex flex-wrap gap-4 rounded-xl bg-blue-50 p-4 text-sm"
        >
          <span>Verifying video identity locally…</span>
          <button
            onClick={() => verifying.current?.abort()}
            className="font-semibold text-blue-700"
          >
            Cancel verification
          </button>
        </div>
      )}
      {source && (
        <div className="space-y-2">
          {!inspection && (
            <p className="text-sm text-slate-600">
              Codecs and container have not been inspected yet. Check locally
              before processing.
            </p>
          )}
          <button
            type="button"
            className={action}
            disabled={busy || zipping || checking}
            onClick={() => void inspectVideo()}
          >
            Check codec compatibility
          </button>
        </div>
      )}
      <ProcessingStatus
        progress={progress}
        method={progress.status === "idle" ? effectiveStrategy : jobMethod}
        active={busy || zipping}
        audioConverted={progress.status !== "idle" && jobAudioConverted}
        onCancel={() => controller.current?.abort()}
      />
      {inspection && (
        <aside
          aria-label="Video workload"
          className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"
        >
          <h2 className="font-semibold">Video workload</h2>
          <p className="mt-2">
            {inspection.videoCodec.toUpperCase()} /{" "}
            {inspection.audioCodec?.toUpperCase() ?? "no audio"} ·{" "}
            {(inspection.sizeBytes / 1000000).toFixed(1)} MB source ·{" "}
            {inspection.duration.toFixed(1)} seconds
          </p>
          <p className="mt-2 break-words">
            Container: {inspection.container} · Fast Cut:{" "}
            {inspection.compatible
              ? "compatible for MP4 stream copy"
              : `unavailable (${inspection.compatibilityIssue ?? "unknown"})`}
          </p>
          <p className="mt-2">
            Available methods:{" "}
            {inspection.compatible
              ? "Fast Cut (no conversion); "
              : inspection.conversion?.audioOnly &&
                  inspection.conversion.available
                ? "Fast video copy with explicit AAC audio conversion; "
                : ""}
            {inspection.conversion?.available
              ? "Precision Cut / convert to H.264 + AAC"
              : "conversion unavailable"}
            .
          </p>
          <p className="mt-2 font-semibold">
            Recommended:{" "}
            {inspection.compatible
              ? "Fast Cut with compression Off for speed; Precision Cut for accurate boundaries"
              : inspection.conversion?.available
                ? inspection.conversion.audioOnly
                  ? "copy H.264 video and convert audio only"
                  : "explicit conversion to H.264/AAC using Precision Cut"
                : "re-export this source with a trusted local converter"}
            .
          </p>
          {inspection.conversion?.precisionLoss && (
            <p className="mt-2 text-amber-900">
              {inspection.conversion.precisionLoss}
            </p>
          )}
          {inspection.conversion?.omittedTracks && (
            <p className="mt-2 text-amber-900">
              Precision export uses only the first video and first audio tracks;
              additional tracks and metadata attachments are omitted. Review
              before continuing.
            </p>
          )}
          {!inspection.conversion?.available && (
            <p className="mt-2 text-amber-900">
              {inspection.conversion?.reason}
            </p>
          )}
          <p className="mt-2">
            {workloadDescription(
              inspection,
              plan.reduce((sum, clip) => sum + clip.duration, 0),
              effectiveStrategy,
            )}
          </p>
          {inspection.incompatibility && (
            <div className="mt-2 text-amber-900">
              <p>{inspection.incompatibility}</p>
              {inspection.conversion?.available && (
                <button
                  type="button"
                  className="mt-2 font-semibold underline"
                  disabled={busy || zipping}
                  onClick={() => {
                    setStrategy("precision");
                    setModeNotice(
                      "Precision Cut selected explicitly. It re-encodes; decoding support is not guaranteed. Press Process video when ready.",
                    );
                  }}
                >
                  Choose Precision Cut explicitly
                </button>
              )}
            </div>
          )}
        </aside>
      )}
      {awaitingAudioConversion &&
        effectiveStrategy === "fast" &&
        compression === "off" &&
        inspection?.conversion?.audioOnly && (
          <aside
            ref={audioReview}
            tabIndex={-1}
            aria-label="Confirm audio conversion"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          >
            <h2 className="font-semibold">
              Keep H.264 video; convert audio to AAC
            </h2>
            <p className="mt-2">
              {inspection.audioCodec?.toUpperCase()} audio must be converted to
              AAC 128 kbps for standard MP4 export. This changes audio quality.
              Video is copied without re-encoding. Only the selected range is
              processed, at source keyframes; boundaries are not frame-accurate.
            </p>
            <p className="mt-2">
              {plan.length} clip(s),{" "}
              {plan.reduce((sum, clip) => sum + clip.duration, 0).toFixed(1)}{" "}
              seconds selected. This still uses browser memory; no fixed
              completion time is promised.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className={action}
                onClick={() => void processVideo(false, true)}
              >
                Convert audio and continue Fast Cut
              </button>
              <button
                className="font-semibold text-blue-700"
                onClick={() => setAwaitingAudioConversion(false)}
              >
                Cancel audio conversion
              </button>
            </div>
          </aside>
        )}
      {awaitingPrecision && effectiveStrategy === "precision" && (
        <aside
          aria-label="Confirm precision workload"
          ref={precisionReview}
          tabIndex={-1}
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <h2 className="font-semibold">Precision Cut requires re-encoding</h2>
          <p className="mt-2">
            {plan.length} clip(s) will be encoded on this device. Even with
            compression Off, this may take several minutes and use substantial
            memory. Keep this tab visible; Android backgrounding and heat can
            slow or suspend processing. There is no reliable time estimate yet.
          </p>
          {inspection?.conversion?.precisionLoss && (
            <p className="mt-2">{inspection.conversion.precisionLoss}</p>
          )}
          {inspection?.conversion?.omittedTracks && (
            <p className="mt-2">
              Additional tracks will be omitted; only the first video/audio
              tracks are exported.
            </p>
          )}
          {compression === "off" && (
            <p className="mt-2">
              Off uses a speed-focused encoder and can produce larger files.
              Fast Cut avoids re-encoding when compatible, with keyframe-based
              boundaries.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {compression === "off" && inspection?.compatible && (
              <button
                type="button"
                className={action}
                onClick={() => {
                  setStrategy("fast");
                  setAwaitingPrecision(false);
                  setModeNotice(
                    "Fast Cut selected. Press Process video to copy streams.",
                  );
                }}
              >
                Use Fast Cut instead
              </button>
            )}
            <button
              type="button"
              className="rounded-lg border border-amber-800 px-4 py-2 font-semibold"
              onClick={() => void processVideo(true)}
            >
              Continue with Precision Cut
            </button>
            <button
              type="button"
              className="px-3 py-2"
              onClick={() => {
                setAwaitingPrecision(false);
                void engine.current?.dispose();
                engine.current = null;
              }}
            >
              Cancel
            </button>
          </div>
        </aside>
      )}
      {source && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 break-all font-semibold">{source.name}</h2>
            <video
              ref={player}
              src={url}
              className="aspect-video w-full rounded-xl bg-slate-900"
              controls
              preload="metadata"
              aria-label="Original video"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (!Number.isFinite(video.duration) || video.duration <= 0) {
                  setError("Cannot read a valid video duration");
                  return;
                }
                setMetadata({
                  duration: video.duration,
                  width: video.videoWidth,
                  height: video.videoHeight,
                });
                if (!restoreRange.current) setEnd(video.duration);
              }}
              onError={() => {
                setError(
                  "Your browser cannot preview this source. Use Check codec compatibility to inspect it locally; preview support and MP4 remux support can differ.",
                );
              }}
            />
            <p className="mt-3 text-sm text-slate-500">
              {(source.size / 1048576).toFixed(2)} MB ·{" "}
              {metadata.duration.toFixed(3)} seconds · {metadata.width}×
              {metadata.height}
            </p>
            <p className="mt-3 text-sm text-slate-500">
              Standard export is H.264 video with AAC audio (or no audio). Fast
              Cut copies compatible streams; audio-only conversion requires your
              explicit choice. Other decodable formats use Precision Cut /
              conversion. Precision Cut uses CRF 18 / ultrafast with compression
              Off (larger files are possible), or CRF 20/25/30 with compression
              selected. Precision audio is AAC 128 kbps. Output size may
              increase.
            </p>
          </div>
          <fieldset
            disabled={busy || zipping}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <legend className="font-bold">Edit settings</legend>
            <label className="block">
              Mode
              <select
                aria-label="Mode"
                className={field}
                value={mode}
                onChange={(event) => setMode(event.target.value as EditMode)}
              >
                <option value="manual-trim">Manual trim</option>
                <option value="full-split">Split entire video</option>
                <option value="section-split">Split selected section</option>
                <option value="compress-only">
                  Whole video / compression only
                </option>
              </select>
            </label>
            {(mode === "manual-trim" || mode === "section-split") && (
              <div className="grid grid-cols-2 gap-3">
                <label>
                  Start (seconds)
                  <input
                    className={field}
                    type="number"
                    min="0"
                    step="0.001"
                    value={Number.isFinite(start) ? start : ""}
                    onChange={(event) => setStart(event.target.valueAsNumber)}
                  />
                  <button
                    type="button"
                    className="mt-1 text-sm text-blue-600"
                    onClick={() => setStart(player.current?.currentTime ?? 0)}
                  >
                    Use playhead as start
                  </button>
                </label>
                <label>
                  End (seconds)
                  <input
                    className={field}
                    type="number"
                    min="0"
                    max={metadata.duration}
                    step="0.001"
                    value={Number.isFinite(end) ? end : ""}
                    onChange={(event) => setEnd(event.target.valueAsNumber)}
                  />
                  <button
                    type="button"
                    className="mt-1 text-sm text-blue-600"
                    onClick={() =>
                      setEnd(player.current?.currentTime ?? metadata.duration)
                    }
                  >
                    Use playhead as end
                  </button>
                </label>
              </div>
            )}
            {(mode === "full-split" || mode === "section-split") && (
              <>
                <label className="block">
                  Clip length (seconds)
                  <input
                    className={field}
                    type="number"
                    min="0.001"
                    step="0.001"
                    list="durations"
                    value={Number.isFinite(seconds) ? seconds : ""}
                    onChange={(event) => setSeconds(event.target.valueAsNumber)}
                  />
                  <datalist id="durations">
                    {CUT_PRESETS_SECONDS.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={keep}
                    onChange={(event) => setKeep(event.target.checked)}
                  />
                  Keep final shorter clip
                </label>
              </>
            )}
            <label className="block">
              Cut method
              <select
                aria-label="Cut method"
                className={field}
                value={effectiveStrategy}
                disabled={compression !== "off"}
                onChange={(event) => {
                  setStrategy(event.target.value as CutStrategy);
                  setAwaitingAudioConversion(false);
                  setAwaitingPrecision(false);
                  setModeNotice(
                    event.target.value === "precision"
                      ? "Precision Cut explicitly selected. Video will be re-encoded, even with compression Off."
                      : "Fast Cut selected. Compatible streams will be copied; incompatible sources will stop with an explanation.",
                  );
                }}
              >
                <option value="fast">Fast Cut — stream copy</option>
                <option
                  value="precision"
                  disabled={inspection?.conversion?.available === false}
                >
                  Precision Cut — accurate boundaries
                </option>
              </select>
            </label>
            <p className="text-sm text-slate-500">
              {compression !== "off"
                ? "Compression uses Precision Cut. Choose Off to enable Fast Cut."
                : effectiveStrategy === "fast"
                  ? "Fast Cut snaps boundaries to preceding source keyframes. Results may include earlier footage or end earlier than requested; very short ranges may require Precision Cut. Exported ranges are shown below."
                  : "Precision Cut re-encodes for frame-accurate boundaries and takes longer. Off prioritizes quality, but is not lossless."}
            </p>
            <label className="block">
              Compression
              <select
                aria-label="Compression"
                className={field}
                value={compression}
                onChange={(event) => {
                  const preset = event.target.value as CompressionPreset;
                  setCompression(preset);
                  setStrategy(preset === "off" ? "fast" : "precision");
                  setAwaitingAudioConversion(false);
                  setAwaitingPrecision(false);
                  setModeNotice(
                    preset === "off"
                      ? "Compression Off: Fast Cut selected. Choose Precision Cut explicitly for accurate boundaries."
                      : "Compression requires re-encoding: Precision Cut selected. No stream-copy fallback will be attempted.",
                  );
                }}
              >
                <option value="off">Off — prioritize quality</option>
                <option value="high">High quality</option>
                <option value="balanced">Balanced</option>
                <option value="small">Smaller file</option>
              </select>
            </label>
            <p className="text-sm text-slate-500">
              {planError || `${plan.length} clip(s) planned`}
              {metadata.duration > 0 && !planError && !plan.length
                ? ". Enable Keep or reduce the clip length."
                : ""}
            </p>
            <button
              type="button"
              className={action}
              disabled={
                !plan.length ||
                !!planError ||
                !metadata.duration ||
                (!!inspection &&
                  !inspection.compatible &&
                  !inspection.conversion?.available) ||
                (effectiveStrategy === "precision" &&
                  inspection?.conversion?.available === false)
              }
              onClick={() => void processVideo()}
            >
              Process video
            </button>
          </fieldset>
        </div>
      )}
      {!modeNotice &&
        initialSettings?.cutStrategy === "precision" &&
        compression === "off" && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            This saved project restored Precision Cut. Compression Off still
            re-encodes. Choose Fast Cut if source keyframe boundaries are
            acceptable.
          </p>
        )}
      {modeNotice && (
        <p
          aria-live="polite"
          className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900"
        >
          {modeNotice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}
      {error && progress.status === "failed" && progress.startup && progress.startup.phase !== "ready" && source && plan.length > 0 && !planError && (
        <button type="button" disabled={busy || zipping || checking}
          className="rounded-lg border border-blue-600 px-4 py-2 font-semibold text-blue-700 disabled:opacity-50"
          onClick={() => {
            void engine.current?.dispose(); engine.current = null;
            void processVideo();
          }}>
          {progress.startup.phase === "download" ? "Retry FFmpeg download" : "Retry FFmpeg startup"}
        </button>
      )}
      {error &&
        effectiveStrategy === "fast" &&
        compression === "off" &&
        inspection?.conversion?.available && (
          <button
            className="font-semibold text-blue-700"
            onClick={() => {
              setStrategy("precision");
              setAwaitingPrecision(false);
              setError("");
              setModeNotice(
                "Precision Cut selected explicitly. Press Process video to review the encoding workload.",
              );
            }}
          >
            Choose Precision Cut instead
          </button>
        )}
      {!!clips.length && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Processed clips</h2>
          <div className="flex flex-wrap gap-3">
            <button
              className={action}
              disabled={busy || zipping || !selected.length}
              onClick={() => void downloadZip(false)}
            >
              Download selected ZIP ({selected.length})
            </button>
            <button
              className={action}
              disabled={busy || zipping}
              onClick={() => void downloadZip(true)}
            >
              Download all ZIP
            </button>
            <button
              disabled={busy || zipping}
              className="text-blue-600"
              onClick={() => {
                setClips([]);
                setSelected([]);
              }}
            >
              Clear outputs
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                selected={selected.includes(clip.id)}
                onToggle={toggleSelection}
              />
            ))}
          </div>
        </section>
      )}
      <p className="text-xs text-slate-500">
        Browser-local processing uses substantial memory and can be slow. Close
        other tabs and use short files for this preview. Desktop Chromium is the
        first verification target; mobile, Safari and Firefox are not yet
        verified.
      </p>
    </section>
  );
}
