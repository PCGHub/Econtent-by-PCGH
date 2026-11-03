import type { SegmentationResult } from "./model";

// Experimental browser-only MODNet adapter. This is loaded only when the user
// explicitly chooses Detailed Edges; Fast mode does not download this runtime.
type Matte = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };
type Pipe = (input: string) => Promise<Array<{ data: Matte }>>;
const runtimeUrl = "https://esm.sh/@huggingface/transformers@3.7.6?bundle";
const modelId = "Xenova/modnet";

export class ModnetSegmenter {
  private pipeline: Pipe | null = null;
  private callback: ((result: SegmentationResult) => void) | null = null;
  private maskCanvas = document.createElement("canvas");
  onResults(callback: (result: SegmentationResult) => void) { this.callback = callback; }
  setOptions(_options: unknown) {}
  async initialize() {
    // Dynamic import avoids loading ONNX dependencies in the Fast editor bundle.
    const runtime = await import(/* webpackIgnore: true */ runtimeUrl) as {
      pipeline: (task: string, model: string, options: object) => Promise<Pipe>;
    };
    this.pipeline = await runtime.pipeline("background-removal", modelId, {
      dtype: "fp32", device: "wasm",
    });
  }
  async send({ image }: { image: CanvasImageSource }) {
    if (!this.pipeline) throw Error("MODNet has not initialized.");
    const input = image as HTMLCanvasElement;
    // Canvas data URL avoids transmitting the user's video to a remote server.
    const result = await this.pipeline(input.toDataURL("image/png"));
    const matte = result?.[0]?.data;
    if (!matte || !matte.width || !matte.height || matte.data.length < matte.width * matte.height)
      throw Error("MODNet did not return a valid alpha matte.");
    const canvas = this.maskCanvas;
    canvas.width = input.width; canvas.height = input.height;
    const native = document.createElement("canvas");
    native.width = matte.width; native.height = matte.height;
    const context = native.getContext("2d")!;
    const pixels = context.createImageData(matte.width, matte.height);
    const channels = matte.data.length / (matte.width * matte.height);
    for (let i = 0; i < matte.width * matte.height; i++) {
      const v = matte.data[i * channels];
      pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255;
      pixels.data[i * 4 + 3] = v;
    }
    context.putImageData(pixels, 0, 0);
    const target = canvas.getContext("2d")!;
    target.clearRect(0, 0, canvas.width, canvas.height);
    target.drawImage(native, 0, 0, canvas.width, canvas.height);
    this.callback?.({ image, segmentationMask: canvas });
  }
  async reset() {}
  async close() { this.pipeline = null; }
}
