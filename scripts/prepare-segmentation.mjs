import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const version = "0.5.1675469404",
  src = "node_modules/@mediapipe/pose/",
  dest = "public/segmentation/pose-" + version + "/";
if (
  JSON.parse(await readFile(src + "package.json", "utf8")).version !== version
)
  throw Error("Unexpected segmentation version");
const names = [
  "pose.js",
  "pose_web.binarypb",
  "pose_landmark_full.tflite",
  "pose_solution_packed_assets.data",
  "pose_solution_packed_assets_loader.js",
  "pose_solution_simd_wasm_bin.js",
  "pose_solution_simd_wasm_bin.wasm",
  "pose_solution_simd_wasm_bin.data",
  "pose_solution_wasm_bin.js",
  "pose_solution_wasm_bin.wasm",
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
      package: "@mediapipe/pose",
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
  "MediaPipe Pose " +
    version +
    "\nCopyright Google LLC. Licensed under Apache License 2.0.\nhttps://github.com/google-ai-edge/mediapipe\nhttps://www.apache.org/licenses/LICENSE-2.0\n",
);
console.log("Prepared same-origin pinned segmentation assets: " + version);
