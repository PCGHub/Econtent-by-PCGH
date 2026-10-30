"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DirectBox } from "@/components/overlay/direct-box";
import {
  backgroundStyle,
  sample,
  clamp,
  type TitleScene,
  type TitleText,
  type TitleRatio,
} from "@/lib/titles/model";
import type { LocalMedia } from "@/lib/composition/model";
import styles from "./studio.module.css";
import { drawTitleScene } from "@/lib/titles/raster";

function AnimatedText({ text, time }: { text: TitleText; time: number }) {
  return (
    <span className="sr-only" data-testid={"title-content-" + text.id}>
      {sample(text, time).text}
    </span>
  );
}

export function TitleCanvas({
  scene,
  ratio,
  time,
  playing,
  selected,
  asset,
  volume,
  onSelect,
  onText,
  onFinish,
  onError,
}: {
  scene: TitleScene;
  ratio: TitleRatio;
  time: number;
  playing: boolean;
  selected?: string;
  asset?: LocalMedia;
  volume: number;
  onSelect: (id: string) => void;
  onText: (id: string, patch: Partial<TitleText>) => void;
  onFinish: (cancel: boolean) => void;
  onError: (message: string) => void;
}) {
  const stage = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    graphics = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 640, height: 360 });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = graphics.current;
    if (!node) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    node.width = Math.round(size.width * dpr);
    node.height = Math.round(size.height * dpr);
    const ctx = node.getContext("2d");
    if (ctx)
      drawTitleScene(
        ctx,
        scene,
        time,
        node.width,
        node.height,
        undefined,
        ["video", "image"].includes(scene.background.kind),
      );
  }, [scene, time, size]);
  useEffect(() => {
    const node = video.current;
    return () => {
      if (node) {
        node.pause();
        node.removeAttribute("src");
        node.load();
      }
    };
  }, [asset?.url]);
  useEffect(() => {
    const node = video.current;
    if (!node || !asset) return;
    const target = scene.background.loop
      ? time % asset.duration
      : Math.min(time, Math.max(0, asset.duration - 0.04));
    node.volume = volume;
    if (Math.abs(node.currentTime - target) > 0.15) node.currentTime = target;
    const shouldPlay =
      playing && (scene.background.loop || time < asset.duration);
    if (shouldPlay && node.paused)
      void node
        .play()
        .catch(() =>
          onError(
            "Video audio playback was blocked. Pause and play again, or mute the preview.",
          ),
        );
    else if (!shouldPlay) node.pause();
  }, [time, playing, asset, volume, scene.background.loop, onError]);
  const [rw, rh] = ratio.split(":").map(Number);
  return (
    <div
      ref={stage}
      className={styles.stage}
      style={{ "--title-aspect": rw / rh } as CSSProperties}
    >
      <div className={styles.canvasTools}>
        <span>Drag text to compose</span>
        <button
          aria-label="Toggle fullscreen titles preview"
          type="button"
          className="rounded-md border border-slate-300/50 px-3 py-1.5 text-[10px] font-medium hover:bg-slate-400/10"
          onClick={() =>
            void (
              document.fullscreenElement
                ? document.exitFullscreen()
                : stage.current?.requestFullscreen()
            )?.catch(() =>
              onError("Fullscreen is unavailable in this browser."),
            )
          }
        >
          ⛶ Fullscreen
        </button>
      </div>
      <div
        ref={canvas}
        data-testid="titles-canvas"
        className={styles.canvas + " rounded-lg"}
        style={{
          aspectRatio: `${rw}/${rh}`,
          width:
            "min(100%,calc(var(--title-preview-height) * var(--title-aspect)))",
          maxWidth: 760,
          background: backgroundStyle(scene.background),
        }}
      >
        {asset &&
          scene.background.kind ===
            "image" /* Blob URL stays local; never use server image optimization. */ && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.url}
              alt="Local scene background"
              draggable={false}
              className="absolute inset-0 h-full w-full"
              style={{ objectFit: scene.background.fit }}
            />
          )}
        {asset && scene.background.kind === "video" && (
          <video
            key={asset.url}
            ref={video}
            src={asset.url}
            playsInline
            muted={volume === 0}
            preload="metadata"
            aria-label="Titles background video"
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: scene.background.fit }}
            onError={() =>
              onError(
                "This browser could not decode the background video. Reconnect a browser-compatible MP4. No conversion has started.",
              )
            }
          />
        )}
        {(scene.background.kind === "video" ||
          scene.background.kind === "image") &&
          !asset && (
            <div className="absolute inset-0 grid place-items-center p-5 text-center text-sm text-white/70">
              Reconnect a local {scene.background.kind} in Background.
            </div>
          )}
        <canvas
          ref={graphics}
          aria-label="Deterministic title animation"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {scene.text.map((t, index) => (
          <DirectBox
            key={t.id}
            label={"Title layer " + (index + 1)}
            box={{ x: t.x, y: t.y, width: t.width, height: t.height }}
            selected={!playing && selected === t.id}
            onSelect={() => onSelect(t.id)}
            onMove={(x, y) => onText(t.id, { x, y })}
            onResize={(sx, sy) =>
              onText(t.id, {
                width: clamp(t.width * sx, 0.08, 1 - t.x),
                height: clamp(t.height * sy, 0.05, 1 - t.y),
                fontSize: clamp(t.fontSize * Math.min(sx, sy), 8, 120),
              })
            }
            onFinish={onFinish}
          >
            <AnimatedText text={t} time={time} />
          </DirectBox>
        ))}
        {!playing && selected && (
          <div
            className="pointer-events-none absolute inset-[5%] z-10 border border-dashed border-white/15"
            aria-label="Title safe area"
          />
        )}
      </div>
    </div>
  );
}
