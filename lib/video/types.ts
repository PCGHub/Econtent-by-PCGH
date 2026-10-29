export const VIDEO_FILE_ACCEPT =
  "video/*,.mp4,.mov,.mkv,.webm,.avi,.flv,.wmv,.asf,.mpg,.mpeg,.m2v,.ts,.mts,.m2ts,.3gp,.3g2,.m4v,.ogv,.vob,.mxf";

export const CUT_PRESETS_SECONDS = [30, 45, 60, 90, 120, 190] as const;

export type EditMode =
  "full-split" | "section-split" | "manual-trim" | "compress-only";
export type CutStrategy = "fast" | "precision";
export type CompressionPreset = "off" | "high" | "balanced" | "small";
export type ProcessingStatus =
  | "idle"
  | "loading"
  | "packaging"
  | "validating"
  | "preparing"
  | "processing"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export interface TimeRange {
  start: number;
  end: number;
}
export interface CutPlanInput {
  mode: EditMode;
  sourceDuration: number;
  selectedRange?: TimeRange;
  clipDuration?: number;
  keepRemainder?: boolean;
}
export interface PlannedClip extends TimeRange {
  index: number;
  duration: number;
}
export interface VideoMetadata {
  name: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  mimeType: string;
}
export interface ProcessOptions {
  range: TimeRange;
  compression: CompressionPreset;
  outputName: string;
  cutStrategy?: CutStrategy;
  /** Explicit per-job consent to audio encoding while copying video. Never implicit. */
  convertAudio?: boolean;
  /** Bound temporary output growth; exceeding it is a failure, never a partial successful clip. */
  maxOutputBytes?: number;
}
export interface ProcessedClip {
  id: string;
  name: string;
  range: TimeRange;
  blob: Blob;
  mimeType: "video/mp4";
  cutStrategy?: CutStrategy;
  alignedRange?: TimeRange;
  audioConverted?: boolean;
  outputDuration?: number;
}
export interface StartupProgress {
  downloadMs?: number;
  compileFinalizeMs?: number;
  initializeMs?: number;
  transferBytes?: number;
  networkBodyBytes?: number;
  cached?: boolean;
  cacheStorage?: boolean;
  cacheStored?: boolean;
  cacheWriteMs?: number;
  cacheLookupMs?: number;
  cacheReadMs?: number;
  cacheAvailable?: boolean;
  phase: string;
  label?: string;
  receivedBytes?: number;
  totalBytes?: number;
}
/** Fraction is the measured progress of the active stage, never an estimated timer. */
export interface ProcessingProgress {
  status: ProcessingStatus;
  fraction?: number;
  message?: string;
  /** Actual pending worker operation, without filenames or source contents. */
  operation?: string;
  startup?: StartupProgress;
}
export interface JobProgress extends ProcessingProgress {
  overallFraction: number;
  clipFraction?: number;
  clipIndex?: number;
  clipCount?: number;
  completedClips: number;
  elapsedSeconds: number;
  etaSeconds?: number;
  indeterminate: boolean;
  operationElapsedSeconds?: number;
  lastMediaAdvanceSeconds?: number;
}
