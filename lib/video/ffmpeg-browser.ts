import type { VideoProcessingEngine } from './engine'
import type { ProcessOptions, ProcessedClip, ProcessingProgress, TimeRange } from './types'
import { alignFastRange, encodingArgs } from './command'
import { assertValidRange } from './validation'
import { mediaFraction } from './progress'

// Keep worker-only ambient declarations outside the app TypeScript program.
export interface FFmpegWorker {
  loaded: boolean
  on(event: 'progress', callback: (event: { progress: number; time: number }) => void): void
  on(event: 'log', callback: (event: { message: string }) => void): void
  load(config: { coreURL: string; wasmURL: string }): Promise<boolean>
  terminate(): void
  writeFile(path: string, data: Uint8Array): Promise<boolean>
  exec(args: string[]): Promise<number>
  ffprobe(args: string[]): Promise<number>
  readFile(path: string): Promise<Uint8Array | string>
  deleteFile(path: string): Promise<boolean>
  createDir(path: string): Promise<boolean>
  deleteDir(path: string): Promise<boolean>
  mount(type: string, options: { files: File[] }, path: string): Promise<boolean>
  unmount(path: string): Promise<boolean>
}
interface SourceInfo { duration: number; compatible: boolean; keyframes?: number[] }

/** One worker and one read-only source mount per session; all jobs are serialized. */
export class BrowserVideoEngine implements VideoProcessingEngine {
  private ffmpeg?: FFmpegWorker
  private busy = false
  private disposed = false
  private source?: File
  private input = 'input'
  private info?: SourceInfo
  private activeDuration?: number
  private lastFraction = 0
  private notify: (progress: ProcessingProgress) => void = () => {}
  sourceAccess?: 'workerfs' | 'memfs'
  private factory?: () => Promise<FFmpegWorker>
  constructor(factory?: () => Promise<FFmpegWorker>) { this.factory = factory }

  private emitTime = (time: number) => {
    if (!this.activeDuration) return
    const fraction = mediaFraction(time, this.activeDuration)
    if (fraction === undefined) { this.notify({ status: 'processing' }); return }
    if (fraction < this.lastFraction) return
    this.lastFraction = fraction
    this.notify({ status: 'processing', fraction })
  }
  private stop = () => {
    this.ffmpeg?.terminate(); this.ffmpeg = undefined; this.source = undefined; this.info = undefined; this.sourceAccess = undefined
    this.activeDuration = undefined
  }

  async initialize(onProgress?: (progress: ProcessingProgress) => void, signal?: AbortSignal): Promise<void> {
    if (this.disposed) throw new Error('Engine disposed')
    signal?.throwIfAborted()
    this.notify = onProgress ?? (() => {})
    if (this.ffmpeg?.loaded) return
    this.notify({ status: 'loading', message: 'Loading FFmpeg…' })
    signal?.addEventListener('abort', this.stop, { once: true })
    try {
      let ffmpeg: FFmpegWorker
      if (this.factory) ffmpeg = await this.factory()
      else {
        const moduleURL = '/ffmpeg/ffmpeg/index.js'
        const { FFmpeg: Constructor } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleURL) as { FFmpeg: new () => FFmpegWorker }
        ffmpeg = new Constructor()
      }
      if (this.disposed || signal?.aborted) { ffmpeg.terminate(); throw new DOMException('Cancelled', 'AbortError') }
      this.ffmpeg = ffmpeg
      ffmpeg.on('progress', ({ time }) => this.emitTime(time))
      ffmpeg.on('log', ({ message }) => {
        const match = /^out_time_us=(\d+)$/.exec(message.trim())
        if (match) this.emitTime(Number(match[1]))
      })
      await ffmpeg.load({ coreURL: `${location.origin}/ffmpeg/core/ffmpeg-core.js`, wasmURL: `${location.origin}/ffmpeg/core/ffmpeg-core.wasm` })
      signal?.throwIfAborted()
    } catch (error) { this.stop(); throw error }
    finally { signal?.removeEventListener('abort', this.stop) }
  }

  private async probe(args: string[], output: string): Promise<Record<string, unknown>> {
    const ffmpeg = this.ffmpeg!
    try {
      const exit = await ffmpeg.ffprobe(['-v', 'error', ...args, '-of', 'json', '-o', output])
      // core 0.12.10 can leave ret=-1 when ffprobe returns normally. A fresh,
      // parseable output plus the caller's required fields is authoritative.
      if (exit !== 0 && exit !== -1) throw new Error('Cannot inspect video. Try an H.264/AAC MP4.')
      const data = await ffmpeg.readFile(output)
      return JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data))
    } finally { if (ffmpeg.loaded) await ffmpeg.deleteFile(output).catch(() => {}) }
  }

  private async prepare(source: File, fast: boolean): Promise<void> {
    const ffmpeg = this.ffmpeg!
    if (this.source !== source) {
      await this.releaseSource()
      this.notify({ status: 'preparing', message: 'Preparing source video…' })
      if (!source.size) throw new Error('The source video is empty')
      try {
        await ffmpeg.createDir('/source')
        const file = new File([source], 'input', { type: source.type })
        if (!await ffmpeg.mount('WORKERFS', { files: [file] }, '/source')) throw new Error('WORKERFS unavailable')
        this.input = '/source/input'; this.sourceAccess = 'workerfs'
      } catch {
        await ffmpeg.unmount('/source').catch(() => {})
        await ffmpeg.deleteDir('/source').catch(() => {})
        this.input = 'input'; this.sourceAccess = 'memfs'
        // Compatibility fallback: transfer the source once, not once per clip.
        await ffmpeg.writeFile(this.input, new Uint8Array(await source.arrayBuffer()))
      }
      this.source = source
      const data = await this.probe(['-show_entries', 'format=format_name,duration:stream=codec_type,codec_name', this.input], 'source.json') as { format?: { duration?: string; format_name?: string }; streams?: { codec_type: string; codec_name: string }[] }
      const duration = Number(data.format?.duration)
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Cannot read a finite source duration')
      const video = data.streams?.find(s => s.codec_type === 'video'), audio = data.streams?.find(s => s.codec_type === 'audio')
      if (!video) throw new Error('Source has no video stream')
      this.info = { duration, compatible: !!data.format?.format_name?.includes('mp4') && video.codec_name === 'h264' && (!audio || audio.codec_name === 'aac') }
    }
    if (fast) {
      if (!this.info?.compatible) throw new Error('Fast Cut supports H.264 video and optional AAC audio in compatible MP4 files. Choose Precision Cut for this source.')
      if (!this.info.keyframes) {
        this.notify({ status: 'preparing', message: 'Reading source keyframes for Fast Cut…' })
        const data = await this.probe(['-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts_time,flags', this.input], 'keyframes.json') as { packets?: { pts_time?: string; flags?: string }[] }
        this.info.keyframes = [...new Set((data.packets ?? []).filter(packet => packet.flags?.includes('K')).map(packet => Number(packet.pts_time)).filter(n => Number.isFinite(n) && n >= 0))].sort((a, b) => a - b)
      }
    }
  }

  async process(source: File, options: ProcessOptions, signal?: AbortSignal): Promise<ProcessedClip> {
    if (this.busy) throw new Error('Another clip is processing')
    if (!this.ffmpeg?.loaded || this.disposed) throw new Error('Initialize the engine first')
    signal?.throwIfAborted()
    const ffmpeg = this.ffmpeg
    this.busy = true
    signal?.addEventListener('abort', this.stop, { once: true })
    try {
      const fast = options.cutStrategy === 'fast'
      if (fast && options.compression !== 'off') throw new Error('Fast Cut requires compression Off')
      await this.prepare(source, fast)
      signal?.throwIfAborted()
      assertValidRange(options.range, this.info!.duration + 0.001)
      const requested: TimeRange = { ...options.range, end: Math.min(options.range.end, this.info!.duration) }
      const range = fast ? alignFastRange(requested, this.info!.keyframes!, this.info!.duration) : requested
      this.activeDuration = range.end - range.start; this.lastFraction = 0
      this.notify({ status: 'processing', message: fast ? 'Copying streams at source keyframes…' : 'Encoding precision cut…' })
      const result = await ffmpeg.exec(encodingArgs({ ...options, range }, this.input))
      this.activeDuration = undefined
      signal?.throwIfAborted()
      if (result !== 0) throw new Error('Video processing failed. Try Precision Cut or a smaller H.264/AAC MP4.')
      this.notify({ status: 'finalizing', message: 'Verifying and reading the MP4 output…' })
      const info = await this.probe(['-show_entries', 'format=duration:stream=codec_name,codec_type', 'output.mp4'], 'output.json') as { format?: { duration?: string }; streams?: { codec_type: string; codec_name: string }[] }
      const duration = Number(info.format?.duration)
      if (!(duration > 0) || !info.streams?.some(s => s.codec_type === 'video' && s.codec_name === 'h264')) throw new Error('Invalid MP4 output')
      const data = await ffmpeg.readFile('output.mp4')
      if (typeof data === 'string' || data.length === 0) throw new Error('Encoder returned no video')
      // Worker transfers a normal ArrayBuffer. Blob takes the bytes without an extra Uint8Array copy.
      const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' })
      return { id: crypto.randomUUID(), name: options.outputName, range: options.range, alignedRange: range, outputDuration: duration,
        cutStrategy: fast ? 'fast' : 'precision', blob, mimeType: 'video/mp4' }
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      throw error
    } finally {
      this.activeDuration = undefined; signal?.removeEventListener('abort', this.stop)
      if (ffmpeg.loaded) await ffmpeg.deleteFile('output.mp4').catch(() => {})
      this.busy = false
    }
  }

  async releaseSource(): Promise<void> {
    const ffmpeg = this.ffmpeg
    if (ffmpeg?.loaded && this.source) {
      if (this.sourceAccess === 'workerfs') { await ffmpeg.unmount('/source'); await ffmpeg.deleteDir('/source') }
      else await ffmpeg.deleteFile(this.input)
    }
    this.source = undefined; this.info = undefined; this.sourceAccess = undefined
  }
  async dispose(): Promise<void> { this.disposed = true; this.stop() }
}
