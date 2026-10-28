import type { ProcessedClip } from './types'

export async function zipClips(clips: ProcessedClip[]): Promise<Blob> {
  if (!clips.length) throw new Error('Select at least one clip')
  if (clips.reduce((sum, clip) => sum + clip.blob.size, 0) > 256 * 1048576) throw new Error('ZIP safety limit is 256 MB. Download individual clips or select fewer clips.')
  const { default: JSZip } = await import('jszip')
  const archive = new JSZip()
  for (const [i, clip] of clips.entries()) archive.file(`${String(i + 1).padStart(3, '0')}-${clip.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`, clip.blob)
  return archive.generateAsync({ type: 'blob', compression: 'STORE' })
}
