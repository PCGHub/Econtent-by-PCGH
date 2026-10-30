import type {CompositionAssets} from "../composition/assets";
import { compositionArgs, type CompositionInput, type TrackInputs } from "../composition/command";
import { parseComposition, geometry, type Composition } from "../composition/model";
import { FFmpegTransport } from "./ffmpeg-transport";
import {
  parseCodecs,
  parseMuxers,
  conversionCapability,
  type CoreCapabilities,
} from "./capabilities";
import { WorkerGuard, WorkerUnresponsiveError } from "./worker-guard";
import type { VideoProcessingEngine } from "./engine";
import type {
  ProcessOptions,
  ProcessedClip,
  ProcessingProgress,
  ProcessingStatus,
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
import {
  defaultStrategy,
  frameRate,
  deviceProfile,
  needsPrecisionConfirmation,
  type SourceInspection,
} from "./workload";

// Keep worker-only ambient declarations outside the app TypeScript program.
export interface FFmpegWorker {
  loaded: boolean;
  readonly managedStartup?: boolean;
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
  audioTimelineStart?: number;
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
  private capabilityLog?: string[];
  private capabilities?: CoreCapabilities;
  private onProgress: (progress: ProcessingProgress) => void = () => {};
  private stage: ProcessingStatus = "idle";
  private notify = (progress: ProcessingProgress) => {
    this.stage = progress.status;
    this.onProgress(progress);
  };
  sourceAccess?: "workerfs" | "memfs";
  private factory?: () => Promise<FFmpegWorker>;
  private guard: WorkerGuard;
  constructor(factory?: () => Promise<FFmpegWorker>, responseTimeoutMs?: number) {
    this.factory = factory;
    this.guard = new WorkerGuard(responseTimeoutMs);
  }

  private emitTime = (time: number) => {
    if (!this.activeDuration) return;
    const fraction = mediaFraction(time, this.activeDuration);
    if (fraction === undefined) {
      this.notify({ status: "processing" });
      return;
    }
    if (fraction < this.lastFraction) return;
    // Repeated timestamps/log messages are not evidence of advancing work.
    if (fraction > this.lastFraction) this.guard.progress();
    this.lastFraction = fraction;
    this.notify({ status: "processing", fraction });
  };
  private stop = () => {
    this.guard.cancel();
    this.ffmpeg?.terminate();
    this.ffmpeg = undefined;
    this.source = undefined;
    this.info = undefined;
    this.sourceAccess = undefined;
    this.capabilities = undefined;
    this.capabilityLog = undefined;
    this.activeDuration = undefined;
  };

  async initialize(
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.disposed) throw new Error("Engine disposed");
    signal?.throwIfAborted();
    this.onProgress = onProgress ?? (() => {});
    if (this.ffmpeg?.loaded) return;
    // Native worker loss can happen between jobs. A replacement has no source mount/cache.
    if (this.ffmpeg) this.stop();
    this.notify({ status: "loading", message: "Loading FFmpeg…" });
    signal?.addEventListener("abort", this.stop, { once: true });
    try {
      let ffmpeg: FFmpegWorker;
      if (this.factory) ffmpeg = await this.factory();
      else {
        ffmpeg = new FFmpegTransport(startup => this.notify({
          status: "loading", operation: startup.label, startup,
          message: "FFmpeg startup: " + startup.label,
        }));
      }
      if (this.disposed || signal?.aborted) {
        ffmpeg.terminate();
        throw new DOMException("Cancelled", "AbortError");
      }
      const guard = this.guard;
      // The upstream wrapper does not reject pending requests on Worker.onerror.
      // Guard filesystem/probe/load requests too, not just encoding commands.
      ffmpeg = new Proxy(ffmpeg, {
        get: (target, property) => {
          const value = Reflect.get(target, property, target);
          if (typeof value !== "function") return value;
          if (property === "on" || property === "terminate" || (property === "load" && target.managedStartup))
            return value.bind(target);
          const stage = property === "load" ? "Loading FFmpeg"
            : property === "ffprobe" ? "Inspecting media"
            : property === "exec" ? "Processing media"
            : "Preparing or reading media";
          return (...args: unknown[]) => {
            const command = Array.isArray(args[0]) ? args[0] as string[] : [];
            const operation = property === "load" ? "Load FFmpeg worker and WASM"
              : property === "mount" ? "Mount source read-only (WORKERFS)"
              : property === "writeFile" ? "Copy source once into memory (MEMFS)"
              : property === "ffprobe" ? command.includes("source.json") ? "Inspect source metadata"
                : command.includes("keyframes.txt") ? "Read keyframes in selected window" : "Verify exported MP4 metadata"
              : property === "exec" ? command.includes("output.mp4")
                ? command.includes("libx264") ? "Encode selected range to H.264/AAC" : command.includes("aac") ? "Copy video and convert selected audio" : "Copy selected streams to MP4"
                : "Check loaded codec capabilities"
              : property === "readFile" && args[0] === "output.mp4" ? "Read verified MP4 output bytes"
              : undefined;
            if (operation) this.notify({ status: this.stage, operation });
            return guard.run(async () => Reflect.apply(value, target, args), stage, this.stop);
          };
        },
      });
      this.ffmpeg = ffmpeg;
      ffmpeg.on("progress", ({ time }) => this.emitTime(time));
      ffmpeg.on("log", ({ message }) => {
        if (this.capabilityLog && this.capabilityLog.length < 5000)
          this.capabilityLog.push(message.slice(0, 1024));
        this.probeLog = (this.probeLog + "\n" + message).slice(-8192);
        const match = /^out_time_us=(\d+)$/.exec(message.trim());
        if (match) this.emitTime(Number(match[1]));
      });
      await ffmpeg.load({
        coreURL: `${location.origin}/ffmpeg/core/ffmpeg-core.js`,
        wasmURL: `${location.origin}/ffmpeg/core/ffmpeg-core.wasm`,
      });
      signal?.throwIfAborted();
      this.notify({
        status: "preparing",
        message: "Checking the loaded FFmpeg decoder and export capabilities…",
      });
      const inventory: Record<string, string> = {};
      for (const kind of ["decoders", "encoders", "muxers"]) {
        this.capabilityLog = [];
        const exit = await ffmpeg.exec(["-hide_banner", "-" + kind]);
        signal?.throwIfAborted();
        inventory[kind] = this.capabilityLog.join("\n");
        if (exit !== 0)
          throw new Error(
            "Cannot verify the loaded FFmpeg capabilities. Reload the editor.",
          );
      }
      this.capabilityLog = undefined;
      this.capabilities = {
        decoders: parseCodecs(inventory.decoders),
        encoders: Object.values(parseCodecs(inventory.encoders)).flat(),
        muxers: parseMuxers(inventory.muxers),
      };
      if (!this.capabilities.muxers.includes("mp4"))
        throw new Error("This FFmpeg core cannot export MP4.");
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
        "-read_intervals",
        "%",
        "-select_streams",
        "",
        ...args.map((arg, index) =>
          args[index - 1] === "-show_entries" ? `packet=:frame=:${arg}` : arg,
        ),
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
      if (error instanceof WorkerUnresponsiveError) throw error;
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
        audioTimelineStart: _audioStart,
        ...info
      } = this.info!;
      void _keys;
      void _coverage;
      void _audioStart;
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
        `${range.start + (this.info?.timelineStart ?? 0)}%${range.end + (this.info?.timelineStart ?? 0)}`,
        "-select_streams",
        "v:0",
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
          const time = Number(match?.[1]) - (this.info?.timelineStart ?? 0);
          if (Number.isFinite(time) && time >= -1e-6)
            values.add(Math.max(0, time));
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
    convertAudio = false,
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
      } catch (error) {
        if (error instanceof WorkerUnresponsiveError || !ffmpeg.loaded) throw error;
        await ffmpeg.unmount("/source").catch(() => {});
        await ffmpeg.deleteDir("/source").catch(() => {});
        this.input = "input";
        this.sourceAccess = "memfs";
        if (
          source.size > 128 * 1048576 &&
          typeof navigator !== "undefined" &&
          needsPrecisionConfirmation(deviceProfile(navigator))
        )
          throw new Error(
            "Read-only source mounting is unavailable. Copying this large source may exceed mobile memory; use a smaller file or another browser/device. No conversion was started.",
          );
        this.notify({
          status: "preparing",
          message:
            "Read-only mounting is unavailable; copying the source once into browser memory…",
        });
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
          "format=format_name,duration:stream=codec_type,codec_name,codec_tag_string,width,height,avg_frame_rate,pix_fmt,color_transfer,profile,start_time,has_b_frames:stream_disposition=attached_pic",
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
      const conversion = conversionCapability(
        data.streams ?? [],
        this.capabilities!,
      );
      conversion.audioOnly =
        conversion.audioOnly &&
        fastCompatibility(
          container,
          (data.streams ?? []).map((stream) =>
            stream.codec_type === "audio"
              ? { ...stream, codec_name: "aac" }
              : stream,
          ),
        ).compatible;
      this.info = {
        duration,
        sizeBytes: source.size,
        width: video.width ?? 0,
        height: video.height ?? 0,
        frameRate: frameRate(video.avg_frame_rate),
        videoCodec: video.codec_name ?? "unknown",
        audioCodec: audio ? (audio.codec_name ?? "unknown") : undefined,
        container,
        pixelFormat: video.pix_fmt,
        timelineStart: Number.isFinite(Number(video.start_time))
          ? Number(video.start_time)
          : 0,
        audioTimelineStart:
          audio?.start_time !== undefined &&
          Number.isFinite(Number(audio.start_time))
            ? Number(audio.start_time)
            : undefined,
        conversion,
        ...compatibility,
      };
    }
    if (fast) {
      if (
        !this.info?.compatible &&
        !(
          convertAudio &&
          this.info?.conversion?.audioOnly &&
          this.info.conversion.available
        )
      )
        throw new Error(
          `${this.info?.incompatibility ?? "Fast Cut is unavailable."} ${this.info?.conversion?.available ? "Choose Precision Cut explicitly, or use an H.264/AAC MP4." : (this.info?.conversion?.reason ?? "No verified conversion path is available.")} No encoding fallback was started.`,
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
      await this.prepare(source, fast, options.range, options.convertAudio);
      if (!fast && !this.info!.conversion?.available)
        throw new Error(
          this.info!.conversion?.reason ??
            "Conversion capability could not be verified.",
        );
      if (options.convertAudio && (!fast || !this.info!.conversion?.audioOnly))
        throw new Error(
          "Audio-only conversion is unavailable for this source or method.",
        );
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
          ? options.convertAudio
            ? "Copying H.264 video and converting audio to AAC at source keyframes…"
            : "Copying streams at source keyframes…"
          : "Encoding precision cut…",
      });
      const result = await ffmpeg.exec(
        (() => {
          const args = encodingArgs(
            { ...options, range },
            this.input,
            this.info!.timelineStart,
            !fast && this.info!.container === "mpeg" ? 30 : 0,
          );
          // Select only verified software decoders. Input-side seek bounds decode work to the selected GOP/range.
          const decoderArgs = fast
            ? options.convertAudio
              ? ["-c:a", this.info!.conversion!.audioDecoder!]
              : []
            : [
                "-c:v",
                this.info!.conversion!.videoDecoder!,
                ...(this.info!.audioCodec
                  ? ["-c:a", this.info!.conversion!.audioDecoder!]
                  : []),
              ];
          args.splice(args.indexOf("-i"), 0, ...decoderArgs);
          return args;
        })(),
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
          "format=duration,size:stream=codec_name,codec_type,pix_fmt,width,height,start_time,duration",
          "output.mp4",
        ],
        "output.json",
      )) as {
        format?: { duration?: string; size?: string };
        streams?: (ProbeStream & { duration?: string })[];
      };
      const duration = Number(info.format?.duration);
      if (
        options.maxOutputBytes !== undefined &&
        Number(info.format?.size) >= options.maxOutputBytes
      )
        throw new Error(
          "Output memory safety limit reached; the partial export is not reported as completed. Choose a shorter range or compression.",
        );
      if (
        !(duration > 0) ||
        !Number.isFinite(duration) ||
        !info.streams?.some(
          (s) => s.codec_type === "video" && s.codec_name === "h264",
        ) ||
        (this.info!.audioCodec &&
          !info.streams?.some(
            (s) => s.codec_type === "audio" && s.codec_name === "aac",
          ))
      )
        throw new Error("Invalid MP4 output");
      const outputVideo = info.streams?.find((s) => s.codec_type === "video");
      const outputAudio = info.streams?.find((s) => s.codec_type === "audio");
      if (
        info.streams?.filter((s) => s.codec_type === "video").length !== 1 ||
        info.streams?.filter((s) => s.codec_type === "audio").length !==
          (this.info!.audioCodec ? 1 : 0) ||
        !outputVideo?.width ||
        !outputVideo?.height ||
        !["yuv420p", "yuvj420p"].includes(outputVideo.pix_fmt ?? "")
      )
        throw new Error(
          "Invalid MP4 output: unexpected tracks, dimensions or pixel format.",
        );
      if (
        !fast &&
        Math.abs(duration - (range.end - range.start)) >
          Math.max(0.25, 2 / (this.info!.frameRate ?? 24))
      )
        throw new Error(
          "MP4 duration validation failed. No successful export is reported; try a shorter range or repair the source timestamps.",
        );
      if (
        outputAudio &&
        (!fast || options.convertAudio) &&
        this.info!.audioTimelineStart !== undefined
      ) {
        const offset =
          Number(outputAudio.start_time) - Number(outputVideo.start_time);
        const expected = Math.max(
          0,
          this.info!.audioTimelineStart -
            ((this.info!.timelineStart ?? 0) + range.start),
        );
        if (
          !Number.isFinite(offset) ||
          Math.abs(offset - expected) >
            Math.max(0.25, 2 / (this.info!.frameRate ?? 24))
        )
          throw new Error(
            "MP4 audio/video timestamp validation failed. Re-export the source or explicitly use Precision Cut; no automatic fallback was started.",
          );
      }
      const data = await ffmpeg.readFile("output.mp4");
      if (typeof data === "string" || data.length === 0)
        throw new Error("Encoder returned no video");
      if (
        options.maxOutputBytes !== undefined &&
        data.length >= options.maxOutputBytes
      )
        throw new Error(
          "Output memory safety limit reached; the partial export is not reported as completed. Choose a shorter range or compression.",
        );
      // Worker transfers a normal ArrayBuffer. Blob takes the bytes without an extra Uint8Array copy.
      const blob = new Blob([data as Uint8Array<ArrayBuffer>], {
        type: "video/mp4",
      });
      return {
        id: crypto.randomUUID(),
        name: options.outputName,
        range: options.range,
        alignedRange: range,
        audioConverted: !!options.convertAudio,
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

  /** Composition always encodes; shares the same verified runtime/cache and main source mount. */
  async compose(source: File, layer: File, image: boolean, raw: Composition, maxBytes: number, signal?: AbortSignal, assets:CompositionAssets={text:[],audio:[]}): Promise<ProcessedClip> {
    if (this.busy) throw new Error("Another operation is processing");
    if (!this.ffmpeg?.loaded || this.disposed) throw new Error("Initialize the engine first");
    const settings = parseComposition(raw), ffmpeg=this.ffmpeg;
    signal?.throwIfAborted(); this.busy=true;
    signal?.addEventListener("abort",this.stop,{once:true});
    let mounted=false, copied=false, tracksMounted=false;const trackCopies:string[]=[];
    try {
      if(source.size+layer.size+assets.audio.reduce((n,a)=>n+a.file.size,0)>256*1048576) throw new Error("Combined composition sources exceed the 256 MiB safety limit");
      await this.prepare(source,false);
      if(!this.info!.conversion?.available) throw new Error(this.info!.conversion?.reason ?? "Source conversion unavailable");
      this.notify({status:"preparing",operation:"Mount and inspect secondary layer",message:"Inspecting local composition media…"});
      let path="/overlay/input";
      try { await ffmpeg.createDir("/overlay"); if(!await ffmpeg.mount("WORKERFS",{files:[new File([layer],"input")]},"/overlay"))throw new Error("WORKERFS unavailable"); mounted=true; }
      catch(error){
        if(!ffmpeg.loaded||error instanceof WorkerUnresponsiveError)throw error;
        await ffmpeg.unmount("/overlay").catch(()=>{});await ffmpeg.deleteDir("/overlay").catch(()=>{});
        if(layer.size>64*1048576)throw new Error("Read-only layer mounting unavailable; use a smaller layer to avoid an unsafe memory copy");
        path="overlay-input";copied=true;await ffmpeg.writeFile(path,new Uint8Array(await layer.arrayBuffer()));
      }
      const data=await this.probe(["-show_entries","format=duration:stream=codec_type,codec_name,codec_tag_string,width,height,pix_fmt,color_transfer,start_time:stream_disposition=attached_pic",path],"layer.json") as {format?:{duration?:string};streams?:ProbeStream[]};
      const video=data.streams?.find(s=>s.codec_type==="video"), audio=data.streams?.find(s=>s.codec_type==="audio");
      if(!video?.width||!video?.height||video.width*video.height>16777216)throw new Error("Invalid or oversized layer dimensions");
      const capability=conversionCapability(data.streams??[],this.capabilities!);
      if(!capability.available)throw new Error(capability.reason??"Secondary layer decoder unavailable");
      if(image&&!['png','mjpeg','webp'].includes(video.codec_name??''))throw new Error("Photo must decode as PNG, JPEG or WebP; renamed or animated formats are not accepted");
      const secondary:CompositionInput={duration:Number(data.format?.duration),hasAudio:!!audio,videoDecoder:capability.videoDecoder,audioDecoder:capability.audioDecoder,timelineStart:Number(video.start_time)||0,audioTimelineStart:audio?.start_time===undefined?undefined:Number(audio.start_time)};
      const main:CompositionInput={...this.info!,hasAudio:!!this.info!.audioCodec,videoDecoder:this.info!.conversion!.videoDecoder,audioDecoder:this.info!.conversion!.audioDecoder};
      const extra:TrackInputs={text:[],audio:[]};
      const textClips=settings.tracks?.text??[], musicClips=settings.tracks?.audio??[];
      if(textClips.length!==assets.text.length)throw new Error("Text raster assets do not match the composition");
      const files=[...assets.text.map((t,i)=>new File([t.file],`text-${i}.png`)),...assets.audio.map((a,i)=>new File([a.file],`music-${i}`))];
      const locations=new Map<string,string>();
      if(files.length){
        this.notify({status:'preparing',operation:'Prepare timed text and audio',message:'Mounting timed tracks locally…'});
        try{await ffmpeg.createDir('/tracks');if(!await ffmpeg.mount('WORKERFS',{files},'/tracks'))throw Error('WORKERFS unavailable');tracksMounted=true;files.forEach(f=>locations.set(f.name,'/tracks/'+f.name));}
        catch(error){if(!ffmpeg.loaded||error instanceof WorkerUnresponsiveError)throw error;await ffmpeg.unmount('/tracks').catch(()=>{});await ffmpeg.deleteDir('/tracks').catch(()=>{});for(const f of files){signal?.throwIfAborted();if(f.size>32*1048576)throw Error('Track mounting unavailable; select an audio file under 32 MiB for the bounded copy fallback');const name='track-'+f.name;trackCopies.push(name);locations.set(f.name,name);await ffmpeg.writeFile(name,new Uint8Array(await f.arrayBuffer()));}}
      }
      for(const [i,clip]of textClips.entries())extra.text.push({clip,...assets.text[i],path:locations.get(`text-${i}.png`)!});
      const inspected=new Map<string,CompositionInput>();
      for(const clip of musicClips){
        const i=assets.audio.findIndex(a=>a.id===clip.sourceId);if(i<0)throw Error('Reconnect the original music file before rendering');const path=locations.get(`music-${i}`)!;
        if(!inspected.has(clip.sourceId)){
          const metadata=await this.probe(['-show_entries','format=duration:stream=codec_type,codec_name',path],'music.json') as {format?:{duration?:string};streams?:ProbeStream[]};
          const audio=metadata.streams?.find(s=>s.codec_type==='audio'),duration=Number(metadata.format?.duration);
          const names=this.capabilities!.decoders[audio?.codec_name??''];const decoder=names?.includes(audio?.codec_name??'')?audio!.codec_name:names?.[0];
          if(!decoder||!Number.isFinite(duration)||duration<=0||!this.capabilities!.encoders.includes('aac'))throw Error('This loaded core cannot decode this audio file or encode it as AAC');
          inspected.set(clip.sourceId,{duration,hasAudio:true,audioDecoder:decoder});
        }
        extra.audio.push({clip,path,source:inspected.get(clip.sourceId)!});
      }
      const duration=settings.trimEnd-settings.trimStart, args=compositionArgs(settings,main,secondary,image,this.input,path,maxBytes,extra);
      signal?.throwIfAborted();this.activeDuration=duration;this.lastFraction=0;
      this.notify({status:"processing",operation:"Encode composition to H.264/AAC",message:"Encoding the selected composition range locally…"});
      if(await ffmpeg.exec(args)!==0)throw new Error("Composition encoding failed. Try a shorter selection or smaller explicit output size; no successful output was accepted.");
      this.activeDuration=undefined;signal?.throwIfAborted();
      this.notify({status:"finalizing",operation:"Validate composition MP4",message:"Validating composition duration, video and audio…"});
      const output=await this.probe(["-show_entries","format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt,start_time,duration","output.mp4"],"composition.json") as {format?:{duration?:string;size?:string};streams?:(ProbeStream&{duration?:string})[]};
      const v=output.streams?.find(s=>s.codec_type==='video'),a=output.streams?.find(s=>s.codec_type==='audio'),g=geometry(settings);
      const wantsAudio=!!(((settings.audio==='main'||settings.audio==='mix')&&main.hasAudio&&!settings.tracks?.muteMain)||((settings.audio==='secondary'||settings.audio==='mix')&&secondary.hasAudio&&!settings.tracks?.muteSecondary)||musicClips.some(c=>!c.muted));
      if(v?.codec_name!=='h264'||v.width!==g.w||v.height!==g.h||v.pix_fmt!=='yuv420p'||output.streams?.length!==(wantsAudio?2:1)||(wantsAudio&&a?.codec_name!=='aac')||Math.abs(Number(output.format?.duration)-duration)>.15||!Number.isFinite(Number(output.format?.duration))||Number(output.format?.size)>=maxBytes)throw new Error("Composition output validation failed; no partial MP4 was accepted");
      if(a&&Math.abs(Number(a.start_time)-Number(v.start_time))>.15)throw new Error("Composition audio/video start timestamps do not match");
      const bytes=await ffmpeg.readFile('output.mp4');if(typeof bytes==='string'||!bytes.length||bytes.length>=maxBytes)throw new Error("Invalid or oversized composition output");
      return {id:crypto.randomUUID(),name:'econtent-composition.mp4',range:{start:settings.trimStart,end:settings.trimEnd},blob:new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'video/mp4'}),mimeType:'video/mp4',cutStrategy:'precision',outputDuration:Number(output.format?.duration)};
    } catch(error){this.stop();if(signal?.aborted)throw new DOMException("Cancelled","AbortError");throw error;}
    finally{
      this.activeDuration=undefined;this.busy=false;signal?.removeEventListener("abort",this.stop);
      if(ffmpeg.loaded){if(tracksMounted){await ffmpeg.unmount('/tracks').catch(()=>{});await ffmpeg.deleteDir('/tracks').catch(()=>{});}for(const name of trackCopies)await ffmpeg.deleteFile(name).catch(()=>{});await ffmpeg.deleteFile('output.mp4').catch(()=>{});if(mounted){await ffmpeg.unmount('/overlay').catch(()=>{});await ffmpeg.deleteDir('/overlay').catch(()=>{});}if(copied)await ffmpeg.deleteFile('overlay-input').catch(()=>{});}
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
