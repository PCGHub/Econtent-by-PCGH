import type { ProcessOptions } from './types'
import { COMPRESSION_PRESETS } from './presets'

/** Output-side seek decodes the input before discarding frames: no keyframe snapping. */
export function encodingArgs(options: ProcessOptions): string[] {
  const { start, end } = options.range
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new RangeError('Invalid cut range')
  const preset = options.compression === 'off' ? { crf: 18, preset: 'fast' } : COMPRESSION_PRESETS[options.compression]
  if (!preset) throw new RangeError('Unknown compression preset')
  return ['-i', 'input', '-ss', String(start), '-t', String(end - start), '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-crf', String(preset.crf), '-preset', preset.preset,
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', 'output.mp4']
}
