export const CUT_PRESETS_SECONDS = [30, 45, 60, 90, 120, 190] as const

export type EditMode = 'full-split' | 'section-split' | 'manual-trim' | 'compress-only'
export type CompressionPreset = 'off' | 'high' | 'balanced' | 'small'
export type ProcessingStatus = 'idle' | 'validating' | 'preparing' | 'processing' | 'finalizing' | 'completed' | 'failed' | 'cancelled'

export interface TimeRange { start: number; end: number }
export interface CutPlanInput {
  mode: EditMode
  sourceDuration: number
  selectedRange?: TimeRange
  clipDuration?: number
  keepRemainder?: boolean
}
export interface PlannedClip extends TimeRange { index: number; duration: number }
export interface VideoMetadata {
  name: string
  sizeBytes: number
  durationSeconds: number
  width: number
  height: number
  mimeType: string
}
export interface ProcessOptions {
  range: TimeRange
  compression: CompressionPreset
  outputName: string
}
export interface ProcessedClip {
  id: string
  name: string
  range: TimeRange
  blob: Blob
  mimeType: 'video/mp4'
}
export interface ProcessingProgress { status: ProcessingStatus; fraction?: number; message?: string }
