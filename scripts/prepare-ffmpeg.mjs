import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises'
await mkdir('public/ffmpeg', { recursive: true })
await cp('node_modules/@ffmpeg/ffmpeg/dist/esm', 'public/ffmpeg/ffmpeg', { recursive: true })
await cp('node_modules/@ffmpeg/core/dist/esm', 'public/ffmpeg/core', { recursive: true })
console.log('Prepared same-origin FFmpeg worker and single-thread core assets')

await cp('workers/ffmpeg-startup.js', 'public/ffmpeg/startup-worker.js')
await cp('workers/ffmpeg-core-loader.js', 'public/ffmpeg/core-loader.js')
const corePackage = JSON.parse(await readFile('node_modules/@ffmpeg/core/package.json', 'utf8'))
await writeFile('public/ffmpeg/asset-manifest.json', JSON.stringify({coreVersion: corePackage.version, wrapperVersion: JSON.parse(await readFile('node_modules/@ffmpeg/ffmpeg/package.json','utf8')).version, wasmSha256: createHash('sha256').update(await readFile('public/ffmpeg/core/ffmpeg-core.wasm')).digest('hex'), coreSha256:createHash('sha256').update(await readFile('public/ffmpeg/core/ffmpeg-core.js')).digest('hex'), wasmBytes:(await stat('public/ffmpeg/core/ffmpeg-core.wasm')).size}))
