import type { CompressionPreset } from './types'

/** Guidance for the FFmpeg adapter; values must be validated against the chosen WASM build. */
export const COMPRESSION_PRESETS: Record<Exclude<CompressionPreset, 'off'>, { crf: number; preset: string; description: string }> = {
  high: { crf: 20, preset: 'medium', description: 'Prioritize visual detail' },
  balanced: { crf: 25, preset: 'medium', description: 'Balance quality and size' },
  small: { crf: 30, preset: 'fast', description: 'Prioritize smaller files' },
}
