import { cp, mkdir } from 'node:fs/promises'
await mkdir('public/ffmpeg', { recursive: true })
await cp('node_modules/@ffmpeg/ffmpeg/dist/esm', 'public/ffmpeg/ffmpeg', { recursive: true })
await cp('node_modules/@ffmpeg/core/dist/esm', 'public/ffmpeg/core', { recursive: true })
console.log('Prepared same-origin FFmpeg worker and single-thread core assets')
