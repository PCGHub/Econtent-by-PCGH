import type { VideoProcessingEngine } from "./engine";
import type {
  ProcessOptions,
  ProcessedClip,
  ProcessingProgress,
  TimeRange,
} from "./types";
import {
  fastCompatibility,
  MediaInspectionError,
  type ProbeStream,
} from "./compatibility";
import { alignFastRange, encodingArgs } from "./command";
import { assertValidRange } from "./validation";
import { mediaFraction } from "./progress";
import { defaultStrategy, frameRate, type SourceInspection } from "./workload";

// Keep worker-only ambient declarations outside the app TypeScript program.
export interface FFmpegWorker {
  loaded: boolean;
  on(
    event: "progress",
    callback: (event: { progress: number; time: number }) => void,
  ): void;
  on(event: "log", callback: (event: { message: string }) => void): void;
  load(config: { coreURL: string; wasmURL: string }): Promise<boolean>;
  terminate(): void;
  writeFile(path: string, data: Uint8Array): Promise<boolean>;
  exec(args: string[]): Promise<number>;
  ffprobe(args: string[]): Promise<number>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<boolean>;
  createDir(path: string): Promise<boolean>;
  deleteDir(path: string): Promise<boolean>;
  mount(
    type: string,
    options: { files: File[] },
    path: string,
  ): Promise<boolean>;
  unmount(path: string): Promise<boolean>;
}
interface SourceInfo extends SourceInspection {
  keyframes?: number[];
  keyframeCoverage?: TimeRange;
}

/** One worker and one read-only source mount per session; all jobs are serialized. */
export class BrowserVideoEngine implements VideoProcessingEngine {
  private ffmpeg?: FFmpegWorker;
  private busy = false;
  private disposed = false;
  private source?: File;
  private input = "input";
  private info?: SourceInfo;
  private activeDuration?: number;
  private lastFraction = 0;
  private probeLog = "";
  private notify: (progress: ProcessingProgress) => void = () => {};
  sourceAccess?: "workerfs" | "memfs";
  private factory?: () => Promise<FFmpegWorker>;
  constructor(factory?: () => Promise<FFmpegWorker>) {
    this.factory = factory;
  }

  private emitTime = (time: number) => {
    if (!this.activeDuration) return;
    const fraction = mediaFraction(time, this.activeDuration);
    if (fraction === undefined) {
      this.notify({ status: "processing" });
      return;
    }
    if (fraction < this.lastFraction) return;
    this.lastFraction = fraction;
    this.notify({ status: "processing", fraction });
  };
  private stop = () => {
    this.ffmpeg?.terminate();
    this.ffmpeg = undefined;
    this.source = undefined;
    this.info = undefined;
    this.sourceAccess = undefined;
    this.activeDuration = undefined;
  };

  async initialize(
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.disposed) throw new Error("Engine disposed");
    signal?.throwIfAborted();
    this.notify = onProgress ?? (() => {});
    if (this.ffmpeg?.loaded) return;
    this.notify({ status: "loading", message: "Loading FFmpeg…" });
    signal?.addEventListener("abort", this.stop, { once: true });
    try {
      let ffmpeg: FFmpegWorker;
      if (this.factory) ffmpeg = await this.factory();
      else {
        const moduleURL = "/ffmpeg/ffmpeg/index.js";
        const { FFmpeg: Constructor } = (await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ moduleURL
        )) as { FFmpeg: new () => FFmpegWorker };
        ffmpeg = new Constructor();
      }
      if (this.disposed || signal?.aborted) {
        ffmpeg.terminate();
        throw new DOMException("Cancelled", "AbortError");
      }
      this.ffmpeg = ffmpeg;
      ffmpeg.on("progress", ({ time }) => this.emitTime(time));
      ffmpeg.on("log", ({ message }) => {
        this.probeLog = (this.probeLog + "\n" + message).slice(-8192);
        const match = /^out_time_us=(\d+)$/.exec(message.trim());
        if (match) this.emitTime(Number(match[1]));
      });
      await ffmpeg.load({
        coreURL: `${location.origin}/ffmpeg/core/ffmpeg-core.js`,
        wasmURL: `${location.origin}/ffmpeg/core/ffmpeg-core.wasm`,
      });
      signal?.throwIfAborted();
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      signal?.removeEventListener("abort", this.stop);
    }
  }

  private async probe(
    args: string[],
    output: string,
  ): Promise<Record<string, unknown>> {
    const ffmpeg = this.ffmpeg!;
    try {
      this.probeLog = "";
      const exit = await ffmpeg.ffprobe([
        "-v",
        "error",
        ...args,
        "-of",
        "json",
        "-o",
        output,
      ]);
      // core 0.12.10 can leave ret=-1 when ffprobe returns normally. A fresh,
      // parseable output plus the caller's required fields is authoritative.
      if (exit !== 0 && exit !== -1)
        throw new Error("ffprobe returned a failure");
      const data = await ffmpeg.readFile(output);
      return JSON.parse(
        typeof data === "string" ? data : new TextDecoder().decode(data),
      );
    } catch (error) {
      if (
        /moov atom not found|invalid atom|partial file|invalid data found|error reading header/i.test(
          this.probeLog,
        )
      )
        throw new MediaInspectionError(
          "malformed-metadata",
          "FFmpeg could not read the container header/index (for example, a missing MP4 moov atom or truncated file). Re-export or repair the original file. No codec incompatibility was established.",
        );
      throw new MediaInspectionError(
        "probe-failed",
        error instanceof SyntaxError
          ? "FFprobe returned unreadable metadata; codec compatibility is unknown."
          : "FFprobe could not inspect this file. It may be damaged, unsupported by this build, or exceed available browser memory. Codec compatibility is unknown.",
      );
    } finally {
      if (ffmpeg.loaded) await ffmpeg.deleteFile(output).catch(() => {});
    }
  }

  /** Inspect once, without frame decoding; retain the same source mount for actual jobs. */
  async inspect(source: File, signal?: AbortSignal): Promise<SourceInspection> {
    if (this.busy) throw new Error("Another operation is processing");
    if (!this.ffmpeg?.loaded || this.disposed)
      throw new Error("Initialize the engine first");
    signal?.throwIfAborted();
    this.busy = true;
    signal?.addEventListener("abort", this.stop, { once: true });
    try {
      await this.prepare(source, false);
      signal?.throwIfAborted();
      const {
        keyframes: _keys,
        keyframeCoverage: _coverage,
        ...info
      } = this.info!;
      void _keys;
      void _coverage;
      return info;
    } catch (error) {
      await this.releaseSource().catch(() => {});
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      throw error;
    } finally {
      this.busy = false;
      signal?.removeEventListener("abort", this.stop);
    }
  }

  private async readKeyframes(range: TimeRange): Promise<number[]> {
    const ffmpeg = this.ffmpeg!,
      path = "keyframes.txt";
    try {
      const exit = await ffmpeg.ffprobe([
        "-v",
        "error",
        "-read_intervals",
        `${range.start}%${range.end}`,
        "-select_streams",
        "v:0",
        "-show_packets",
        "-show_entries",
        "packet=pts_time,flags",
        "-of",
        "compact=p=0:nk=0",
        "-o",
        path,
        this.input,
      ]);
      if (exit !== 0 && exit !== -1)
        throw new Error(
          "Cannot inspect source keyframes. Choose Precision Cut explicitly.",
        );
      const data = await ffmpeg.readFile(path);
      const text =
        typeof data === "string" ? data : new TextDecoder().decode(data);
      const values = new Set<number>();
      // Only allocate numeric entries for keyframes, not JSON objects for every packet.
      for (let start = 0; start < text.length;) {
        const newline = text.indexOf("\n", start);
        const end = newline < 0 ? text.length : newline;
        const line = text.slice(start, end);
        if (/(?:^|\|)flags=[^|]*K/.test(line)) {
          const match = /(?:^|\|)pts_time=([^|]+)/.exec(line);
          const time = Number(match?.[1]);
          if (Number.isFinite(time) && time >= 0) values.add(time);
        }
        start = end + 1;
      }
      return [...values].sort((a, b) => a - b);
    } finally {
      if (ffmpeg.loaded) await ffmpeg.deleteFile(path).catch(() => {});
    }
  }

  private async prepare(
    source: File,
    fast: boolean,
    range?: TimeRange,
  ): Promise<void> {
    const ffmpeg = this.ffmpeg!;
    if (this.source !== source) {
      await this.releaseSource();
      this.notify({ status: "preparing", message: "Preparing source video…" });
      if (!source.size) throw new Error("The source video is empty");
      try {
        await ffmpeg.createDir("/source");
        const file = new File([source], "input", { type: source.type });
        if (!(await ffmpeg.mount("WORKERFS", { files: [file] }, "/source")))
          throw new Error("WORKERFS unavailable");
        this.input = "/source/input";
        this.sourceAccess = "workerfs";
      } catch {
        await ffmpeg.unmount("/source").catch(() => {});
        await ffmpeg.deleteDir("/source").catch(() => {});
        this.input = "input";
        this.sourceAccess = "memfs";
        // Compatibility fallback: transfer the source once, not once per clip.
        await ffmpeg.writeFile(
          this.input,
          new Uint8Array(await source.arrayBuffer()),
        );
      }
      this.source = source;
      const data = (await this.probe(
        [
          "-show_entries",
          "format=format_name,duration:stream=codec_type,codec_name,codec_tag_string,width,height,avg_frame_rate:stream_disposition=attached_pic",
          this.input,
        ],
        "source.json",
      )) as {
        format?: { duration?: string; format_name?: string };
        streams?: ProbeStream[];
      };
      const duration = Number(data.format?.duration);
      if (!Number.isFinite(duration) || duration <= 0)
        throw new MediaInspectionError(
          "malformed-metadata",
          "Cannot read a finite source duration",
        );
      const video = data.streams?.find((s) => s.codec_type === "video"),
        audio = data.streams?.find((s) => s.codec_type === "audio");
      if (!video)
        throw new MediaInspectionError(
          "malformed-metadata",
          "Source has no video stream",
        );
      const container = data.format?.format_name ?? "unknown";
      const compatibility = fastCompatibility(container, data.streams ?? []);
      this.info = {
        duration,
        sizeBytes: source.size,
        width: video.width ?? 0,
        height: video.height ?? 0,
        frameRate: frameRate(video.avg_frame_rate),
        videoCodec: video.codec_name ?? "unknown",
        audioCodec: audio ? (audio.codec_name ?? "unknown") : undefined,
        container,
        ...compatibility,
      };
    }
    if (fast) {
      if (!this.info?.compatible)
        throw new Error(
          `${this.info?.incompatibility ?? "Fast Cut is unavailable."} Choose Precision Cut explicitly, or use an H.264/AAC MP4. No encoding fallback was started.`,
        );
      if (!range)
        throw new Error(
          "A requested range is required for keyframe inspection",
        );
      assertValidRange(range, this.info.duration + 0.001);
      const coverage = this.info.keyframeCoverage;
      if (
        !this.info.keyframes ||
        !coverage ||
        range.start < coverage.start ||
        range.end > coverage.end
      ) {
        this.notify({
          status: "preparing",
          message:
            "Reading keyframes near the requested range (no frame decoding)…",
        });
        // Seek to a preceding GOP; never scan unrelated hours after a short trim.
        const window = {
          start: Math.max(0, range.start - 10),
          end: Math.min(this.info.duration, Math.ceil(range.end / 30) * 30 + 1),
        };
        this.info.keyframes = await this.readKeyframes(window);
        this.info.keyframeCoverage = { start: range.start, end: window.end };
      }
    }
  }

  async process(
    source: File,
    options: ProcessOptions,
    signal?: AbortSignal,
  ): Promise<ProcessedClip> {
    if (this.busy) throw new Error("Another clip is processing");
    if (!this.ffmpeg?.loaded || this.disposed)
      throw new Error("Initialize the engine first");
    signal?.throwIfAborted();
    const ffmpeg = this.ffmpeg;
    this.busy = true;
    signal?.addEventListener("abort", this.stop, { once: true });
    try {
      const fast = defaultStrategy(options) === "fast";
      if (fast && options.compression !== "off")
        throw new Error("Fast Cut requires compression Off");
      assertValidRange(options.range, Number.MAX_VALUE);
      await this.prepare(source, fast, options.range);
      signal?.throwIfAborted();
      assertValidRange(options.range, this.info!.duration + 0.001);
      const requested: TimeRange = {
        ...options.range,
        end: Math.min(options.range.end, this.info!.duration),
      };
      const range = fast
        ? alignFastRange(requested, this.info!.keyframes!, this.info!.duration)
        : requested;
      this.activeDuration = range.end - range.start;
      this.lastFraction = 0;
      this.notify({
        status: "processing",
        message: fast
          ? "Copying streams at source keyframes…"
          : "Encoding precision cut…",
      });
      const result = await ffmpeg.exec(
        encodingArgs({ ...options, range }, this.input),
      );
      this.activeDuration = undefined;
      signal?.throwIfAborted();
      if (result !== 0)
        throw new Error(
          fast
            ? "MP4 stream-copy/remux failed after metadata inspection. Selected packets may have unsupported configuration or damaged timestamps. No encoding fallback was started. Re-export the source, or explicitly try Precision Cut if the file is decodable."
            : "Precision encoding failed. Try a shorter section, or choose Fast Cut for a compatible source.",
        );
      this.notify({
        status: "finalizing",
        message: "Verifying and reading the MP4 output…",
      });
      const info = (await this.probe(
        [
          "-show_entries",
          "format=duration:stream=codec_name,codec_type",
          "output.mp4",
        ],
        "output.json",
      )) as {
        format?: { duration?: string };
        streams?: { codec_type: string; codec_name: string }[];
      };
      const duration = Number(info.format?.duration);
      if (
        !(duration > 0) ||
        !info.streams?.some(
          (s) => s.codec_type === "video" && s.codec_name === "h264",
        ) ||
        (this.info!.audioCodec &&
          !info.streams?.some(
            (s) =>
              s.codec_type === "audio" &&
              s.codec_name === (fast ? this.info!.audioCodec : "aac"),
          ))
      )
        throw new Error("Invalid MP4 output");
      const data = await ffmpeg.readFile("output.mp4");
      if (typeof data === "string" || data.length === 0)
        throw new Error("Encoder returned no video");
      // Worker transfers a normal ArrayBuffer. Blob takes the bytes without an extra Uint8Array copy.
      const blob = new Blob([data as Uint8Array<ArrayBuffer>], {
        type: "video/mp4",
      });
      return {
        id: crypto.randomUUID(),
        name: options.outputName,
        range: options.range,
        alignedRange: range,
        outputDuration: duration,
        cutStrategy: fast ? "fast" : "precision",
        blob,
        mimeType: "video/mp4",
      };
    } catch (error) {
      this.stop(); // A failed source/probe must never leave a partially cached source.
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      throw error;
    } finally {
      this.activeDuration = undefined;
      signal?.removeEventListener("abort", this.stop);
      if (ffmpeg.loaded) await ffmpeg.deleteFile("output.mp4").catch(() => {});
      this.busy = false;
    }
  }

  async releaseSource(): Promise<void> {
    const ffmpeg = this.ffmpeg;
    if (ffmpeg?.loaded && this.source) {
      if (this.sourceAccess === "workerfs") {
        await ffmpeg.unmount("/source");
        await ffmpeg.deleteDir("/source");
      } else await ffmpeg.deleteFile(this.input);
    }
    this.source = undefined;
    this.info = undefined;
    this.sourceAccess = undefined;
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.stop();
  }
}
