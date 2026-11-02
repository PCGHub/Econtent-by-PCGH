import { backgroundRect, outputSize, refineMask, type MaskStats } from "./mask";
import {
  deadline,
  personModel,
  type PersonModel,
  type SegmentationResult,
} from "./model";
export interface BackgroundOptions {
  mode: "person" | "chroma";
  color: string;
  image: HTMLImageElement | null;
  fit: "cover" | "contain";
  zoom: number;
  x: number;
  y: number;
  threshold: number;
  softness: number;
  key: string;
  tolerance: number;
  view: "composite" | "mask" | "original";
}
export interface BackgroundStatus {
  stage: "loading" | "preparing" | "ready" | "failed";
  message: string;
  stats?: MaskStats;
  frames: number;
  inferenceMs?: number;
}
const canvas = () => document.createElement("canvas");
/** Owns all frame resources. Borrowed MediaPipe results NEVER escape onResults. */
export class BackgroundRenderer {
  private model: PersonModel | null = null;
  private stopped = false;
  private raf = 0;
  private epoch = 0;
  private busy = false;
  private dirty = true;
  private submitted = -1;
  private pending: { epoch: number; time: number; started: number } | null =
    null;
  private input = canvas();
  private source = canvas();
  private raw = canvas();
  private alpha = canvas();
  private foreground = canvas();
  private debug = canvas();
  private pixels: ImageData | null = null;
  private debugPixels: ImageData | null = null;
  private representation = "";
  private refined: ImageData | null = null;
  private stats?: MaskStats;
  private frames = 0;
  private inferenceMs = 0;
  private published = 0;
  private sentAt = 0;
  private failMessage = "";
  private initializing = true;
  private exporting = false;
  private presented = false;
  private videoFrame = 0;
  private paintFrame = 0;
  private watchFrames = () => {
    if (this.stopped || !this.video.requestVideoFrameCallback) return;
    this.videoFrame = this.video.requestVideoFrameCallback(() => {
      if (this.stopped) return;
      this.presented = true;
      this.dirty = true;
      this.watchFrames();
    });
  };
  private afterPaint = () => {
    const epoch = this.epoch;
    cancelAnimationFrame(this.paintFrame);
    this.paintFrame = requestAnimationFrame(() => {
      this.paintFrame = requestAnimationFrame(() => {
        if (!this.stopped && this.epoch === epoch && !this.presented) {
          this.presented = true;
          this.dirty = true;
        }
      });
    });
  };
  private loaded = () => {
    // Paused/offscreen video and repeated decoded frames can omit RVFC delivery.
    // After seeked/loadeddata, allow two paint turns before reading the decoded
    // frame. An epoch check prevents this fallback from releasing a later seek.
    this.afterPaint();
  };
  setExporting(value: boolean) {
    this.exporting = value;
  }
  private callbacks = new Set<() => void>();
  constructor(
    private video: HTMLVideoElement,
    readonly output: HTMLCanvasElement,
    private options: BackgroundOptions,
    private notify: (s: BackgroundStatus) => void,
  ) {
    video.addEventListener("seeking", this.invalidate);
    video.addEventListener("seeked", this.loaded);
    video.addEventListener("loadeddata", this.loaded);
    this.watchFrames();
    // A mode change/retry may attach after the paused frame was presented already.
    if (video.readyState >= 2) this.afterPaint();
  }
  async start() {
    this.loop();
    if (this.options.mode === "chroma") {
      this.initializing = false;
      this.publish("preparing", "Preparing chroma key");
      return;
    }
    this.publish(
      "loading",
      "Downloading / initializing the local person detection model…",
    );
    try {
      const model = await personModel();
      if (this.stopped) {
        void model.close();
        return;
      }
      this.model = model;
      model.onResults((result) => {
        try {
          this.results(result);
        } finally {
          for (const image of new Set([
            result.image,
            result.segmentationMask,
          ])) {
            if (
              typeof ImageBitmap !== "undefined" &&
              image instanceof ImageBitmap
            )
              image.close();
          }
        }
      });
      model.setOptions({ modelSelection: 1, selfieMode: false });
      await deadline(
        model.initialize(),
        45000,
        "Person detection initialization timed out. Retry to create a fresh model.",
      );
      if (this.stopped) {
        void model.close();
        return;
      }
      this.initializing = false;
      this.dirty = true;
      this.publish(
        "preparing",
        "Model initialized. Detecting the current frame…",
      );
    } catch (e) {
      this.initializing = false;
      if (this.stopped) void this.model?.close().catch(() => {});
      this.fail(e);
    }
  }
  update(options: BackgroundOptions) {
    this.options = options;
    if (this.pixels) this.refine();
    this.draw();
    this.publishCurrent(true);
  }
  private invalidate = () => {
    this.epoch++;
    this.presented = false;
    cancelAnimationFrame(this.paintFrame);
    this.submitted = -1;
    this.dirty = true;
    this.pixels = null;
    this.stats = undefined;
    this.draw();
    if (!this.initializing)
      this.publish("preparing", "Detecting the selected frame…");
  };
  private size() {
    const { width, height } = outputSize(
      this.video.videoWidth || 640,
      this.video.videoHeight || 360,
    );
    for (const c of [
      this.output,
      this.input,
      this.source,
      this.raw,
      this.alpha,
      this.foreground,
      this.debug,
    ])
      if (c.width !== width || c.height !== height) {
        c.width = width;
        c.height = height;
        this.refined = null;
        this.debugPixels = null;
      }
    return { width, height };
  }
  private loop = () => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.loop);
    if (
      this.initializing ||
      this.failMessage ||
      this.busy ||
      this.video.seeking ||
      this.video.readyState < 2 ||
      !this.presented
    )
      return;
    const time = this.video.currentTime;
    if (
      !this.dirty &&
      (Math.abs(time - this.submitted) < 0.001 ||
        (performance.now() - this.sentAt < 65 && !this.video.paused))
    )
      return;
    this.size();
    this.busy = true;
    this.dirty = false;
    this.submitted = time;
    this.sentAt = performance.now();
    this.pending = { epoch: this.epoch, time, started: this.sentAt };
    this.input
      .getContext("2d")!
      .drawImage(this.video, 0, 0, this.input.width, this.input.height);
    if (this.options.mode === "chroma") {
      this.source.getContext("2d")!.drawImage(this.input, 0, 0);
      this.chroma();
      this.busy = false;
      this.pending = null;
      return;
    }
    if (!this.model) {
      this.busy = false;
      return;
    }
    void deadline(
      this.model.send({ image: this.input }),
      20000,
      "Person detection stopped responding. No original-video fallback was exported. Retry with a fresh model.",
    )
      .catch((e) => this.fail(e))
      .finally(() => {
        this.busy = false;
        this.pending = null;
        if (this.stopped) void this.model?.close().catch(() => {});
      });
  };
  private results(result: SegmentationResult) {
    const pending = this.pending;
    if (
      this.stopped ||
      this.failMessage ||
      !pending ||
      pending.epoch !== this.epoch ||
      this.video.seeking
    )
      return;
    try {
      const { width: w, height: h } = this.output;
      this.representation = result.segmentationMask.constructor.name;
      const geometry = result.segmentationMask as {
        width: number;
        height: number;
      };
      if (geometry.width !== w || geometry.height !== h)
        throw Error(
          `Unexpected mask geometry ${geometry.width}×${geometry.height}; expected ${w}×${h}. No mismatched frame was composited.`,
        );
      // Both snapshots happen synchronously while the SDK owns valid texture results.
      const ctx = this.source.getContext("2d")!;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(result.image, 0, 0, w, h);
      const mask = this.raw.getContext("2d", { willReadFrequently: true })!;
      mask.clearRect(0, 0, w, h);
      mask.drawImage(result.segmentationMask, 0, 0, w, h);
      this.pixels = mask.getImageData(0, 0, w, h);
      this.refine();
      this.inferenceMs = performance.now() - pending.started;
      this.frames++;
      this.draw();
      this.publishCurrent(this.video.paused || this.frames === 1);
      for (const cb of this.callbacks) cb();
    } catch (e) {
      this.fail(e);
    }
  }
  private refine() {
    if (!this.pixels) return;
    const w = this.output.width,
      h = this.output.height,
      ctx = this.alpha.getContext("2d")!;
    this.refined ??= ctx.createImageData(w, h);
    const stats = refineMask(
      this.pixels.data,
      this.refined.data,
      this.options.threshold,
      this.options.softness,
    );
    ctx.putImageData(this.refined, 0, 0);
    this.stats = {
      ...stats,
      representation: this.representation,
      width: w,
      height: h,
      time: this.pending?.time ?? this.stats?.time ?? this.submitted,
    };
    if (this.options.view === "mask") {
      const debug = this.debug.getContext("2d")!;
      this.debugPixels ??= debug.createImageData(w, h);
      const view = this.debugPixels;
      for (let i = 0; i < view.data.length; i += 4) {
        view.data[i] =
          view.data[i + 1] =
          view.data[i + 2] =
            this.pixels.data[i + 3];
        view.data[i + 3] = 255;
      }
      debug.putImageData(view, 0, 0);
    }
  }
  private chroma() {
    const w = this.output.width,
      h = this.output.height,
      ctx = this.raw.getContext("2d", { willReadFrequently: true })!,
      data = this.source.getContext("2d")!.getImageData(0, 0, w, h),
      rgb = [1, 3, 5].map((i) =>
        parseInt(this.options.key.slice(i, i + 2), 16),
      );
    for (let i = 0; i < data.data.length; i += 4) {
      const d = Math.hypot(
        data.data[i] - rgb[0],
        data.data[i + 1] - rgb[1],
        data.data[i + 2] - rgb[2],
      );
      data.data[i + 3] = Math.round(
        255 * Math.min(1, Math.max(0, (d - this.options.tolerance) / 35)),
      );
    }
    ctx.putImageData(data, 0, 0);
    this.frames++;
    this.draw();
    this.publishCurrent();
    for (const cb of this.callbacks) cb();
  }
  private draw() {
    const c = this.output,
      ctx = c.getContext("2d")!,
      w = c.width,
      h = c.height,
      o = this.options;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = o.color;
    ctx.fillRect(0, 0, w, h);
    if (o.image?.complete && o.image.naturalWidth) {
      const r = backgroundRect(
        w,
        h,
        o.image.naturalWidth,
        o.image.naturalHeight,
        o.fit,
        o.zoom,
        o.x,
        o.y,
      );
      ctx.drawImage(o.image, r.x, r.y, r.width, r.height);
    }
    if (o.view === "original") {
      ctx.drawImage(this.source, 0, 0);
      return;
    }
    if (o.view === "mask") {
      ctx.drawImage(this.debug, 0, 0);
      return;
    }
    if (o.mode === "chroma") {
      ctx.drawImage(this.raw, 0, 0);
      return;
    }
    if (!this.pixels || !this.stats?.valid) return; // Explicit replacement-only pending/error state, never an opaque original fallback.
    const fg = this.foreground.getContext("2d")!;
    fg.globalCompositeOperation = "source-over";
    fg.clearRect(0, 0, w, h);
    fg.drawImage(this.source, 0, 0);
    fg.globalCompositeOperation = "destination-in";
    fg.drawImage(this.alpha, 0, 0);
    fg.globalCompositeOperation = "source-over";
    ctx.drawImage(this.foreground, 0, 0);
  }
  private publish(stage: BackgroundStatus["stage"], message: string) {
    this.notify({
      stage,
      message,
      stats: this.stats,
      frames: this.frames,
      inferenceMs: this.inferenceMs,
    });
  }
  private publishCurrent(force = false) {
    if (this.initializing) return;
    if (this.exporting) force = false;
    const now = performance.now();
    if (!force && now - this.published < 500) return;
    this.published = now;
    this.publish(
      this.options.mode === "chroma"
        ? this.frames > 0
          ? "ready"
          : "preparing"
        : this.stats
          ? this.stats.valid
            ? "ready"
            : "failed"
          : "preparing",
      this.options.mode === "chroma"
        ? this.frames > 0
          ? "Chroma preview ready"
          : "Preparing chroma frame"
        : this.stats?.valid
          ? "Person and replacement background composited."
          : this.stats?.reason || "Waiting for a fresh mask",
    );
  }
  private fail(e: unknown) {
    if (this.stopped) return;
    this.failMessage =
      e instanceof Error ? e.message : "Person detection failed";
    this.stats = undefined;
    this.pixels = null;
    this.draw();
    this.publish("failed", this.failMessage);
    for (const cb of this.callbacks) cb();
  }
  get valid() {
    return (
      !this.failMessage &&
      (this.options.mode === "chroma" ? this.frames > 0 : !!this.stats?.valid)
    );
  }
  get failure() {
    return this.failMessage || this.stats?.reason || "";
  }
  get time() {
    return this.stats?.time ?? this.submitted;
  }
  async freshFrame(time: number) {
    this.dirty = true;
    await deadline(
      new Promise<void>((resolve, reject) => {
        const check = () => {
          if (this.failMessage || (this.stats && !this.stats.valid)) {
            this.callbacks.delete(check);
            reject(Error(this.failure));
            return;
          }
          if (this.valid && Math.abs(this.time - time) < 0.002) {
            this.callbacks.delete(check);
            resolve();
          }
        };
        this.callbacks.add(check);
        check();
      }),
      22000,
      "No valid segmented frame arrived for the requested position.",
    );
  }
  onFrame(callback: () => void) {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }
  dispose() {
    this.stopped = true;
    this.epoch++;
    cancelAnimationFrame(this.raf);
    this.callbacks.clear();
    this.video.removeEventListener("seeking", this.invalidate);
    this.video.removeEventListener("seeked", this.loaded);
    this.video.removeEventListener("loadeddata", this.loaded);
    if (this.videoFrame) this.video.cancelVideoFrameCallback?.(this.videoFrame);
    cancelAnimationFrame(this.paintFrame);
    if (!this.busy && !this.initializing)
      void this.model?.close().catch(() => {});
    for (const c of [
      this.input,
      this.source,
      this.raw,
      this.alpha,
      this.foreground,
      this.debug,
    ]) {
      c.width = c.height = 1;
    }
    this.pixels = null;
    this.refined = null;
    this.debugPixels = null;
  }
}
