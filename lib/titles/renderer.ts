import { FFmpegTransport } from "../video/ffmpeg-transport";
import { WorkerGuard } from "../video/worker-guard";
import type { FFmpegWorker } from "../video/ffmpeg-browser";
import type {
  TitleProject,
  TitlesRenderer,
  TitleRenderProgress,
} from "./model";
import { parseTitleProject, renderBudget } from "./document";
import { drawTitleScene, requiredCreditSpeed } from "./raster";
import {
  frameSchedule,
  frameEncodeArgs,
  titleMuxArgs,
  type SceneAudio,
} from "./commands";

function waitMedia(
  element: HTMLImageElement | HTMLVideoElement,
  event: string,
  signal: AbortSignal,
  action: () => void,
) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      element.removeEventListener(event, ready);
      element.removeEventListener("error", failed);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const ready = () => finish(),
      failed = () =>
        finish(
          Error(
            "Background decode failed. Reconnect a browser-playable local file; no background was omitted.",
          ),
        ),
      abort = () => finish(new DOMException("Cancelled", "AbortError")),
      timer = setTimeout(
        () =>
          finish(
            Error(
              "Background frame decoding stalled for 20 seconds. Keep this tab foregrounded, reconnect the file and retry.",
            ),
          ),
        20000,
      );
    element.addEventListener(event, ready, { once: true });
    element.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    action();
  });
}
/** Bounded PNG batches; one decoded frame, one reused canvas and one cached-core worker. */
export class BrowserTitlesRenderer implements TitlesRenderer {
  private worker?: FFmpegWorker;
  private busy = false;
  private guard = new WorkerGuard();
  private log = "";
  private lastTime = -1;
  private stop = () => {
    this.guard.cancel();
    this.worker?.terminate();
    this.worker = undefined;
  };
  dispose() {
    this.stop();
  }
  async render(
    input: TitleProject,
    assets: ReadonlyMap<string, File>,
    signal: AbortSignal,
    onProgress: (p: TitleRenderProgress) => void,
  ): Promise<Blob> {
    if (this.busy) throw Error("A title render is already active");
    const project = parseTitleProject(input),
      budget = renderBudget(project),
      schedule = frameSchedule(project);
    signal.throwIfAborted();
    if (
      [...assets.values()].reduce((sum, file) => sum + file.size, 0) >
      256 * 1048576
    )
      throw Error("Local background files exceed the combined 256 MiB budget.");
    this.busy = true;
    let worker = this.worker,
      done = 0;
    const paths = new Set<string>(),
      elements = new Map<string, HTMLImageElement | HTMLVideoElement>(),
      urls: string[] = [],
      mounted: string[] = [];
    const canvas = document.createElement("canvas");
    canvas.width = budget.width;
    canvas.height = budget.height;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const report = (stage: string, fraction?: number) =>
      onProgress({
        stage,
        fraction,
        completedFrames: done,
        totalFrames: budget.frames,
      });
    const call = <T>(op: () => Promise<T>, stage: string) =>
      this.guard.run(op, stage, this.stop);
    const exec = async (args: string[], stage: string) => {
      this.lastTime = -1;
      const code = await call(() => worker!.exec(args), stage);
      signal.throwIfAborted();
      if (code !== 0)
        throw Error(
          `${stage} failed (FFmpeg ${code}). ${this.log.slice(-1200)} No partial output was accepted.`,
        );
    };
    signal.addEventListener("abort", this.stop, { once: true });
    try {
      await document.fonts.ready;
      signal.throwIfAborted();
      for (const item of schedule)
        for (const t of item.scene.text)
          if (
            t.entrance === "credit-roll" &&
            t.creditSpeed <
              requiredCreditSpeed(ctx, t, project.ratio, project.output.fps)
          )
            throw Error(
              `Credits in “${item.scene.name}” end before the final line clears the canvas. Use “Fit complete credit roll” in Animation, increase speed or extend the text interval.`,
            );
      report("Preparing local backgrounds");
      for (const item of schedule) {
        const bg = item.scene.background;
        if (!["image", "video"].includes(bg.kind)) continue;
        if (!bg.assetId || !assets.has(bg.assetId))
          throw Error(
            `Reconnect the ${bg.kind} for “${item.scene.name}” before rendering.`,
          );
        if (elements.has(bg.assetId)) continue;
      }
      if (!worker?.loaded) {
        worker = new FFmpegTransport((startup) =>
          onProgress({
            stage: startup.label || startup.phase,
            startup,
            completedFrames: done,
            totalFrames: budget.frames,
          }),
        );
        this.worker = worker;
        worker.on("log", ({ message }) => {
          this.log = (this.log + "\n" + message).slice(-4096);
        });
        worker.on("progress", ({ time }) => {
          if (time > this.lastTime) {
            this.lastTime = time;
            this.guard.progress();
          }
        });
        try {
          await worker.load({ coreURL: "", wasmURL: "" });
        } catch (startupError) {
          // A failed startup terminates its worker. Retry only immediate network/
          // worker failures; never repeat a lengthy stalled model/asset download.
          const message = startupError instanceof Error ? startupError.message : String(startupError);
          if (signal.aborted || /exceeded|stalled|timeout|memory|compilation/i.test(message)) {
            throw new Error("Cinematic Titles could not initialize FFmpeg: " + message);
          }
          report("Retrying FFmpeg startup once with a fresh worker");
          worker.terminate();
          signal.throwIfAborted();
          worker = new FFmpegTransport((startup) =>
            onProgress({
              stage: startup.label || startup.phase,
              startup,
              completedFrames: done,
              totalFrames: budget.frames,
            }),
          );
          this.worker = worker;
          worker.on("log", ({ message }) => {
            this.log = (this.log + "\n" + message).slice(-4096);
          });
          worker.on("progress", ({ time }) => {
            if (time > this.lastTime) {
              this.lastTime = time;
              this.guard.progress();
            }
          });
          try {
            await worker.load({ coreURL: "", wasmURL: "" });
          } catch (retryError) {
            throw new Error("Cinematic Titles FFmpeg startup failed twice. " +
              (retryError instanceof Error ? retryError.message : String(retryError)) +
              " Check whether the FFmpeg assets load in this Preview deployment.");
          }
        }
      }
      signal.throwIfAborted();
      const sourcePaths = new Map<string, string>(),
        audio: SceneAudio[] = [];
      for (const item of schedule) {
        const bg = item.scene.background,
          id = bg.assetId;
        if (bg.kind !== "video" || !id || sourcePaths.has(id)) continue;
        const dir = "/titles-source-" + sourcePaths.size;
        await call(() => worker!.createDir(dir), "Mount local background");
        await call(
          () =>
            worker!.mount(
              "WORKERFS",
              { files: [new File([assets.get(id)!], "background.bin")] },
              dir,
            ),
          "Mount local background",
        );
        mounted.push(dir);
        sourcePaths.set(id, dir + "/background.bin");
      }
      const audioInfo = new Map<
        string,
        { hasAudio: boolean; offset: number; sourceDuration: number }
      >();
      for (const item of schedule) {
        const bg = item.scene.background,
          path = bg.assetId ? sourcePaths.get(bg.assetId) : undefined;
        let hasAudio = false,
          offset = 0;
        if (path && (bg.volume ?? 0) > 0 && !audioInfo.has(path)) {
          const probe = "titles-audio.json";
          paths.add(probe);
          const exit = await call(
            () =>
              worker!.ffprobe([
                "-v",
                "error",
                "-read_intervals",
                "%",
                "-select_streams",
                "a:0",
                "-show_entries",
                "packet=:frame=:stream=codec_name,start_time:format=start_time,duration",
                "-of",
                "json",
                "-o",
                probe,
                path,
              ]),
            "Inspect background audio",
          );
          if (exit !== 0 && exit !== -1)
            throw Error(
              "Cannot inspect background audio; mute this scene or reconnect the source.",
            );
          const bytes = await call(
              () => worker!.readFile(probe),
              "Read background audio inspection",
            ),
            data = JSON.parse(
              typeof bytes === "string"
                ? bytes
                : new TextDecoder().decode(bytes),
            );
          if (!Array.isArray(data.streams))
            throw Error(
              "Background audio inspection returned incomplete metadata. Reconnect or mute this scene.",
            );
          hasAudio = data.streams.length > 0;
          const audioStart = Number(data.streams[0]?.start_time ?? 0),
            containerStart = Number(data.format?.start_time ?? 0);
          if (!Number.isFinite(audioStart) || !Number.isFinite(containerStart))
            throw Error(
              "Background audio timestamps could not be verified. Reconnect or mute this scene.",
            );
          offset = Math.max(0, audioStart - containerStart);
          audioInfo.set(path, {
            hasAudio,
            offset,
            sourceDuration: Number(data.format?.duration),
          });
        }
        if (path && audioInfo.has(path)) {
          ({ hasAudio, offset } = audioInfo.get(path)!);
        }
        audio.push({
          offset,
          sourceDuration: path
            ? audioInfo.get(path)?.sourceDuration
            : undefined,
          path,
          hasAudio,
          loop: bg.loop,
          volume: bg.volume ?? 0,
          duration: item.duration,
        });
      }
      const chunks: string[] = [];
      let retainedBytes = 0;
      // Bound uncompressed frame working set at 16 MiB, and at most three seconds per batch; JPEG intermediates reduce worker memory pressure.
      const batch = Math.max(
        1,
        Math.min(
          project.output.fps * 3,
          Math.floor((48 * 1048576) / (budget.width * budget.height * 4)),
        ),
      );
      let activeId: string | undefined;
      for (const item of schedule) {
        const bg = item.scene.background,
          id = ["image", "video"].includes(bg.kind) ? bg.assetId : undefined;
        if (id !== activeId) {
          for (const element of elements.values()) {
            if (element instanceof HTMLVideoElement) element.pause();
            element.removeAttribute("src");
            if (element instanceof HTMLVideoElement) element.load();
          }
          elements.clear();
          urls.forEach((u) => URL.revokeObjectURL(u));
          urls.length = 0;
          activeId = id;
          if (id) {
            const url = URL.createObjectURL(assets.get(id)!);
            urls.push(url);
            const element =
              bg.kind === "image"
                ? new Image()
                : document.createElement("video");
            if (element instanceof HTMLVideoElement) {
              element.muted = true;
              element.preload = "auto";
              element.playsInline = true;
            }
            elements.set(id, element);
            await waitMedia(
              element,
              bg.kind === "image" ? "load" : "loadeddata",
              signal,
              () => {
                element.src = url;
              },
            );
          }
        }
        const active = id ? elements.get(id) : undefined;
        if (active instanceof HTMLVideoElement)
          audio[schedule.indexOf(item)].sourceDuration = active.duration;
        for (let first = 0; first < item.frames; first += batch) {
          const count = Math.min(batch, item.frames - first),
            framePaths: string[] = [];
          for (let f = 0; f < count; f++) {
            signal.throwIfAborted();
            const time = Math.max(
                0,
                (item.first + first + f) / project.output.fps - item.start,
              ),
              bg = item.scene.background,
              element = bg.assetId ? elements.get(bg.assetId) : undefined;
            report(
              `Drawing scene ${schedule.indexOf(item) + 1} of ${schedule.length} · frame ${done + f + 1} of ${budget.frames}`,
              done / budget.frames,
            );
            if (element instanceof HTMLVideoElement) {
              const target = bg.loop
                ? time % element.duration
                : Math.min(
                    time,
                    Math.max(0, element.duration - 1 / project.output.fps),
                  );
              if (Math.abs(element.currentTime - target) > 0.0001)
                await waitMedia(element, "seeked", signal, () => {
                  element.currentTime = target;
                });
            }
            drawTitleScene(
              ctx,
              item.scene,
              time,
              budget.width,
              budget.height,
              element,
            );
            const blob = await new Promise<Blob>((resolve, reject) =>
              canvas.toBlob(
                (b) =>
                  b ? resolve(b) : reject(Error("Frame rasterization failed")),
                "image/jpeg",
                0.9,
              ),
            );
            signal.throwIfAborted();
            const path = `frame-${String(f).padStart(3, "0")}.jpg`;
            paths.add(path);
            framePaths.push(path);
            const bytes = new Uint8Array(await blob.arrayBuffer());
            await call(
              () => worker!.writeFile(path, bytes),
              "Transfer rendered frame",
            );
          }
          const path = `titles-chunk-${chunks.length}.mp4`;
          paths.add(path);
          report(
            `Encoding frames ${done + 1}–${done + count} of ${budget.frames}`,
            done / budget.frames,
          );
          await exec(
            frameEncodeArgs(project.output.fps, count, path),
            "Encode title frames",
          );
          const encoded = await call(
            () => worker!.readFile(path),
            "Check title batch size",
          );
          retainedBytes += encoded.length;
          if (retainedBytes > 96 * 1048576)
            throw Error(
              "Rendered batches exceed the 96 MiB local output budget. Shorten the sequence or select a lower output size.",
            );
          chunks.push(path);
          done += count;
          report("Encoded title frames", done / budget.frames);
          for (const frame of framePaths) {
            await call(
              () => worker!.deleteFile(frame),
              "Release rendered frame",
            );
            paths.delete(frame);
          }
        }
      }
      report("Joining scenes and encoding background audio");
      paths.add("chunks.txt");
      await call(
        () =>
          worker!.writeFile(
            "chunks.txt",
            new TextEncoder().encode(
              chunks.map((path) => `file '${path}'`).join("\n"),
            ),
          ),
        "Prepare scene joins",
      );
      paths.add("titles.mp4");
      await exec(
        titleMuxArgs(audio, budget.duration),
        "Finalize H.264/AAC MP4",
      );
      report("Validating exported MP4");
      paths.add("titles-output.json");
      const exit = await call(
        () =>
          worker!.ffprobe([
            "-v",
            "error",
            "-read_intervals",
            "%",
            "-select_streams",
            "",
            "-show_entries",
            "packet=:frame=:stream=codec_name,codec_type,width,height:format=duration",
            "-of",
            "json",
            "-o",
            "titles-output.json",
            "titles.mp4",
          ]),
        "Validate exported MP4",
      );
      if (exit !== 0 && exit !== -1)
        throw Error("Exported MP4 inspection failed. " + this.log.slice(-800));
      const infoBytes = await call(
          () => worker!.readFile("titles-output.json"),
          "Read MP4 validation",
        ),
        info = JSON.parse(
          typeof infoBytes === "string"
            ? infoBytes
            : new TextDecoder().decode(infoBytes),
        ),
        streams = info.streams as {
          codec_name: string;
          codec_type: string;
          width?: number;
          height?: number;
        }[],
        v = streams?.find((s) => s.codec_type === "video"),
        a = streams?.find((s) => s.codec_type === "audio");
      if (
        v?.codec_name !== "h264" ||
        a?.codec_name !== "aac" ||
        v.width !== budget.width ||
        v.height !== budget.height ||
        Math.abs(Number(info.format?.duration) - budget.duration) > 0.15
      )
        throw Error(
          "MP4 codec, dimensions or duration validation failed. No output was accepted.",
        );
      const data = await call(
        () => worker!.readFile("titles.mp4"),
        "Read validated MP4",
      );
      if (
        typeof data === "string" ||
        !data.length ||
        data.length > 96 * 1048576
      )
        throw Error("Invalid or oversized title output");
      signal.throwIfAborted();
      const blob = new Blob([new Uint8Array(data)], { type: "video/mp4" });
      report("Completed", 1);
      return blob;
    } catch (error) {
      this.stop();
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      throw error;
    } finally {
      signal.removeEventListener("abort", this.stop);
      for (const e of elements.values()) {
        if (e instanceof HTMLVideoElement) e.pause();
        e.removeAttribute("src");
        if (e instanceof HTMLVideoElement) e.load();
      }
      urls.forEach((u) => URL.revokeObjectURL(u));
      canvas.width = canvas.height = 1;
      if (worker && worker === this.worker) {
        try {
          for (const path of paths)
            await call(
              () => worker!.deleteFile(path),
              "Clean title temporary files",
            );
          for (const dir of mounted) {
            await call(() => worker!.unmount(dir), "Release local background");
            await call(
              () => worker!.deleteDir(dir),
              "Release source directory",
            );
          }
        } catch {
          this.stop();
        }
      }
      this.busy = false;
    }
  }
}
