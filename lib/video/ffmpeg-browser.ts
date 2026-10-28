import type { FFmpeg } from '@ffmpeg/ffmpeg'
import type { VideoProcessingEngine } from './engine'
import type { ProcessOptions, ProcessedClip, ProcessingProgress } from './types'
import { encodingArgs } from './command'

/** @ffmpeg/ffmpeg owns a dedicated Web Worker; jobs are serialized by this adapter. */
export class BrowserVideoEngine implements VideoProcessingEngine {
  private ffmpeg?: FFmpeg
  private busy = false
  private disposed = false
  private notify: (progress: ProcessingProgress) => void = () => {}

  async initialize(onProgress?: (progress: ProcessingProgress) => void): Promise<void> {
    if (this.disposed) throw new Error('Engine disposed')
    this.notify = onProgress ?? (() => {})
    if (this.ffmpeg?.loaded) return
    this.notify({ status: 'preparing', message: 'Loading local video engine…' })
    // The public ESM distribution preserves the worker's relative module URLs.
    const moduleURL = '/ffmpeg/ffmpeg/index.js'
    const { FFmpeg: Constructor } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleURL) as typeof import('@ffmpeg/ffmpeg')
    if (this.disposed) throw new DOMException('Cancelled', 'AbortError')
    const ffmpeg = new Constructor()
    this.ffmpeg = ffmpeg
    ffmpeg.on('progress', ({ progress }) => this.notify({ status: 'processing', fraction: Math.min(1, Math.max(0, progress)) }))
    try {
      await ffmpeg.load({ coreURL: `${location.origin}/ffmpeg/core/ffmpeg-core.js`, wasmURL: `${location.origin}/ffmpeg/core/ffmpeg-core.wasm` })
    } catch (error) {
      ffmpeg.terminate()
      this.ffmpeg = undefined
      throw error
    }
  }

  async process(source: File, options: ProcessOptions, signal?: AbortSignal): Promise<ProcessedClip> {
    if (this.busy) throw new Error('Another clip is processing')
    if (!this.ffmpeg?.loaded || this.disposed) throw new Error('Initialize the engine first')
    signal?.throwIfAborted()
    this.busy = true
    const ffmpeg = this.ffmpeg
    const abort = () => { ffmpeg.terminate(); this.ffmpeg = undefined }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const args = encodingArgs(options)
      this.notify({ status: 'processing', message: `Encoding ${options.outputName}` })
      const bytes = new Uint8Array(await source.arrayBuffer())
      signal?.throwIfAborted()
      await ffmpeg.writeFile('input', bytes)
      const result = await ffmpeg.exec(args)
      signal?.throwIfAborted()
      if (result !== 0) throw new Error('Video encoding failed. Try a smaller H.264/AAC MP4 file.')
      this.notify({ status: 'finalizing' })
      const data = await ffmpeg.readFile('output.mp4')
      if (typeof data === 'string' || data.length === 0) throw new Error('Encoder returned no video')
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
      return { id: crypto.randomUUID(), name: options.outputName, range: options.range, blob, mimeType: 'video/mp4' }
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      throw error
    } finally {
      signal?.removeEventListener('abort', abort)
      if (ffmpeg.loaded) await Promise.allSettled([ffmpeg.deleteFile('input'), ffmpeg.deleteFile('output.mp4')])
      this.busy = false
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.ffmpeg?.terminate()
    this.ffmpeg = undefined
  }
}
