import type { FFmpegWorker } from "./ffmpeg-browser";
import type { StartupProgress } from "./types";

export const STARTUP_LIMITS = { worker: 15_000, downloadIdle: 30_000, downloadTotal: 300_000, compile: 60_000, initialize: 60_000 };
const labels: Record<string, string> = {
  worker: "Start module worker", core: "Download/import FFmpeg JavaScript", download: "Download FFmpeg WASM",
  compile: "Compile FFmpeg WebAssembly", initialize: "Initialize FFmpeg memory/runtime", ready: "FFmpeg runtime ready",
};

/** Uses the pinned upstream worker protocol, with native failure handling and a ready handshake. */
export class FFmpegTransport implements FFmpegWorker {
  readonly managedStartup = true;
  loaded = false;
  private worker?: Worker;
  private sequence = 0;
  private pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: Error) => void}>();
  private logs = new Set<(data: {message: string}) => void>();
  private progress = new Set<(data: {progress: number; time: number}) => void>();
  private idle?: ReturnType<typeof setTimeout>;
  private total?: ReturnType<typeof setTimeout>;
  private phase = "worker";
  private received = 0;
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;
  private startupProgress: (progress: StartupProgress) => void;
  private limits: typeof STARTUP_LIMITS;
  constructor(onStartup: (progress: StartupProgress) => void, limits = STARTUP_LIMITS) {
    this.startupProgress = onStartup; this.limits = limits;
  }
  on(event: "log" | "progress", callback: ((data: {message: string}) => void) | ((data: {progress: number; time: number}) => void)) {
    if (event === "log") this.logs.add(callback as (data: {message: string}) => void);
    else this.progress.add(callback as (data: {progress: number; time: number}) => void);
  }
  private clearTimers() { clearTimeout(this.idle); clearTimeout(this.total); }
  private deadline(message: string, ms: number) {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.fail(new Error(`${message}. No encoding started. Retry to create a fresh worker; keep this tab foregrounded. Download, browser policy, memory or compilation failure must be checked separately from video encoding.`)), ms);
  }
  private startup(data: StartupProgress) {
    if (!labels[data.phase]) return;
    const changed = data.phase !== this.phase;
    if (changed) { this.clearTimers(); this.phase = data.phase; this.received = 0; }
    if (data.phase === "core" || data.phase === "download") {
      const advancing = Number.isSafeInteger(data.receivedBytes) && data.receivedBytes! > this.received;
      if (changed || advancing) this.deadline(`${labels[data.phase]} stalled: no new download bytes for 30 seconds`, this.limits.downloadIdle);
      if (advancing) this.received = data.receivedBytes!;
      if (changed) this.total = setTimeout(() => this.fail(new Error(`${labels[data.phase]} exceeded its five-minute download limit. Retry on a stable connection. No encoding started.`)), this.limits.downloadTotal);
    } else if (changed) {
      if (data.phase === "compile") this.deadline("WebAssembly compilation did not finish within 60 seconds", this.limits.compile);
      if (data.phase === "initialize") this.deadline("FFmpeg memory/runtime initialization did not finish within 60 seconds; device memory may be insufficient", this.limits.initialize);
      if (data.phase === "ready") this.deadline("FFmpeg runtime became ready but its load acknowledgement was not received within 15 seconds", this.limits.worker);
    }
    this.startupProgress({...data, label: labels[data.phase]});
  }
  private fail(error: Error) {
    this.clearTimers(); this.loaded = false;
    this.readyReject?.(error); this.readyReject = undefined;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear(); this.worker?.terminate(); this.worker = undefined;
  }
  terminate() { this.fail(new DOMException("FFmpeg worker stopped", "AbortError")); }
  private send<T>(type: string, data: unknown, transfer: Transferable[] = []): Promise<T> {
    if (!this.worker) return Promise.reject(new Error("FFmpeg worker unavailable; retry to load a fresh worker"));
    return new Promise<T>((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, {resolve: value => resolve(value as T), reject});
      try { this.worker!.postMessage({id, type, data}, transfer); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  async load(_config: {coreURL: string; wasmURL: string}) {
    void _config; // Runtime paths are pinned by the same-origin startup worker.
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") throw new Error("This browser does not support Web Workers and WebAssembly. Use a current Chrome browser.");
    if (this.loaded) return false;
    try {
      const ready = new Promise<void>((resolve, reject) => {this.readyResolve = resolve; this.readyReject = reject;});
      void ready.catch(() => {}); // Observe rejection even if the Worker constructor throws.
      this.phase = "worker";
      this.startupProgress({phase:"worker", label:labels.worker});
      this.deadline("Module worker did not send its startup handshake within 15 seconds (check worker URL, CSP and browser support)", this.limits.worker);
      this.worker = new Worker(new URL("/ffmpeg/startup-worker.js", location.origin), {type:"module", credentials:"same-origin"});
      this.worker.onerror = event => {
        event.preventDefault();
        this.fail(new Error(`FFmpeg worker failed during ${this.loaded ? "media processing/communication" : (labels[this.phase] ?? this.phase)}: ${event.message || "script/network/CSP error; browser may also have terminated the worker under memory pressure"}. Retry with a fresh worker.`));
      };
      this.worker.onmessageerror = () => this.fail(new Error("FFmpeg worker message could not be decoded. Browser memory or worker communication failed. Retry with a fresh worker."));
      this.worker.onmessage = ({data: message}) => {
        if (message.type === "ECONTENT_STARTUP") {
          this.startup(message.data);
          if (message.data.phase === "core" && message.data.workerReady) { this.readyResolve?.(); this.readyResolve = undefined; }
          return;
        }
        if (message.type === "LOG") { for (const callback of this.logs) callback(message.data); return; }
        if (message.type === "PROGRESS") { for (const callback of this.progress) callback(message.data); return; }
        const request = this.pending.get(message.id); if (!request) return;
        this.pending.delete(message.id);
        if (message.type === "ERROR") request.reject(new Error(String(message.data)));
        else request.resolve(message.data);
      };
      await ready;
      const result = await this.send<boolean>("LOAD", {});
      this.clearTimers(); this.loaded = true; this.readyReject = undefined;
      return result;
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error))); throw error;
    }
  }
  exec(args: string[]) { return this.send<number>("EXEC", {args}); }
  ffprobe(args: string[]) { return this.send<number>("FFPROBE", {args}); }
  writeFile(path: string, data: Uint8Array) { return this.send<boolean>("WRITE_FILE", {path,data}, [data.buffer as ArrayBuffer]); }
  readFile(path: string) { return this.send<Uint8Array | string>("READ_FILE", {path,encoding:"binary"}); }
  deleteFile(path: string) { return this.send<boolean>("DELETE_FILE", {path}); }
  createDir(path: string) { return this.send<boolean>("CREATE_DIR", {path}); }
  deleteDir(path: string) { return this.send<boolean>("DELETE_DIR", {path}); }
  mount(type: string, options: {files: File[]}, path: string) { return this.send<boolean>("MOUNT", {fsType:type,options,mountPoint:path}); }
  unmount(path: string) { return this.send<boolean>("UNMOUNT", {mountPoint:path}); }
}
