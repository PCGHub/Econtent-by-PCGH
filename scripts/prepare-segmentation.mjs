import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const version = "0.1.1675465747",
  src = "node_modules/@mediapipe/selfie_segmentation/",
  dest = "public/segmentation/" + version + "/";
if (
  JSON.parse(await readFile(src + "package.json", "utf8")).version !== version
)
  throw Error("Unexpected segmentation version");
const names = [
  "selfie_segmentation.js",
  "selfie_segmentation.binarypb",
  "selfie_segmentation.tflite",
  "selfie_segmentation_landscape.tflite",
  "selfie_segmentation_solution_simd_wasm_bin.js",
  "selfie_segmentation_solution_simd_wasm_bin.wasm",
  "selfie_segmentation_solution_simd_wasm_bin.data",
  "selfie_segmentation_solution_wasm_bin.js",
  "selfie_segmentation_solution_wasm_bin.wasm",
];
await mkdir(dest, { recursive: true });
await copyFile(
  "public/licenses/mediapipe-APACHE-2.0.txt",
  dest + "LICENSE.txt",
);
const files = {};
for (const name of names) {
  await copyFile(src + name, dest + name);
  const bytes = await readFile(dest + name);
  files[name] = {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
await writeFile(
  dest + "manifest.json",
  JSON.stringify(
    {
      package: "@mediapipe/selfie_segmentation",
      version,
      license: "Apache-2.0",
      files,
    },
    null,
    2,
  ),
);
await writeFile(
  dest + "NOTICE.txt",
  "MediaPipe Selfie Segmentation " +
    version +
    "\nCopyright Google LLC. Licensed under Apache License 2.0.\nhttps://github.com/google-ai-edge/mediapipe\nhttps://www.apache.org/licenses/LICENSE-2.0\n",
);
console.log("Prepared same-origin pinned segmentation assets: " + version);
