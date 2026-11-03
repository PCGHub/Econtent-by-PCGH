/** Dedicated person/background segmenter. MediaPipe Pose is no longer used. */
import type { BodyPoint } from "./quality";
export type SegmentationResult = { segmentationMask?: CanvasImageSource; poseLandmarks?: BodyPoint[]; image: CanvasImageSource };
type ConfidenceMask = { width: number; height: number; getAsFloat32Array(): Float32Array; close(): void };
type Segmenter = { segmentForVideo(image: CanvasImageSource, timestampMs: number, callback: (result: { confidenceMasks?: ConfidenceMask[] }) => void): void; close(): void };
type VisionModule = { FilesetResolver: { forVisionTasks(path: string): Promise<unknown> }; ImageSegmenter: { createFromOptions(vision: unknown, options: unknown): Promise<Segmenter> } };
const version = "0.10.22";
const cdn = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + version;
const modelUrl = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
let modulePromise: Promise<VisionModule> | undefined;
export function deadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
async function loadVision(): Promise<VisionModule> {
  modulePromise ??= (async () => {
    // Runtime ESM URL is intentionally external to the Next.js module graph.
    const url = cdn + "/vision_bundle.mjs";
    return await import(/* webpackIgnore: true */ url) as VisionModule;
  })().catch(error => { modulePromise = undefined; throw error; });
  return modulePromise;
}
export class PersonSegmenter {
  private segmenter: Segmenter | null = null;
  private callback: ((result: SegmentationResult) => void) | null = null;
  private timestamp = 0;
  private maskCanvas = document.createElement("canvas");
  onResults(cb: (result: SegmentationResult) => void) { this.callback = cb; }
  setOptions(_options: unknown) { /* Legacy pose options intentionally ignored. */ }
  async initialize() {
    const vision = await deadline(loadVision(), 60000, "Person segmenter library download timed out.");
    const fileset = await deadline(vision.FilesetResolver.forVisionTasks(cdn + "/wasm"), 60000, "Person segmenter WASM initialization timed out.");
    this.segmenter = await deadline(vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
      runningMode: "VIDEO", outputCategoryMask: false, outputConfidenceMasks: true,
    }), 90000, "Selfie segmentation model download or initialization timed out.");
  }
  async send({ image }: { image: CanvasImageSource }) {
    if (!this.segmenter) throw Error("Person segmenter is not initialized.");
    const source = image as HTMLCanvasElement;
    const w = source.width, h = source.height;
    const canvas = this.maskCanvas;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    let found = false;
    const stamp = ++this.timestamp * 1000 / 24;
    this.segmenter.segmentForVideo(image, stamp, (result) => {
      const masks = result.confidenceMasks;
      try {
        // Selfie model categories: 0=background, 1=person.
        const mask = masks?.[1];
        if (!mask) { this.callback?.({ image }); return; }
        const confidence = mask.getAsFloat32Array();
        const native = document.createElement("canvas");
        native.width = mask.width; native.height = mask.height;
        const ctx = native.getContext("2d")!;
        const data = ctx.createImageData(mask.width, mask.height);
        for (let i = 0; i < confidence.length; i++) {
          const v = Math.round(Math.min(1, Math.max(0, confidence[i])) * 255);
          data.data[i * 4] = 255; data.data[i * 4 + 1] = 255; data.data[i * 4 + 2] = 255; data.data[i * 4 + 3] = v;
        }
        ctx.putImageData(data, 0, 0);
        const target = canvas.getContext("2d")!;
        target.clearRect(0, 0, w, h);
        target.drawImage(native, 0, 0, w, h);
        found = true;
        this.callback?.({ image, segmentationMask: canvas });
      } finally { masks?.forEach(mask => mask.close()); }
    });
    if (!found) return;
  }
  async reset() { /* Image segmenter runs independently on each video frame. */ }
  async close() { this.segmenter?.close(); this.segmenter = null; }
}
export type PersonModel = PersonSegmenter;
export async function personModel() { return new PersonSegmenter(); }
