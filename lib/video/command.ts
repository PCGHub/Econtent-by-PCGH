import type { ProcessOptions, TimeRange } from './types'
import { COMPRESSION_PRESETS } from './presets'

export function encodingArgs(options: ProcessOptions, input = 'input'): string[] {
  const { start, end } = options.range
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new RangeError('Invalid cut range')
  const common = ['-t', String(end - start), '-map', '0:v:0', '-map', '0:a:0?']
  // Input-side accurate seek discards only the preceding GOP, instead of decoding from zero per clip.
  const seek = ['-ss', String(start), '-i', input]
  if (options.cutStrategy === 'fast') {
    if (options.compression !== 'off') throw new Error('Fast Cut requires compression Off. Choose Precision Cut to compress.')
    return [...seek, ...common, '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-y', 'output.mp4']
  }
  const preset = options.compression === 'off' ? { crf: 18, preset: 'fast' } : COMPRESSION_PRESETS[options.compression]
  if (!preset) throw new RangeError('Unknown compression preset')
  return [...seek, ...common, '-c:v', 'libx264', '-crf', String(preset.crf), '-preset', preset.preset,
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-y', 'output.mp4']
}

/** Both boundaries use the same preceding-keyframe rule so consecutive splits don't overlap. */
export function alignFastRange(range: TimeRange, keyframes: number[], duration: number): TimeRange {
  if (!keyframes.length) throw new Error('Cannot find source keyframes. Use Precision Cut.')
  const before = (time: number) => {
    let lo = 0, hi = keyframes.length
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (keyframes[mid] <= time + 1e-6) lo = mid + 1; else hi = mid }
    return keyframes[Math.max(0, lo - 1)]
  }
  const start = before(range.start)
  const end = Math.abs(range.end - duration) < 0.05 ? duration : before(range.end)
  if (end <= start) throw new Error('This range is shorter than the source keyframe spacing. Use Precision Cut or a longer range.')
  return { start, end }
}
