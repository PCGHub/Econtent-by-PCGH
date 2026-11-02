import type { SelfieSegmentation } from "@mediapipe/selfie_segmentation";
export type PersonModel = SelfieSegmentation;
export type SegmentationResult = {
  segmentationMask: CanvasImageSource;
  image: CanvasImageSource;
};
declare global {
  interface Window {
    SelfieSegmentation?: typeof SelfieSegmentation;
  }
}
export const MODEL_PATH = "/segmentation/0.1.1675465747/";
let library: Promise<void> | undefined;
export function deadline<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
export async function personModel() {
  if (!window.SelfieSegmentation) {
    library ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MODEL_PATH + "selfie_segmentation.js";
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        reject(
          Error(
            "Person detection script could not download. Retry on a stable connection.",
          ),
        );
      };
      document.head.appendChild(script);
    }).catch((e) => {
      library = undefined;
      throw e;
    });
    await deadline(
      library,
      30000,
      "Person detection script download timed out. Retry to create a fresh model.",
    );
  }
  if (!window.SelfieSegmentation)
    throw Error("Person detection library is unavailable.");
  const probe = document.createElement("canvas");
  if (!probe.getContext("webgl2") && !probe.getContext("webgl"))
    throw Error(
      "This browser cannot initialize WebGL person detection. Enable hardware acceleration or use chroma key.",
    );
  // Release the capability probe's GPU context immediately.
  const gl = probe.getContext("webgl2") || probe.getContext("webgl");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return new window.SelfieSegmentation({
    locateFile: (name) => MODEL_PATH + name,
  });
}
