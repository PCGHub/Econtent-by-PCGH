import type { ProcessedClip } from './types'
export interface ZipRequest { clips: { name: string; blob: Blob }[] }
export type ZipResponse = { type: 'progress'; fraction: number } | { type: 'done'; blob: Blob } | { type: 'error'; message: string }

/** ZIP packaging runs in its own cancellable worker; terminating it releases its temporary memory. */
export async function zipClips(clips: ProcessedClip[], onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<Blob> {
  if (!clips.length) throw new Error('Select at least one clip')
  if (clips.reduce((sum, clip) => sum + clip.blob.size, 0) > 256 * 1048576) throw new Error('ZIP safety limit is 256 MB. Download individual clips or select fewer clips.')
  signal?.throwIfAborted()
  const worker = new Worker(new URL('../../workers/zip.worker.ts', import.meta.url), { type: 'module' })
  return new Promise<Blob>((resolve, reject) => {
    const stop = () => { worker.terminate(); signal?.removeEventListener('abort', cancel) }
    const cancel = () => { stop(); reject(new DOMException('Cancelled', 'AbortError')) }
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onerror = () => { stop(); reject(new Error('ZIP worker failed. Try fewer clips or download individual MP4 files.')) }
    worker.onmessage = ({ data }: MessageEvent<ZipResponse>) => {
      if (data.type === 'progress') onProgress?.(data.fraction)
      else { stop(); if (data.type === 'done') resolve(data.blob); else reject(new Error(data.message)) }
    }
    const request: ZipRequest = { clips: clips.map((clip, i) => ({ name: `${String(i + 1).padStart(3, '0')}-${clip.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`, blob: clip.blob })) }
    try { worker.postMessage(request) } catch (error) { stop(); reject(error) }
  })
}
