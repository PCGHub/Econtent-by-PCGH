import type { ProcessOptions, ProcessedClip, ProcessingProgress } from './types'

/** Browser media engine contract; concrete FFmpeg implementation is still required. */
export interface VideoProcessingEngine {
  initialize(onProgress?: (progress: ProcessingProgress) => void): Promise<void>
  process(source: File, options: ProcessOptions, signal?: AbortSignal): Promise<ProcessedClip>
  dispose(): Promise<void>
}
