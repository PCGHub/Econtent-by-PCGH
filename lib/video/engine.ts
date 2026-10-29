import type { SourceInspection } from "./workload";
import type {
  ProcessOptions,
  ProcessedClip,
  ProcessingProgress,
} from "./types";

/** Browser media engine contract; implemented by BrowserVideoEngine. */
export interface VideoProcessingEngine {
  initialize(
    onProgress?: (progress: ProcessingProgress) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  inspect(source: File, signal?: AbortSignal): Promise<SourceInspection>;
  process(
    source: File,
    options: ProcessOptions,
    signal?: AbortSignal,
  ): Promise<ProcessedClip>;
  dispose(): Promise<void>;
}
