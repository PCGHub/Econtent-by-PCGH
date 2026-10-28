import JSZip from 'jszip'
import type { ZipRequest, ZipResponse } from '../lib/video/zip'
const scope = self as unknown as { onmessage: ((event: MessageEvent<ZipRequest>) => void) | null; postMessage: (value: ZipResponse) => void }
scope.onmessage = async ({ data }) => {
  try {
    const archive = new JSZip()
    for (const clip of data.clips) archive.file(clip.name, clip.blob)
    let lastReportedAt = -Infinity, lastFraction = -1
    const blob = await archive.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, update => {
      const fraction = update.percent / 100, at = performance.now()
      // JSZip can emit thousands of chunk updates. Forward measured work at
      // most 10Hz, with an immediate final update; never interpolate a timer.
      if (fraction > lastFraction && (at - lastReportedAt >= 100 || fraction === 1)) {
        scope.postMessage({ type: 'progress', fraction })
        lastReportedAt = at; lastFraction = fraction
      }
    })
    scope.postMessage({ type: 'done', blob })
  } catch (error) { scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'ZIP creation failed' }) }
}
