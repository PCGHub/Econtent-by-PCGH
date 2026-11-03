import type { Pose } from "@mediapipe/pose";
import type { BodyPoint } from "./quality";
export type PersonModel = Pose;
export type SegmentationResult = {
  segmentationMask?: CanvasImageSource;
  poseLandmarks?: BodyPoint[];
  image: CanvasImageSource;
};
declare global {
  interface Window {
    Pose?: typeof Pose;
  }
}
export const MODEL_PATH = "/segmentation/pose-0.5.1675469404/";
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
async function loadPoseScript() {
  if (window.Pose) return;
  if (!library) {
    library = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) {
          script.remove();
          reject(error);
        } else resolve();
      };
      const timeout = setTimeout(
        () => finish(Error("Person detection script download timed out. Retry on a stable connection.")),
        30000,
      );
      script.src = MODEL_PATH + "pose.js";
      script.onload = () => finish();
      script.onerror = () =>
        finish(Error("Person detection script could not download. Retry on a stable connection."));
      document.head.appendChild(script);
    }).catch((error) => {
      library = undefined;
      throw error;
    });
  }
  await library;
}
export async function personModel() {
  await loadPoseScript();
  if (!window.Pose) throw Error("Person detection library is unavailable.");
  const probe = document.createElement("canvas");
  if (!probe.getContext("webgl2") && !probe.getContext("webgl"))
    throw Error(
      "This browser cannot initialize WebGL person detection. Enable hardware acceleration or use chroma key.",
    );
  // Release the capability probe's GPU context immediately.
  const gl = probe.getContext("webgl2") || probe.getContext("webgl");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return new window.Pose({
    locateFile: (name) => MODEL_PATH + name,
  });
}
