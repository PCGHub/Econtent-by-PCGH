import JSZip from 'jszip'
import type { ZipRequest, ZipResponse } from '../lib/video/zip'
const scope = self as unknown as { onmessage: ((event: MessageEvent<ZipRequest>) => void) | null; postMessage: (value: ZipResponse) => void }
scope.onmessage = async ({ data }) => {
  try {
    const archive = new JSZip()
    for (const clip of data.clips) archive.file(clip.name, clip.blob)
    const blob = await archive.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, update => {
      scope.postMessage({ type: 'progress', fraction: update.percent / 100 })
    })
    scope.postMessage({ type: 'done', blob })
  } catch (error) { scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'ZIP creation failed' }) }
}
