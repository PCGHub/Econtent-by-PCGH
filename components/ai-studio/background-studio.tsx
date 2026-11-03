"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BackgroundRenderer,
  type BackgroundOptions,
  type BackgroundStatus,
} from "@/lib/background/renderer";
import {
  SourceAudio,
  recordBackground,
  type RecordingJob,
} from "@/lib/background/record";
const initial: BackgroundStatus = {
  stage: "preparing",
  message: "Choose a local video to start.",
  frames: 0,
};
export function BackgroundStudio() {
  const [sourceFile, setSourceFile] = useState<File | null>(null),
    [fps, setFps] = useState<12 | 24>(24);
  const [source, setSource] = useState(""),
    [sourceName, setSourceName] = useState(""),
    [imageUrl, setImageUrl] = useState("");
  const [background, setBackground] = useState<HTMLImageElement | null>(null),
    [imageError, setImageError] = useState(""),
    [imageReady, setImageReady] = useState(true);
  const [color, setColor] = useState("#155dfc"),
    [mode, setMode] = useState<"person" | "chroma">("person"),
    [key, setKey] = useState("#00ff00"),
    [tolerance, setTolerance] = useState(85),
    [threshold, setThreshold] = useState(0.5),
    [softness, setSoftness] = useState(0.12);
  const [fit, setFit] = useState<"cover" | "contain">("cover"),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50),
    [view, setView] = useState<BackgroundOptions["view"]>("composite");
  const [status, setStatus] = useState(initial),
    [retry, setRetry] = useState(0),
    [loaded, setLoaded] = useState(false),
    [duration, setDuration] = useState(0),
    [videoAspect, setVideoAspect] = useState("16 / 9"),
    [includeAudio, setIncludeAudio] = useState(true),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [message, setMessage] = useState("");
  const [download, setDownload] = useState(""),
    [playable, setPlayable] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<BackgroundRenderer | null>(null),
    audio = useRef<SourceAudio | null>(null),
    job = useRef<RecordingJob | null>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      job.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source);
  }, [source]);
  useEffect(() => {
    if (!imageUrl) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) {
        setBackground(image);
        setImageReady(true);
      }
    };
    image.onerror = () => {
      if (active) {
        setImageError(
          "The replacement image could not decode. Choose another image or remove it.",
        );
        setImageReady(false);
      }
    };
    image.src = imageUrl;
    return () => {
      active = false;
      image.onload = image.onerror = null;
      URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);
  useEffect(() => {
    if (!download) return;
    return () => URL.revokeObjectURL(download);
  }, [download]);
  useEffect(() => {
    if (!source || !video.current || !canvas.current) return;
    const renderer = new BackgroundRenderer(
      video.current,
      canvas.current,
      {
        mode,
        color: "#155dfc",
        image: null,
        fit: "cover",
        zoom: 1,
        x: 50,
        y: 50,
        threshold: 0.5,
        softness: 0.12,
        key: "#00ff00",
        tolerance: 85,
        view: "composite",
      },
      (state) => {
        if (alive.current) setStatus(state);
      },
    );
    engine.current = renderer;
    void renderer.start();
    return () => {
      renderer.dispose();
      if (engine.current === renderer) engine.current = null;
    };
  }, [source, mode, retry]);
  useEffect(() => {
    engine.current?.update({
      mode,
      color,
      image: background,
      fit,
      zoom,
      x,
      y,
      threshold,
      softness,
      key,
      tolerance,
      view,
    });
  }, [
    source,
    mode,
    retry,
    color,
    background,
    fit,
    zoom,
    x,
    y,
    threshold,
    softness,
    key,
    tolerance,
    view,
  ]);
  function change(action: () => void) {
    setDownload("");
    setPlayable(false);
    setMessage("");
    action();
  }
  async function exportVideo() {
    const el = video.current,
      renderer = engine.current;
    if (!el || !renderer || !sourceFile || recording) return;
    if (view !== "composite") {
      setMessage(
        "Choose Composite preview before exporting. Diagnostic mask/original views are not exported.",
      );
      return;
    }
    if (!imageReady || imageError) {
      setMessage("Wait for a valid replacement image or remove the image.");
      return;
    }
    if (!renderer.valid) {
      setMessage(
        renderer.failure ||
          "Wait for a valid current-frame preview before exporting.",
      );
      return;
    }
    setRecording(true);
    setDownload("");
    setPlayable(false);
    setSeconds(0);
    setMessage("Preparing a fresh first frame and audio…");
    audio.current ??= new SourceAudio();
    try {
      const active = recordBackground(
        el,
        renderer,
        audio.current,
        includeAudio,
        (value) => {
          if (alive.current) {
            setSeconds(value);
            setMessage(
              value >= duration - 0.001
                ? "Finalizing encoded video and audio…"
                : "Encoding source-timed video and audio…",
            );
          }
        },
        sourceFile,
        fps,
      );
      job.current = active;
      const blob = await active.done;
      if (!alive.current) return;
      setDownload(URL.createObjectURL(blob));
      setMessage(
        includeAudio
          ? "Encoding complete with original audio. Checking video playback; listen to the result before use."
          : "Encoding complete. Silent export was selected. Checking video playback.",
      );
    } catch (e) {
      if (alive.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "Export failed. No partial output was accepted.",
        );
    } finally {
      job.current = null;
      if (alive.current) setRecording(false);
    }
  }
  const stats = status.stats,
    percent =
      Number.isFinite(duration) && duration > 0
        ? Math.min(99, Math.floor((seconds / duration) * 100))
        : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
        AI Studio / Background
      </p>
      <h1 className="mt-2 text-3xl font-semibold">
        Background Remover & Changer
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Isolate one clear person without a green screen and replace the
        background. Detection runs locally on your device after downloading the AI model. Blur, heavy occlusion and multiple people may reduce cutout quality.
        Export is blocked when the person mask is invalid. Source videos and
        images are never uploaded.
      </p>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <fieldset disabled={recording} className="min-w-0 disabled:opacity-70">
          <legend className="sr-only">Source and replacement settings</legend>
          <label className="block text-sm font-semibold">
            Upload video
            <input
              type="file"
              accept="video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  change(() => {
                    setLoaded(false);
                    setVideoAspect("16 / 9");
                    setSourceFile(f);
                    setSourceName(f.name);
                    setSource(URL.createObjectURL(f));
                    setStatus(initial);
                  });
              }}
              className="mt-2 block w-full max-w-full text-sm"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Removal method
            <select
              className="mt-2 block w-full rounded-lg border p-3"
              value={mode}
              onChange={(e) =>
                change(() => {
                  setMode(e.target.value as typeof mode);
                  setStatus(initial);
                })
              }
            >
              <option value="person">
                AI Person Segmentation · SelfieSegmenter
              </option>
              <option value="chroma">Green/Blue Screen (chroma key)</option>
            </select>
          </label>
        </fieldset>
        {source && (
          <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold">
                Original · {sourceName}
              </p>
              <video
                ref={video}
                src={source}
                controls={!recording}
                playsInline
                aria-label="Original background source"
                onLoadedMetadata={(e) => {
                  setLoaded(true);
                  setDuration(e.currentTarget.duration);
                  if (e.currentTarget.videoWidth && e.currentTarget.videoHeight)
                    setVideoAspect(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`);
                }}
                onError={() => {
                  setLoaded(false);
                  setMessage(
                    "This browser cannot decode the source video. Convert it to H.264 MP4 in Video Cutter and reconnect it here.",
                  );
                }}
                style={{ aspectRatio: videoAspect }}
                className="block max-h-[520px] max-w-full w-auto mx-auto rounded-lg bg-black"
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">
                {view === "composite"
                  ? "Background preview"
                  : view === "mask"
                    ? "Diagnostic: alpha confidence mask"
                    : "Diagnostic: original frame"}
              </p>
              <canvas
                ref={canvas}
                aria-label="Background composition preview"
                style={{ aspectRatio: videoAspect }}
                className="block max-h-[520px] max-w-full w-auto mx-auto rounded-lg bg-black object-contain"
              />
              <p
                role="status"
                aria-live="polite"
                className={
                  status.stage === "failed"
                    ? "mt-2 text-sm text-rose-800"
                    : "mt-2 text-sm text-slate-600"
                }
              >
                {status.message}
              </p>
              {status.stage === "failed" && !recording && (
                <button
                  type="button"
                  onClick={() =>
                    change(() => {
                      setStatus(initial);
                      setRetry((n) => n + 1);
                    })
                  }
                  className="mt-2 rounded-lg border px-3 py-2 text-sm font-semibold"
                >
                  Retry person detection
                </button>
              )}
            </div>
          </div>
        )}
        <fieldset
          disabled={recording}
          className="mt-5 min-w-0 disabled:opacity-70"
        >
          <legend className="sr-only">
            Background, mask and audio controls
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "chroma" && (
              <>
                <label className="text-sm">
                  Screen colour to remove
                  <input
                    type="color"
                    value={key}
                    onChange={(e) => change(() => setKey(e.target.value))}
                    className="mt-2 block h-10 w-24"
                  />
                </label>
                <label className="text-sm">
                  Tolerance: {tolerance}
                  <input
                    type="range"
                    min="10"
                    max="200"
                    value={tolerance}
                    onChange={(e) =>
                      change(() => setTolerance(Number(e.target.value)))
                    }
                    className="mt-3 block w-full"
                  />
                </label>
              </>
            )}
            <label className="text-sm">
              Replacement colour
              <input
                type="color"
                value={color}
                onChange={(e) => change(() => setColor(e.target.value))}
                className="mt-2 block h-10 w-24"
              />
            </label>
            <div>
              <label className="text-sm">
                Replacement image
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      change(() => {
                        setBackground(null);
                        setImageReady(false);
                        setImageError("");
                        setImageUrl(URL.createObjectURL(f));
                      });
                  }}
                  className="mt-2 block w-full max-w-full text-sm"
                />
              </label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() =>
                    change(() => {
                      setImageUrl("");
                      setBackground(null);
                      setImageReady(true);
                      setImageError("");
                    })
                  }
                  className="mt-2 rounded border px-3 py-2 text-xs"
                >
                  Remove replacement image
                </button>
              )}
            </div>
            <label className="text-sm">
              Background framing
              <select
                value={fit}
                onChange={(e) =>
                  change(() => setFit(e.target.value as typeof fit))
                }
                className="mt-2 block w-full rounded border p-2"
              >
                <option value="cover">Fill frame (crop edges)</option>
                <option value="contain">Fit whole image</option>
              </select>
            </label>
            <label className="text-sm">
              Background zoom: {zoom.toFixed(1)}×
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={zoom}
                onChange={(e) => change(() => setZoom(Number(e.target.value)))}
                className="mt-2 block w-full"
              />
            </label>
            <label className="text-sm">
              Horizontal position: {x}%
              <input
                type="range"
                min="0"
                max="100"
                value={x}
                onChange={(e) => change(() => setX(Number(e.target.value)))}
                className="mt-2 block w-full"
              />
            </label>
            <label className="text-sm">
              Vertical position: {y}%
              <input
                type="range"
                min="0"
                max="100"
                value={y}
                onChange={(e) => change(() => setY(Number(e.target.value)))}
                className="mt-2 block w-full"
              />
            </label>
            {mode === "person" && (
              <>
                <label className="text-sm">
                  Person mask threshold: {threshold.toFixed(2)}
                  <input
                    type="range"
                    min="0.2"
                    max="0.85"
                    step="0.05"
                    value={threshold}
                    onChange={(e) =>
                      change(() => setThreshold(Number(e.target.value)))
                    }
                    className="mt-2 block w-full"
                  />
                </label>
                <label className="text-sm">
                  Edge softness: {softness.toFixed(2)}
                  <input
                    type="range"
                    min="0.02"
                    max="0.3"
                    step="0.02"
                    value={softness}
                    onChange={(e) =>
                      change(() => setSoftness(Number(e.target.value)))
                    }
                    className="mt-2 block w-full"
                  />
                </label>
              </>
            )}
            <label className="text-sm">
              Export frame rate
              <select
                aria-label="Export frame rate"
                value={fps}
                onChange={(e) =>
                  change(() => setFps(Number(e.target.value) as 12 | 24))
                }
                className="mt-2 block w-full rounded border p-2"
              >
                <option value="24">24 fps · smoother motion</option>
                <option value="12">12 fps · fewer frames to process</option>
              </select>
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(e) =>
                  change(() => setIncludeAudio(e.target.checked))
                }
              />
              Include original audio mix track
            </label>
          </div>
        </fieldset>
        {!imageReady && !imageError && (
          <p role="status" className="mt-3 text-sm text-slate-600">
            Loading replacement image… Export is unavailable until it decodes.
          </p>
        )}
        {imageError && (
          <p role="alert" className="mt-3 text-sm text-rose-800">
            {imageError}
          </p>
        )}
        {mode === "person" && (
          <details className="mt-5 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Mask diagnostics
            </summary>
            <label className="mt-3 block text-sm">
              Preview view
              <select
                aria-label="Segmentation preview view"
                disabled={recording}
                value={view}
                onChange={(e) => setView(e.target.value as typeof view)}
                className="mt-2 block w-full rounded border p-2"
              >
                <option value="composite">Composite (exported)</option>
                <option value="mask">
                  Raw alpha confidence (diagnostic only)
                </option>
                <option value="original">
                  Original frame (diagnostic only)
                </option>
              </select>
            </label>
            <p className="mt-3 text-xs leading-5 text-slate-600">
              Full-body pose and mask checks must pass on every exported frame.
              Confidence is in alpha; white shows foreground. Missing visible
              body parts, uncertain detections or abrupt tracking losses abort
              export. Checks cannot guarantee perfect edges—review the preview.
              During export, diagnostics show the last completed frame check.
            </p>
            {stats?.quality && (
              <p
                data-testid="person-quality"
                className={
                  stats.quality.safe
                    ? "mt-3 text-sm text-slate-700"
                    : "mt-3 text-sm font-medium text-rose-800"
                }
              >
                {stats.quality.safe
                  ? "Visible-body checks passed."
                  : "Export blocked: " + stats.quality.reason}{" "}
                {stats.quality.matchedPoints}/{stats.quality.visiblePoints}{" "}
                visible points, {stats.quality.matchedSegments}/
                {stats.quality.checkedSegments} limb segments retained.
              </p>
            )}
            {stats ? (
              <div
                data-testid="mask-diagnostics"
                className="mt-2 space-y-1 break-words text-xs text-slate-600"
              >
                <p>
                  {stats.representation} · {stats.width} × {stats.height} ·
                  frame {stats.time.toFixed(3)} s · foreground{" "}
                  {stats.maskAvailable === false
                    ? "unavailable"
                    : (stats.coverage * 100).toFixed(1) + "%"}{" "}
                  · {stats.valid ? "Body checks passed" : stats.reason}
                </p>
                <p>
                  {stats.channels
                    .map(
                      (s, i) =>
                        `${"RGBA"[i]} ${s.min}–${s.max} mean ${s.mean.toFixed(1)}`,
                    )
                    .join(" · ")}
                </p>
                <p>
                  {status.frames} processed frames · last inference{" "}
                  {status.inferenceMs?.toFixed(0) ?? "—"} ms · source and mask
                  captured together
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-600">
                No current mask. Waiting for a freshly detected frame.
              </p>
            )}
          </details>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={
              !loaded ||
              recording ||
              status.stage !== "ready" ||
              !imageReady ||
              view !== "composite"
            }
            onClick={exportVideo}
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {recording ? "Encoding composition…" : "Export short video (WebM)"}
          </button>
          {recording && (
            <button
              type="button"
              onClick={() => job.current?.cancel()}
              className="rounded-lg border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-800"
            >
              Cancel export
            </button>
          )}
          {download && playable && (
            <a
              href={download}
              download="econtent-background.webm"
              className="inline-block rounded-lg border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700"
            >
              Download result
            </a>
          )}
        </div>
        {recording && (
          <div className="mt-3" role="status">
            <p className="text-sm">
              Encoded source timeline: {seconds.toFixed(1)} s
              {Number.isFinite(duration) ? ` / ${duration.toFixed(1)} s` : ""}
              {percent !== null ? ` · ${percent}%` : ""}. Keep this tab visible.
            </p>
            {percent !== null && (
              <progress
                aria-label="Background export progress"
                value={percent}
                max="100"
                className="mt-2 w-full"
              />
            )}
          </div>
        )}
        {message && (
          <p role="status" className="mt-3 text-sm text-slate-700">
            {message}
          </p>
        )}
        {download && (
          <video
            src={download}
            controls
            playsInline
            aria-label="Exported background video"
            className="mt-4 max-h-[420px] w-full rounded-lg bg-black"
            onLoadedData={() => setPlayable(true)}
            onError={() => {
              setPlayable(false);
              setMessage(
                "The exported WebM could not decode in this browser. No verified download is available; retry or use another browser.",
              );
            }}
          />
        )}
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Browser-local WebM export: up to 3 minutes, 64 MB source limit,
          maximum 720 px on the longest edge, at your selected frame rate.
          Composition requires WebCodecs encoding and can run slowly on mobile.
          Original audio is decoded locally and encoded as Opus when selected;
          unavailable audio causes a clear failure rather than a silent
          omission. Silence in the source remains silent. Check playback before
          importing into{" "}
          <Link href="/video-editor" className="underline">
            Video Editor
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
