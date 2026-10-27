/** Download an existing processed Blob. This does not create or encode video. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') throw new Error('Downloads require a browser')
  const safeName = filename.replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').trim() || 'econtent-export.mp4'
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safeName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
