"use client";
import { Button } from "@/components/ui/button";
import { requiredCreditSpeed } from "@/lib/titles/raster";
import type { useTitlesRender } from "./use-render";
import {
  EFFECTS,
  FONTS,
  type TitleText,
  type TitleScene,
  type TitleProject,
} from "@/lib/titles/model";
import { Label, NumberControl, field } from "./controls";
import type { LocalMedia } from "@/lib/composition/model";
export type ToolTab = "Scenes" | "Text" | "Animation" | "Background" | "Export";
export function TitleProperties({
  tab,
  scene,
  text,
  project,
  asset,
  importing,
  onText,
  onSelect,
  onAdd,
  onDelete,
  onBackground,
  onUpload,
  onOutput,
  render,
}: {
  tab: ToolTab;
  scene: TitleScene;
  text?: TitleText;
  project: TitleProject;
  asset?: LocalMedia;
  importing: boolean;
  onText: (patch: Partial<TitleText>) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: () => void;
  onBackground: (patch: Partial<TitleScene["background"]>) => void;
  onUpload: (file: File, kind: "image" | "video") => void;
  onOutput: (output: TitleProject["output"]) => void;
  render: ReturnType<typeof useTitlesRender>;
}) {
  const color = (
    name: string,
    value: string,
    change: (value: string) => void,
  ) => (
    <Label name={name}>
      <input
        aria-label={name}
        className={field + " h-10 cursor-pointer p-1"}
        type="color"
        value={value}
        onChange={(e) => change(e.target.value)}
      />
    </Label>
  );
  return (
    <div className="space-y-4 p-4">
      {tab === "Text" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Text layers</h2>
            <button
              className="text-xs font-semibold text-blue-600 disabled:text-slate-400"
              disabled={scene.text.length >= 8}
              onClick={onAdd}
            >
              + Add text
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scene.text.map((t, i) => (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                aria-pressed={text?.id === t.id}
                className={
                  "max-w-full truncate rounded-md border px-2 py-1.5 text-[10px] " +
                  (text?.id === t.id
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-500")
                }
              >
                T{i + 1} · {t.text.slice(0, 20) || "Empty text"}
              </button>
            ))}
          </div>
          {text ? (
            <>
              <Label name="Text content">
                <textarea
                  aria-label="Title text content"
                  className={field + " min-h-24 resize-y"}
                  maxLength={
                    text.entrance === "letter-reveal" ||
                    text.entrance === "word-reveal"
                      ? 240
                      : 2000
                  }
                  value={text.text}
                  onChange={(e) => onText({ text: e.target.value })}
                />
              </Label>
              <Label name="Font">
                <select
                  aria-label="Title font"
                  className={field}
                  value={text.font}
                  onChange={(e) =>
                    onText({ font: e.target.value as keyof typeof FONTS })
                  }
                >
                  <option value="serif">Classic serif · Georgia</option>
                  <option value="sans">Modern sans · Arial</option>
                  <option value="editorial">Editorial · Times</option>
                  <option value="mono">Monospace · Courier</option>
                </select>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <NumberControl
                  name="Font size"
                  value={text.fontSize}
                  min={8}
                  max={120}
                  step={1}
                  onChange={(fontSize) => onText({ fontSize })}
                />
                <Label name="Weight">
                  <select
                    aria-label="Title font weight"
                    className={field}
                    value={text.weight}
                    onChange={(e) =>
                      onText({
                        weight: Number(e.target.value) as TitleText["weight"],
                      })
                    }
                  >
                    {[400, 600, 700, 900].map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {color("Text color", text.color, (color) => onText({ color }))}
                <Label name="Alignment">
                  <select
                    aria-label="Title alignment"
                    className={field}
                    value={text.align}
                    onChange={(e) =>
                      onText({ align: e.target.value as TitleText["align"] })
                    }
                  >
                    {["left", "center", "right"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberControl
                  name="Tracking (em)"
                  value={text.tracking}
                  min={-0.05}
                  max={0.5}
                  step={0.01}
                  onChange={(tracking) => onText({ tracking })}
                />
                <NumberControl
                  name="Line height"
                  value={text.lineHeight}
                  min={1}
                  max={2}
                  step={0.05}
                  onChange={(lineHeight) => onText({ lineHeight })}
                />
              </div>
              <details>
                <summary className="cursor-pointer text-xs font-semibold">
                  Position & transform
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <NumberControl
                    name="Text X (%)"
                    value={Math.round(text.x * 10000) / 100}
                    min={0}
                    max={(1 - text.width) * 100}
                    onChange={(n) => onText({ x: n / 100 })}
                  />
                  <NumberControl
                    name="Text Y (%)"
                    value={Math.round(text.y * 10000) / 100}
                    min={0}
                    max={(1 - text.height) * 100}
                    onChange={(n) => onText({ y: n / 100 })}
                  />
                  <NumberControl
                    name="Text width (%)"
                    value={text.width * 100}
                    min={8}
                    max={(1 - text.x) * 100}
                    onChange={(n) => onText({ width: n / 100 })}
                  />
                  <NumberControl
                    name="Text height (%)"
                    value={text.height * 100}
                    min={5}
                    max={(1 - text.y) * 100}
                    onChange={(n) => onText({ height: n / 100 })}
                  />
                  <NumberControl
                    name="Text rotation"
                    value={text.rotation}
                    min={-180}
                    max={180}
                    step={1}
                    onChange={(rotation) => onText({ rotation })}
                  />
                </div>
              </details>
              <details>
                <summary className="cursor-pointer text-xs font-semibold">
                  Outline, shadow & background
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <NumberControl
                      name="Text outline"
                      value={text.outline}
                      min={0}
                      max={8}
                      onChange={(outline) => onText({ outline })}
                    />
                    {color("Outline color", text.outlineColor, (outlineColor) =>
                      onText({ outlineColor }),
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={text.shadow}
                      onChange={(e) => onText({ shadow: e.target.checked })}
                    />{" "}
                    Soft shadow
                  </label>
                  <Label name="Text background">
                    <select
                      className={field}
                      aria-label="Text background effect"
                      value={text.background}
                      onChange={(e) =>
                        onText({
                          background: e.target.value as TitleText["background"],
                        })
                      }
                    >
                      <option value="none">None</option>
                      <option value="tint">Soft tint</option>
                      <option value="solid">Solid</option>
                    </select>
                  </Label>
                  {text.background !== "none" &&
                    color(
                      "Text background color",
                      text.backgroundColor,
                      (backgroundColor) => onText({ backgroundColor }),
                    )}
                </div>
              </details>
              <button
                onClick={onDelete}
                className="text-xs font-medium text-red-600"
              >
                Delete selected text
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-500">Add a text layer to begin.</p>
          )}
        </>
      )}
      {tab === "Animation" && (
        <>
          <h2 className="text-sm font-bold">Bring words to life</h2>
          <p className="text-xs leading-5 text-slate-500">
            Entrance and exit timing is relative to this scene. Scrub the
            timeline to inspect each moment.
          </p>
          {text ? (
            <>
              <Label name="Entrance effect">
                <select
                  aria-label="Title entrance effect"
                  className={field}
                  value={text.entrance}
                  onChange={(e) =>
                    onText({
                      entrance: e.target.value as TitleText["entrance"],
                    })
                  }
                >
                  {Object.entries(EFFECTS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Label>
              <Label name="Exit effect">
                <select
                  aria-label="Title exit effect"
                  className={field}
                  value={text.exit}
                  onChange={(e) =>
                    onText({ exit: e.target.value as TitleText["exit"] })
                  }
                >
                  <option value="none">None</option>
                  <option value="fade">Fade Out</option>
                  <option value="slide-up">Slide Up</option>
                  <option value="zoom">Zoom Out</option>
                </select>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <NumberControl
                  name="Text start (s)"
                  value={text.start}
                  min={0}
                  max={text.end - 0.1}
                  onChange={(start) => onText({ start })}
                />
                <NumberControl
                  name="Text end (s)"
                  value={text.end}
                  min={text.start + 0.1}
                  max={scene.duration}
                  onChange={(end) => onText({ end })}
                />
              </div>
              <NumberControl
                name="Animation duration (s)"
                value={text.animationDuration}
                min={0.05}
                max={5}
                step={0.05}
                onChange={(animationDuration) => onText({ animationDuration })}
              />
              <p className="text-[10px] leading-4 text-slate-400">
                Entrance and exit each use at most half the text clip. Word and
                letter effects support up to 240 characters.
              </p>
              {text.entrance === "credit-roll" && (
                <>
                  <NumberControl
                    name="Credit speed (% canvas/s)"
                    value={text.creditSpeed}
                    min={5}
                    max={500}
                    step={1}
                    onChange={(creditSpeed) => onText({ creditSpeed })}
                  />
                  <button
                    type="button"
                    className="text-xs text-blue-600"
                    onClick={() => {
                      const ctx = document
                        .createElement("canvas")
                        .getContext("2d")!;
                      onText({
                        creditSpeed: Math.min(
                          500,
                          requiredCreditSpeed(
                            ctx,
                            text,
                            project.ratio,
                            project.output.fps,
                          ),
                        ),
                      });
                    }}
                  >
                    Fit complete credit roll
                  </button>
                  <p className="text-xs text-slate-500">
                    Enter one name or role per line; reorder lines to reorder
                    credits. Extend scene duration for longer credits. The
                    preview shows the actual travel at this speed.
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Select a text layer in Text first.
            </p>
          )}
        </>
      )}
      {tab === "Background" && (
        <>
          <h2 className="text-sm font-bold">Set the atmosphere</h2>
          <Label name="Background type">
            <select
              aria-label="Title background type"
              className={field}
              value={scene.background.kind}
              onChange={(e) =>
                onBackground({
                  kind: e.target.value as TitleScene["background"]["kind"],
                  assetId: undefined,
                })
              }
            >
              <option value="solid">Solid color</option>
              <option value="gradient">Gradient</option>
              <option value="image">Local image</option>
              <option value="video">Local video</option>
            </select>
          </Label>
          {color("Background color", scene.background.color, (color) =>
            onBackground({ color }),
          )}
          {scene.background.kind === "gradient" && (
            <>
              {color(
                "Gradient second color",
                scene.background.secondary,
                (secondary) => onBackground({ secondary }),
              )}
              <NumberControl
                name="Gradient angle"
                value={scene.background.angle}
                min={0}
                max={360}
                step={1}
                onChange={(angle) => onBackground({ angle })}
              />
              <div className="flex gap-2">
                {[
                  ["#101b2a", "#03070e"],
                  ["#2f2548", "#a75c6b"],
                  ["#092d31", "#1e827d"],
                ].map(([color, secondary]) => (
                  <button
                    key={color}
                    aria-label={"Use gradient " + color}
                    className="h-8 flex-1 rounded-lg border border-slate-200"
                    style={{
                      background: `linear-gradient(135deg,${color},${secondary})`,
                    }}
                    onClick={() => onBackground({ color, secondary })}
                  />
                ))}
              </div>
            </>
          )}
          {(scene.background.kind === "image" ||
            scene.background.kind === "video") && (
            <>
              <Label name={"Choose local " + scene.background.kind}>
                <input
                  aria-label="Upload title background"
                  disabled={importing}
                  type="file"
                  accept={
                    scene.background.kind === "image"
                      ? ".png,.jpg,.jpeg,.webp"
                      : "video/*,.mp4,.mov,.webm"
                  }
                  className={field + " text-[10px]"}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file)
                      onUpload(
                        file,
                        scene.background.kind as "image" | "video",
                      );
                  }}
                />
              </Label>
              <p className="break-words text-[10px] text-slate-500">
                {asset
                  ? `${asset.file.name} · ${(asset.file.size / 1048576).toFixed(1)} MiB`
                  : "Choose a browser-playable local file. Nothing is uploaded."}
              </p>
              {!asset && scene.background.assetId && (
                <button
                  type="button"
                  className="text-xs text-blue-600"
                  onClick={() => onBackground({ assetId: undefined })}
                >
                  Use a different background
                </button>
              )}
              <Label name="Media fit">
                <select
                  aria-label="Title background fit"
                  className={field}
                  value={scene.background.fit}
                  onChange={(e) =>
                    onBackground({ fit: e.target.value as "contain" | "cover" })
                  }
                >
                  <option value="contain">Fit · show the whole source</option>
                  <option value="cover">Fill · crop to canvas</option>
                </select>
              </Label>
              {scene.background.kind === "video" && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={scene.background.loop}
                    onChange={(e) => onBackground({ loop: e.target.checked })}
                  />{" "}
                  Loop background video
                </label>
              )}
              {scene.background.kind === "video" && !scene.background.loop && (
                <p className="text-[10px] leading-4 text-slate-400">
                  Video plays once, then holds its last frame. Volume controls
                  its audio when present.
                </p>
              )}
            </>
          )}
          <div className="space-y-3 border-t border-slate-100 pt-3">
            {(["grain", "vignette"] as const).map((key) => (
              <label
                key={key}
                className="flex items-center justify-between text-xs text-slate-600"
              >
                {key === "grain" ? "Film grain" : "Soft vignette"}
                <input
                  aria-label={
                    key === "grain" ? "Title film grain" : "Title vignette"
                  }
                  type="checkbox"
                  checked={scene.background[key]}
                  onChange={(e) => onBackground({ [key]: e.target.checked })}
                />
              </label>
            ))}
          </div>
        </>
      )}
      {tab === "Export" && (
        <>
          <h2 className="text-sm font-bold">Render your cinematic sequence</h2>
          <p className="text-xs leading-5 text-slate-500">
            Local H.264/AAC encoding. Start with short sequences at 360 or 480
            px on mobile. Keep this tab foregrounded. Encoding takes longer than
            Fast Cut; no media is uploaded.
          </p>
          <Label name="Output size">
            <select
              aria-label="Title output size"
              className={field}
              value={project.output.shortEdge}
              onChange={(e) =>
                onOutput({
                  ...project.output,
                  shortEdge: Number(
                    e.target.value,
                  ) as TitleProject["output"]["shortEdge"],
                })
              }
            >
              {[360, 480, 720, 1080].map((n) => (
                <option key={n} value={n}>
                  {n} px short edge{n === 480 ? " · recommended start" : ""}
                </option>
              ))}
            </select>
          </Label>
          <Label name="Frame rate">
            <select
              aria-label="Title frame rate"
              className={field}
              value={project.output.fps}
              onChange={(e) =>
                onOutput({
                  ...project.output,
                  fps: Number(e.target.value) as 24 | 30,
                })
              }
            >
              <option value={24}>24 fps · cinematic</option>
              <option value={30}>30 fps</option>
            </select>
          </Label>
          <p className="text-[10px] leading-4 text-slate-500">
            Scene joins are hard cuts. Timing is quantized to the selected frame
            rate. System fonts vary across devices; live and encoded frames
            share this browser’s canvas renderer. Background volume below the
            live canvas also sets export audio.
          </p>
          <Button
            className="w-full"
            variant="outline"
            size="sm"
            disabled={render.state === "running" || importing}
            onClick={render.render}
          >
            Render Preview
          </Button>
          <Button
            className="w-full"
            size="sm"
            disabled={render.state === "running" || importing}
            onClick={render.export}
          >
            {render.result ? "Download MP4" : "Export MP4"}
          </Button>
          {render.state === "running" && (
            <div
              role="status"
              className="space-y-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-900"
            >
              <p className="break-words">{render.progress?.stage}</p>
              {render.progress?.startup?.totalBytes ? (
                <p>
                  Asset bytes: {render.progress.startup.receivedBytes ?? 0} /{" "}
                  {render.progress.startup.totalBytes}
                </p>
              ) : null}
              {render.progress?.fraction !== undefined ? (
                <progress
                  aria-label="Title render progress"
                  className="w-full"
                  value={render.progress.fraction}
                  max={1}
                />
              ) : (
                <progress
                  aria-label="Title render progress"
                  className="w-full"
                />
              )}
              <p>
                {render.progress?.completedFrames ?? 0} /{" "}
                {render.progress?.totalFrames ?? "—"} frames encoded ·{" "}
                {render.elapsed.toFixed(1)} s elapsed
              </p>
            </div>
          )}
          {render.state === "cancelled" && (
            <p role="status" className="text-xs text-slate-600">
              Cancelled. No partial output accepted. Render Preview retries with
              a fresh worker.
            </p>
          )}
          {render.error && (
            <p role="alert" className="break-words text-xs text-red-700">
              {render.error} Use Render Preview to retry with a fresh worker.
            </p>
          )}
          {render.result && (
            <div className="space-y-2">
              <p role="status" className="text-xs text-emerald-700">
                Validated H.264/AAC MP4 ·{" "}
                {(render.result.blob.size / 1048576).toFixed(2)} MiB ·{" "}
                {render.elapsed.toFixed(1)} s render
              </p>
              <video
                controls
                playsInline
                preload="metadata"
                src={render.result.url}
                aria-label="Rendered titles MP4"
                className="w-full rounded-lg bg-black"
              />
              <p className="text-[10px] text-slate-500">
                This is the encoded MP4. Download reuses this file until the
                project changes.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
