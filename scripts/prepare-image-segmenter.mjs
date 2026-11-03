import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const version = "0.10.22";
const src = "node_modules/@mediapipe/tasks-vision/wasm/";
const dest = "public/segmentation/tasks-vision-" + version + "/wasm/";
await mkdir(dest, { recursive: true });
const files = {};
for (const name of ["vision_wasm_internal.wasm", "vision_wasm_internal.js", "vision_wasm_nosimd_internal.wasm", "vision_wasm_nosimd_internal.js"]) {
  const data = await readFile(src + name);
  await copyFile(src + name, dest + name);
  files[name] = { bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") };
}
await writeFile(dest + "manifest.json", JSON.stringify({ version, files }, null, 2));
console.log("Prepared local Tasks Vision WASM: " + version);
