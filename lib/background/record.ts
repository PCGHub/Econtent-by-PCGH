import { Muxer, ArrayBufferTarget } from "webm-muxer";
import { deadline } from "./model";
import type { BackgroundRenderer } from "./renderer";
function aborted(signal: AbortSignal) {
  if (signal.aborted)
    throw Error(
      typeof signal.reason === "string"
        ? signal.reason
        : "Export cancelled. No partial output was saved.",
    );
}
function cancellable<T>(promise: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const stop = () =>
      reject(Error("Export cancelled. No partial output was saved."));
    if (signal.aborted) return stop();
    signal.addEventListener("abort", stop, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", stop));
  });
}
export class SourceAudio {
  async decode(file: File, signal: AbortSignal) {
    if (!window.OfflineAudioContext)
      throw Error(
        "Local audio decoding is unavailable. Choose an explicit silent export or another browser.",
      );
    aborted(signal);
    const bytes = await cancellable(file.arrayBuffer(), signal);
    aborted(signal);
    try {
      const context = new OfflineAudioContext(2, 1, 48000),
        audio = await cancellable(
          deadline(
            context.decodeAudioData(bytes),
            30000,
            "Local audio decoding timed out. Choose a shorter file or explicit silent export.",
          ),
          signal,
        );
      aborted(signal);
      if (audio.numberOfChannels > 2)
        throw Error(
          "Surround audio is unsupported; convert to stereo or choose silent export.",
        );
      return audio;
    } catch (e) {
      if (signal.aborted) throw e;
      throw Error(
        "The original audio could not be decoded locally. Choose an explicit silent export, or convert the source to H.264/AAC MP4 in Video Cutter. " +
          (e instanceof Error ? e.message : ""),
      );
    }
  }
}
async function seek(
  video: HTMLVideoElement,
  time: number,
  signal: AbortSignal,
) {
  if (Math.abs(video.currentTime - time) < 0.0001 && !video.seeking) return;
  let done: () => void = () => {},
    bad: () => void = () => {};
  try {
    await cancellable(
      deadline(
        new Promise<void>((resolve, reject) => {
          done = () => resolve();
          bad = () => reject(Error("Source video could not seek"));
          video.addEventListener("seeked", done, { once: true });
          video.addEventListener("error", bad, { once: true });
          video.currentTime = time;
        }),
        8000,
        "Source video seek timed out",
      ),
      signal,
    );
  } finally {
    video.removeEventListener("seeked", done);
    video.removeEventListener("error", bad);
  }
}
export interface RecordingJob {
  cancel: () => void;
  done: Promise<Blob>;
}
/** Encode one paired source/mask frame at a time using SOURCE timestamps.
 * Wall-clock MediaRecorder stretches/stutters under inference load; never use its
 * clock as a substitute for media timestamps. No fallback to that path is silent.
 */
export function recordBackground(
  video: HTMLVideoElement,
  renderer: BackgroundRenderer,
  audio: SourceAudio,
  includeAudio: boolean,
  progress: (seconds: number) => void,
  file: File,
  fps: 12 | 24,
): RecordingJob {
  const controller = new AbortController(),
    signal = controller.signal;
  const hidden = () => {
    if (document.hidden)
      controller.abort(
        "Export stopped because this tab became hidden. Keep it visible and retry.",
      );
  };
  document.addEventListener("visibilitychange", hidden);
  const done = (async () => {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180.05)
      throw Error("WebM export supports source videos up to 3 minutes.");
    if (file.size > 64 * 1048576)
      throw Error(
        "Export is limited to 64 MB source files to bound local audio-decoding memory. Trim/compress in Video Cutter first.",
      );
    if (
      typeof VideoEncoder === "undefined" ||
      typeof VideoFrame === "undefined"
    )
      throw Error(
        "This browser lacks WebCodecs video encoding. Preview remains available; export needs current Chrome or Edge with WebCodecs.",
      );
    if (
      includeAudio &&
      (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined")
    )
      throw Error(
        "This browser lacks WebCodecs audio encoding. Choose an explicit silent export or current Chrome.",
      );
    const config: VideoEncoderConfig = {
      codec: "vp8",
      width: renderer.output.width,
      height: renderer.output.height,
      bitrate: 2500000,
      framerate: fps,
    };
    if (!(await VideoEncoder.isConfigSupported(config)).supported)
      throw Error(
        "VP8 WebM encoding is unavailable at this resolution. Try another current browser.",
      );
    aborted(signal);
    let decoded: AudioBuffer | null = includeAudio
      ? await audio.decode(file, signal)
      : null;
    const audioConfig: AudioEncoderConfig | undefined = decoded
      ? {
          codec: "opus",
          sampleRate: decoded.sampleRate,
          numberOfChannels: decoded.numberOfChannels,
          bitrate: 128000,
        }
      : undefined;
    if (
      audioConfig &&
      !(await AudioEncoder.isConfigSupported(audioConfig)).supported
    )
      throw Error(
        "Opus encoding is unavailable. Choose an explicit silent export or another browser.",
      );
    aborted(signal);
    const target = new ArrayBufferTarget(),
      muxer = new Muxer({
        target,
        video: {
          codec: "V_VP8",
          width: config.width,
          height: config.height,
          frameRate: fps,
        },
        ...(decoded
          ? {
              audio: {
                codec: "A_OPUS",
                sampleRate: decoded.sampleRate,
                numberOfChannels: decoded.numberOfChannels,
              },
            }
          : {}),
        firstTimestampBehavior: "offset",
      });
    let failure: Error | undefined,
      bytes = 0,
      videoEncoder: VideoEncoder | undefined,
      audioEncoder: AudioEncoder | undefined;
    const check = () => {
      aborted(signal);
      if (failure) throw failure;
      if (bytes > 64 * 1048576)
        throw Error(
          "Encoded output exceeded the 64 MB memory budget. Use a shorter source.",
        );
    };
    try {
      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          try {
            muxer.addVideoChunk(chunk, meta);
            bytes += chunk.byteLength;
          } catch (e) {
            failure =
              e instanceof Error ? e : Error("WebM video muxing failed");
          }
        },
        error: (e) => {
          failure = e;
        },
      });
      videoEncoder.configure(config);
      if (audioConfig) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            try {
              muxer.addAudioChunk(chunk, meta);
              bytes += chunk.byteLength;
            } catch (e) {
              failure =
                e instanceof Error ? e : Error("WebM audio muxing failed");
            }
          },
          error: (e) => {
            failure = e;
          },
        });
        audioEncoder.configure(audioConfig);
      }
      video.pause();
      renderer.setExporting(true);
      let audioAt = 0,
        published = 0;
      const count = Math.ceil(duration * fps);
      for (let frame = 0; frame < count; frame++) {
        check();
        const time = frame / fps,
          end = Math.min(duration, (frame + 1) / fps);
        await seek(video, time, signal);
        await cancellable(renderer.freshFrame(time), signal);
        check();
        if (!renderer.valid)
          throw Error(
            renderer.failure || "No valid person mask for an export frame.",
          );
        const data = new VideoFrame(renderer.output, {
          timestamp: Math.round(time * 1000000),
          duration: Math.round((end - time) * 1000000),
        });
        try {
          videoEncoder.encode(data, { keyFrame: frame % (fps * 2) === 0 });
        } finally {
          data.close();
        }
        if (videoEncoder.encodeQueueSize > 3)
          await cancellable(
            deadline(
              videoEncoder.flush(),
              20000,
              "Video encoder stopped responding.",
            ),
            signal,
          );
        if (decoded && audioEncoder) {
          const sampleRate = decoded.sampleRate,
            channels = decoded.numberOfChannels,
            until = Math.min(
              Math.ceil(duration * sampleRate),
              Math.ceil(end * sampleRate),
            );
          while (audioAt < until) {
            check();
            const length = Math.min(960, until - audioAt),
              pcm = new Float32Array(length * channels);
            for (let channel = 0; channel < channels; channel++) {
              const source = decoded.getChannelData(channel);
              if (audioAt < source.length)
                pcm.set(
                  source.subarray(
                    audioAt,
                    Math.min(audioAt + length, source.length),
                  ),
                  channel * length,
                );
            }
            const block = new AudioData({
              format: "f32-planar",
              sampleRate,
              numberOfChannels: channels,
              numberOfFrames: length,
              timestamp: Math.round((audioAt / sampleRate) * 1000000),
              data: pcm,
            });
            try {
              audioEncoder.encode(block);
            } finally {
              block.close();
            }
            audioAt += length;
            if (audioEncoder.encodeQueueSize > 8)
              await cancellable(
                deadline(
                  audioEncoder.flush(),
                  20000,
                  "Audio encoder stopped responding.",
                ),
                signal,
              );
          }
        }
        if (performance.now() - published >= 250 || frame === count - 1) {
          progress(end);
          published = performance.now();
        }
      }
      check();
      await cancellable(
        deadline(
          videoEncoder.flush(),
          20000,
          "Video encoder finalization timed out.",
        ),
        signal,
      );
      if (audioEncoder)
        await cancellable(
          deadline(
            audioEncoder.flush(),
            20000,
            "Audio encoder finalization timed out.",
          ),
          signal,
        );
      check();
      muxer.finalize();
      if (!target.buffer?.byteLength)
        throw Error("The encoder produced no WebM data.");
      return new Blob([target.buffer], { type: "video/webm" });
    } finally {
      decoded = null;
      if (videoEncoder?.state !== "closed") videoEncoder?.close();
      if (audioEncoder?.state !== "closed") audioEncoder?.close();
      renderer.setExporting(false);
      video.pause();
    }
  })();
  return {
    cancel: () => controller.abort(),
    done: done.finally(() =>
      document.removeEventListener("visibilitychange", hidden),
    ),
  };
}
