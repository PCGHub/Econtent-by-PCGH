"use client";
import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Copy,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  LayoutTemplate,
  Type,
  Wind,
  Image as ImageIcon,
  Download,
  Layers,
} from "lucide-react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Button } from "@/components/ui/button";
import { readLocalMedia } from "@/lib/composition/media";
import type { LocalMedia } from "@/lib/composition/model";
import {
  initialProject,
  template,
  TEMPLATES,
  type TemplateId,
} from "@/lib/titles/templates";
import {
  backgroundStyle,
  clamp,
  durationOf,
  duplicate,
  formatTime,
  locate,
  newText,
  setDuration,
  startOf,
  type TitleProject,
  type TitleText,
  type TitleScene,
  type TitleRatio,
} from "@/lib/titles/model";
import { TitleCanvas } from "./canvas";
import { TitleProperties, type ToolTab } from "./properties";
import { TitlesTimeline } from "./timeline";
import { Label, NumberControl, field } from "./controls";
import styles from "./studio.module.css";
const tabs: { name: ToolTab; icon: typeof Type }[] = [
  { name: "Scenes", icon: Layers },
  { name: "Text", icon: Type },
  { name: "Animation", icon: Wind },
  { name: "Background", icon: ImageIcon },
  { name: "Export", icon: Download },
];
export function TitlesStudio() {
  const [project, setProject] = useState<TitleProject>(initialProject),
    [time, setTime] = useState(2.4),
    [playing, setPlaying] = useState(false),
    [volume, setVolume] = useState(0);
  const [selected, setSelected] = useState<string>("titles-initial-0-text-1"),
    [tab, setTab] = useState<ToolTab>("Text"),
    [gallery, setGallery] = useState(false),
    [error, setError] = useState(""),
    [importing, setImporting] = useState(false);
  const [assets, setAssets] = useState<Record<string, LocalMedia>>({});
  const docRef = useRef(project),
    clock = useRef(time),
    assetsRef = useRef<Record<string, LocalMedia>>({}),
    uploadAbort = useRef<AbortController | null>(null),
    gesture = useRef<{ scene: string; text: TitleText } | null>(null),
    draggedScene = useRef("");
  const total = durationOf(project),
    current = locate(project, time),
    scene = current.scene,
    text = scene.text.find((t) => t.id === selected) ?? scene.text[0],
    asset = scene.background.assetId
      ? assets[scene.background.assetId]
      : undefined;
  useEffect(
    () => () => {
      uploadAbort.current?.abort();
      for (const m of Object.values(assetsRef.current))
        URL.revokeObjectURL(m.url);
    },
    [],
  );
  useEffect(() => {
    if (!playing) return;
    const base = clock.current,
      origin = performance.now();
    let raf = 0,
      last = 0;
    const frame = (now: number) => {
      const next = Math.min(total, base + (now - origin) / 1000);
      if (now - last > 32 || next === total) {
        clock.current = next;
        setTime(next);
        last = now;
      }
      if (next >= total) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);
  const seek = (at: number) => {
    setPlaying(false);
    const next = clamp(at, 0, durationOf(docRef.current));
    clock.current = next;
    setTime(next);
  };
  const commit = (next: TitleProject, focus?: string) => {
    const before = locate(docRef.current, clock.current),
      target =
        next.scenes.find((s) => s.id === (focus ?? before.scene.id)) ??
        next.scenes[0];
    docRef.current = next;
    setProject(next);
    seek(
      startOf(next, target.id) +
        (focus
          ? Math.min(2, target.duration / 2)
          : Math.min(before.time, target.duration - 0.001)),
    );
    const used = new Set(next.scenes.map((s) => s.background.assetId)),
      kept: Record<string, LocalMedia> = {};
    for (const [id, media] of Object.entries(assetsRef.current)) {
      if (used.has(id)) kept[id] = media;
      else queueMicrotask(() => URL.revokeObjectURL(media.url));
    }
    assetsRef.current = kept;
    setAssets(kept);
  };
  const editScene = (patch: Partial<TitleScene>) =>
    commit({
      ...project,
      scenes: project.scenes.map((s) =>
        s.id === scene.id ? { ...s, ...patch } : s,
      ),
    });
  const editText = (id: string, patch: Partial<TitleText>) => {
    const doc = docRef.current,
      target = doc.scenes.find((s) => s.text.some((t) => t.id === id)),
      original = target?.text.find((t) => t.id === id);
    if (!target || !original) return;
    if (
      (patch.entrance === "letter-reveal" ||
        patch.entrance === "word-reveal") &&
      original.text.length > 240
    ) {
      setError(
        "Shorten this layer to 240 characters for word/letter reveal, or use Typewriter or Credit Roll.",
      );
      return;
    }
    const next = { ...original, ...patch };
    next.width = clamp(next.width, 0.08, 1);
    next.height = clamp(next.height, 0.05, 1);
    next.x = clamp(next.x, 0, 1 - next.width);
    next.y = clamp(next.y, 0, 1 - next.height);
    next.start = clamp(next.start, 0, target.duration - 0.1);
    next.end = clamp(next.end, next.start + 0.1, target.duration);
    setError("");
    commit({
      ...doc,
      scenes: doc.scenes.map((s) =>
        s.id === target.id
          ? { ...s, text: s.text.map((t) => (t.id === id ? next : t)) }
          : s,
      ),
    });
  };
  const selectText = (id: string, movePlayhead = true) => {
    const clip = scene.text.find((t) => t.id === id);
    setSelected(id);
    if (movePlayhead && clip)
      seek(
        current.start +
          clip.start +
          Math.min(clip.animationDuration + 0.1, (clip.end - clip.start) / 2),
      );
    else setPlaying(false);
  };
  const chooseScene = (id: string) => {
    const next = project.scenes.find((s) => s.id === id)!;
    seek(startOf(project, id) + Math.min(2, next.duration / 2));
    setSelected(next.text[0]?.id);
  };
  const addScene = (id: TemplateId = "opening") => {
    if (project.scenes.length >= 12) return;
    const next = template(id);
    const scenes = [...project.scenes];
    scenes.splice(current.index + 1, 0, next);
    commit({ ...project, scenes }, next.id);
    setSelected(next.text[0]?.id);
    setGallery(false);
  };
  const reorder = (id: string, target: number) => {
    const scenes = [...project.scenes],
      from = scenes.findIndex((s) => s.id === id);
    if (from < 0 || target < 0 || target >= scenes.length) return;
    const [item] = scenes.splice(from, 1);
    scenes.splice(target, 0, item);
    commit({ ...project, scenes });
  };
  const copyScene = () => {
    if (project.scenes.length >= 12) return;
    const next = duplicate(scene),
      scenes = [...project.scenes];
    scenes.splice(current.index + 1, 0, next);
    commit({ ...project, scenes }, next.id);
    setSelected(next.text[0]?.id);
  };
  const removeScene = () => {
    if (project.scenes.length === 1) return;
    commit(
      { ...project, scenes: project.scenes.filter((s) => s.id !== scene.id) },
      project.scenes[current.index === 0 ? 1 : current.index - 1].id,
    );
  };
  const upload = async (file: File, kind: "image" | "video") => {
    uploadAbort.current?.abort();
    const controller = new AbortController();
    uploadAbort.current = controller;
    setImporting(true);
    setError("");
    setPlaying(false);
    const target = scene.id;
    let media: LocalMedia | undefined;
    try {
      media = await readLocalMedia(file, kind, controller.signal);
      controller.signal.throwIfAborted();
      const doc = docRef.current;
      if (!doc.scenes.some((s) => s.id === target)) {
        URL.revokeObjectURL(media.url);
        return;
      }
      if (
        Object.values(assetsRef.current).reduce(
          (sum, m) => sum + m.file.size,
          0,
        ) +
          file.size >
        256 * 1048576
      )
        throw Error(
          "Local title backgrounds are limited to 256 MiB combined. Remove an unused media background first.",
        );
      const id = crypto.randomUUID();
      assetsRef.current = { ...assetsRef.current, [id]: media };
      commit({
        ...doc,
        scenes: doc.scenes.map((s) =>
          s.id === target
            ? { ...s, background: { ...s.background, kind, assetId: id } }
            : s,
        ),
      });
      media = undefined;
    } catch (cause) {
      if (media) URL.revokeObjectURL(media.url);
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Local media import failed",
        );
    } finally {
      if (uploadAbort.current === controller) setImporting(false);
    }
  };
  const sceneActions = (
    <div className="flex items-center gap-1">
      <button
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        aria-label="Move title scene up"
        disabled={current.index === 0 || importing}
        onClick={() => reorder(scene.id, current.index - 1)}
      >
        <ArrowUp className="size-4" />
      </button>
      <button
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        aria-label="Move title scene down"
        disabled={current.index === project.scenes.length - 1 || importing}
        onClick={() => reorder(scene.id, current.index + 1)}
      >
        <ArrowDown className="size-4" />
      </button>
      <button
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        aria-label="Duplicate title scene"
        disabled={project.scenes.length >= 12 || importing}
        onClick={copyScene}
      >
        <Copy className="size-4" />
      </button>
      <button
        className="rounded-md p-2 text-slate-500 hover:bg-red-50 disabled:opacity-30"
        aria-label="Delete title scene"
        disabled={project.scenes.length === 1 || importing}
        onClick={removeScene}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
  const toolButtons = (mobile: boolean) => (
    <div
      role="tablist"
      aria-label={mobile ? "Mobile title tools" : "Title properties"}
      className={"grid gap-1 " + (mobile ? "grid-cols-5" : "grid-cols-4")}
    >
      {tabs
        .filter((t) => mobile || t.name !== "Scenes")
        .map(({ name, icon: Icon }) => (
          <button
            key={name}
            role="tab"
            aria-selected={
              (mobile ? tab : tab === "Scenes" ? "Text" : tab) === name
            }
            tabIndex={
              (mobile ? tab : tab === "Scenes" ? "Text" : tab) === name ? 0 : -1
            }
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const choices = tabs.filter((t) => mobile || t.name !== "Scenes"),
                index = choices.findIndex((t) => t.name === name),
                next =
                  (index + (e.key === "ArrowRight" ? 1 : choices.length - 1)) %
                  choices.length;
              setTab(choices[next].name);
              e.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
            onClick={() => setTab(name)}
            className={
              "flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[9px] font-medium " +
              ((mobile ? tab : tab === "Scenes" ? "Text" : tab) === name
                ? "bg-blue-50 text-blue-700"
                : "text-slate-500 hover:bg-slate-50")
            }
          >
            <Icon className="size-4" />
            {name}
          </button>
        ))}
    </div>
  );
  return (
    <WorkspaceShell>
      <main className={"mx-auto max-w-[1600px] p-4 md:p-6 " + styles.studio}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Clapperboard className="size-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                Cinematic Titles Studio
              </h1>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-semibold text-blue-700">
                FRONTEND PREVIEW
              </span>
            </div>
            <p className="text-xs text-slate-500">
              A powerful first impression. One scene at a time.
            </p>
          </div>
          <Button
            size="sm"
            disabled={project.scenes.length >= 12 || importing}
            onClick={() => addScene()}
          >
            <Plus className="size-4" /> Add scene
          </Button>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <input
            aria-label="Titles project name"
            maxLength={120}
            className="min-w-0 max-w-full border-0 bg-transparent text-sm font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-blue-200"
            value={project.title}
            onChange={(e) => commit({ ...project, title: e.target.value })}
          />
          <span className="text-[10px] text-slate-400">
            Local session draft · refreshing clears this design
          </span>
        </div>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          >
            {error}
          </p>
        )}
        {importing && (
          <div
            role="status"
            className="mb-4 flex items-center justify-between rounded-lg bg-blue-50 p-3 text-xs text-blue-700"
          >
            Reading local background…
            <button
              onClick={() => uploadAbort.current?.abort()}
              className="font-semibold"
            >
              Cancel import
            </button>
          </div>
        )}
        <div className={styles.workspace}>
          <aside
            className={
              styles.scenes +
              " overflow-hidden rounded-2xl border border-slate-200 bg-white " +
              (tab !== "Scenes" ? styles.panelHidden : "")
            }
            aria-label="Title scenes and templates"
          >
            <div className="flex gap-1 border-b border-slate-100 p-2">
              <button
                className={
                  "flex-1 rounded-lg py-2 text-xs font-semibold " +
                  (!gallery ? "bg-slate-100" : "text-slate-400")
                }
                onClick={() => setGallery(false)}
              >
                Scenes{" "}
                <span className="ml-1 text-slate-400">
                  {project.scenes.length}
                </span>
              </button>
              <button
                className={
                  "flex-1 rounded-lg py-2 text-xs font-semibold " +
                  (gallery ? "bg-slate-100" : "text-slate-400")
                }
                onClick={() => setGallery(true)}
              >
                Templates
              </button>
            </div>
            <div className={styles.panelBody + " space-y-3 p-3"}>
              {gallery ? (
                <>
                  <p className="text-[10px] leading-4 text-slate-500">
                    Eight starting points. Make every frame your own. Selecting
                    a template adds a scene.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        aria-label={"Add " + t.category + " template"}
                        disabled={project.scenes.length >= 12 || importing}
                        onClick={() => addScene(t.id)}
                        className="overflow-hidden rounded-lg border border-slate-200 text-left transition hover:-translate-y-0.5 hover:border-blue-400 disabled:opacity-40"
                      >
                        <div
                          className="flex aspect-[1.3] items-center justify-center p-2 text-center font-serif text-[10px] leading-4 whitespace-pre-line"
                          style={{ background: t.bg, color: t.color }}
                        >
                          {t.sample}
                        </div>
                        <div className="p-1.5">
                          <p className="truncate text-[9px] font-semibold">
                            {t.name}
                          </p>
                          <p className="text-[8px] text-slate-400">
                            {t.category}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {project.scenes.map((s, i) => (
                    <div
                      key={s.id}
                      draggable={!importing}
                      onDragStart={(e) => {
                        draggedScene.current = s.id;
                        e.dataTransfer.setData("text/plain", s.id);
                      }}
                      onDragEnd={() => {
                        draggedScene.current = "";
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (
                          draggedScene.current &&
                          e.dataTransfer.getData("text/plain") ===
                            draggedScene.current
                        )
                          reorder(draggedScene.current, i);
                        draggedScene.current = "";
                      }}
                      className={
                        "overflow-hidden rounded-xl border transition " +
                        (s.id === scene.id
                          ? "border-blue-400 bg-blue-50/40 shadow-sm"
                          : "border-slate-200 hover:border-blue-200")
                      }
                    >
                      <button
                        aria-label={`Select title scene ${i + 1}: ${s.name}`}
                        aria-pressed={s.id === scene.id}
                        className="block w-full p-2 text-left"
                        onClick={() => chooseScene(s.id)}
                      >
                        <div
                          className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md p-2 text-center font-serif text-[12px] leading-4 text-[#e7d3ac] whitespace-pre-line"
                          style={{ background: backgroundStyle(s.background) }}
                        >
                          <span className="absolute left-1.5 top-1 rounded bg-black/20 px-1 text-[8px] text-white/50">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {s.text
                            .find((t) => t.fontSize >= 25)
                            ?.text.slice(0, 50) ?? "CAST & CREW"}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-1">
                          <span className="truncate text-[10px] font-semibold">
                            {s.name}
                          </span>
                          <span className="shrink-0 text-[9px] text-slate-400">
                            {s.duration.toFixed(1)}s
                          </span>
                        </div>
                      </button>
                    </div>
                  ))}
                  <div className="border-t border-slate-100 pt-2">
                    {sceneActions}
                    <Label name="Scene name">
                      <input
                        aria-label="Title scene name"
                        maxLength={80}
                        className={field}
                        value={scene.name}
                        onChange={(e) => editScene({ name: e.target.value })}
                      />
                    </Label>
                    <div className="mt-3">
                      <NumberControl
                        name="Scene duration (s)"
                        value={scene.duration}
                        min={1}
                        max={120}
                        step={0.1}
                        onChange={(n) => {
                          const changed = setDuration(scene, n);
                          editScene(changed);
                        }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setGallery(true)}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 text-[10px] font-semibold text-blue-600"
                  >
                    <LayoutTemplate className="size-3.5" /> Explore templates
                  </button>
                </>
              )}
            </div>
          </aside>
          <section
            className={
              styles.preview +
              " overflow-hidden rounded-2xl border border-slate-200 bg-white"
            }
            aria-label="Live title preview"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <span className="text-[9px] font-bold tracking-[.15em] text-slate-400">
                  COMPOSITION PREVIEW
                </span>
                <p className="mt-1 text-[11px] font-medium text-slate-700">
                  {scene.name}
                </p>
              </div>
              <select
                aria-label="Titles aspect ratio"
                className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] font-medium"
                value={project.ratio}
                onChange={(e) =>
                  commit({ ...project, ratio: e.target.value as TitleRatio })
                }
              >
                {["16:9", "9:16", "1:1", "4:5"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0 bg-[#e9edf3] px-3 py-5 md:px-5">
              <TitleCanvas
                scene={scene}
                ratio={project.ratio}
                time={current.time}
                playing={playing}
                selected={text?.id}
                asset={asset}
                volume={volume}
                onSelect={(id) => {
                  const t = scene.text.find((t) => t.id === id);
                  if (t) gesture.current = { scene: scene.id, text: { ...t } };
                  selectText(id, false);
                }}
                onText={editText}
                onFinish={(cancel) => {
                  const before = gesture.current;
                  gesture.current = null;
                  if (cancel && before && before.scene === scene.id)
                    editText(before.text.id, before.text);
                }}
                onError={setError}
              />
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-600">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Live
                  · unrendered
                </span>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Previous title scene"
                    className="p-2 text-slate-500 disabled:opacity-30"
                    disabled={current.index === 0}
                    onClick={() =>
                      chooseScene(project.scenes[current.index - 1].id)
                    }
                  >
                    <SkipBack className="size-4" />
                  </button>
                  <button
                    aria-label={
                      playing ? "Pause titles preview" : "Play titles preview"
                    }
                    className="flex size-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm"
                    onClick={() => {
                      if (time >= total) seek(0);
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? (
                      <Pause className="size-4 fill-current" />
                    ) : (
                      <Play className="ml-0.5 size-4 fill-current" />
                    )}
                  </button>
                  <button
                    aria-label="Next title scene"
                    className="p-2 text-slate-500 disabled:opacity-30"
                    disabled={current.index === project.scenes.length - 1}
                    onClick={() =>
                      chooseScene(project.scenes[current.index + 1].id)
                    }
                  >
                    <SkipForward className="size-4" />
                  </button>
                </div>
                <output
                  data-testid="titles-time"
                  className="text-[10px] tabular-nums text-slate-500"
                >
                  {formatTime(current.time)} / {formatTime(scene.duration)}
                </output>
              </div>
              <input
                aria-label="Titles scene scrubber"
                className="my-3 w-full accent-blue-600"
                type="range"
                min={0}
                max={scene.duration}
                step={0.01}
                value={current.time}
                onChange={(e) => seek(current.start + Number(e.target.value))}
              />
              <div className="flex items-center justify-between gap-2 text-[9px] text-slate-400">
                <span>
                  Scene {current.index + 1} of {project.scenes.length} ·{" "}
                  {scene.text.length} text layers
                </span>
                <label className="flex items-center gap-2">
                  <button
                    aria-label={
                      volume ? "Mute titles preview" : "Unmute titles preview"
                    }
                    disabled={asset?.kind !== "video"}
                    onClick={() => setVolume((v) => (v ? 0 : 0.6))}
                  >
                    {volume ? (
                      <Volume2 className="size-3.5" />
                    ) : (
                      <VolumeX className="size-3.5" />
                    )}
                  </button>
                  <span className="sr-only">Background video volume</span>
                  <input
                    aria-label="Titles preview volume"
                    disabled={asset?.kind !== "video"}
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-16 accent-blue-600"
                  />
                </label>
              </div>
            </div>
          </section>
          <div
            className={
              styles.mobileTabs +
              " rounded-xl border border-slate-200 bg-white p-1"
            }
          >
            {toolButtons(true)}
          </div>
          <aside
            className={
              styles.properties +
              " overflow-hidden rounded-2xl border border-slate-200 bg-white " +
              (tab === "Scenes" ? styles.panelHidden : "")
            }
            aria-label="Title styling properties"
          >
            <div
              className={styles.desktopTabs + " border-b border-slate-100 p-1"}
            >
              {toolButtons(false)}
            </div>
            <div className={styles.panelBody}>
              <TitleProperties
                tab={tab === "Scenes" ? "Text" : tab}
                scene={scene}
                text={text}
                project={project}
                asset={asset}
                importing={importing}
                onText={(patch) => {
                  if (text) editText(text.id, patch);
                }}
                onSelect={(id) => selectText(id)}
                onAdd={() => {
                  if (scene.text.length >= 8) return;
                  const next = newText(scene.duration, {
                    text: "Your new title",
                    fontSize: 24,
                  });
                  editScene({ text: [...scene.text, next] });
                  setSelected(next.id);
                }}
                onDelete={() => {
                  if (text)
                    editScene({
                      text: scene.text.filter((t) => t.id !== text.id),
                    });
                }}
                onBackground={(patch) =>
                  editScene({ background: { ...scene.background, ...patch } })
                }
                onUpload={(file, kind) => void upload(file, kind)}
                onOutput={(output) => commit({ ...project, output })}
              />
            </div>
          </aside>
          <div className={styles.timeline}>
            <TitlesTimeline
              project={project}
              time={time}
              sceneId={scene.id}
              selected={text?.id}
              onSeek={seek}
              onScene={chooseScene}
              onText={editText}
              onSelect={(id) => selectText(id)}
            />
          </div>
        </div>
        <p className="mt-4 text-center text-[10px] leading-5 text-slate-400">
          Your creative space, on your device. Media stays local. This title
          draft lives in this tab; cloud saving and video rendering are not
          connected.
        </p>
      </main>
    </WorkspaceShell>
  );
}
