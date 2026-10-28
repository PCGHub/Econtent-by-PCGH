# Processing implementation and verification

The existing v0/econtent-frontend files were compared with GitHub commit e67d940d3a8fd730f2c7ed9be4027dd758f6a5de before editing. All 22 matched after removing reconstruction-only extra terminal newlines. No changes were made to main or other repositories.

## Runtime

`BrowserVideoEngine` implements the existing engine contract. @ffmpeg/ffmpeg 0.12.15 runs its own module Web Worker; @ffmpeg/core 0.12.10 is the single-thread core. `npm install` copies their ESM distributions to public/ffmpeg. Next serves these same-origin assets, avoiding CDN uploads and cross-origin worker failures. No media processing runs on Vercel Functions. WASM loads only when the user starts processing.

Output-side seek decodes preceding frames for accurate cuts. Ranges are half-open and limited by video-frame and audio-sample precision. H.264 yuv420p and AAC 128 kbps are written into fast-start MP4. Off uses CRF 18 / fast; High 20 / medium; Balanced 25 / medium; Smaller 30 / fast. Off still re-encodes to preserve accurate cuts; it is not lossless. Dimensions are preserved except padding an odd dimension by one pixel for H.264 compatibility. Compression can increase file size.

One source and one output are in the worker FS at a time, removed after each clip. Worker termination cancels the active encode; replacing a source/clearing results/unmounting revokes preview URLs. MP4 download URLs expire after 60 seconds. Partial completed clips remain available after cancellation. ZIP bundling uses STORE, as MP4 is already compressed.

Safety caps are 256 MiB source, 500 planned clips, 512 MiB aggregate outputs, 256 MiB per ZIP. These are conservative guards, NOT benchmarked device limits. Browser OOM can still happen below them. Source bytes are copied into WASM for each clip; long recordings may be slow. Mobile, Safari, Firefox, VFR, unusual codecs, damaged media and long files require further validation.

## Setup and checks

Node 24 is required for dependency-free TypeScript tests. Run:

```
npm install
npm run lint
npm run typecheck
npm test
npm run test:media
npm run build
npx playwright install --with-deps chromium
npm run test:browser
```

Use npm install to reconcile added dependencies with the original bootstrap lockfile. Frozen npm ci is not yet verified; regenerate and commit the lockfile when registry access is available. Native FFmpeg/ffprobe and unzip are required for integration/browser checks. Playwright starts the built Next server. The browser test processes a generated 35-second MP4 into a 30-second balanced export, checks HTML video playback, downloads/probes MP4 and checks the downloaded ZIP. It must pass before claiming browser functionality verified.

## Licensing

FFmpeg core is distributed under GPL v2-or-later; its libx264 encoder is GPL. Preserve FFmpeg notices and provide corresponding source/build instructions when distributing WASM: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core and https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/build . Audit the exact core release and its bundled codecs before public release. @ffmpeg/ffmpeg is MIT; JSZip is MIT or GPLv3. No paid API is used.

## Evidence in this environment

- Four planner/validation/command tests pass with Node 24, using test isolation disabled because the sandbox disallows Node's test subprocess behavior.
- Native FFmpeg was invoked directly from the shell. A generated 35s H.264/AAC 320×180 30fps source, GOP 300, was cut from 1.25 to 31.25 seconds using Balanced arguments. ffprobe reports 30.000s MP4, H.264 video, AAC audio, 1,255,085 bytes. Video begins at 0.033008s; audio at 0; this is within one 30fps frame. This verifies native command semantics, not WASM operation or perceptual audio sync.
- Node-based native integration initially failed with spawnSync EPERM in this sandbox. Direct shell FFmpeg succeeds.
- Dependency installation was blocked by sandbox networking; network-permission attempts were interrupted. Local build/lint/typecheck cannot run without Next, ESLint and TypeScript.
- Vercel project econtent-by-pcgh exists, but team access returned HTTP 403. Preview deployment requires authorizing the existing connection for that team.
- Browser/WASM processing, UI playback/download and ZIP have not yet been verified here. CI includes those checks; adding tests is not evidence they passed.

Additional direct native checks: compression Off produced a 30.000s H.264/AAC MP4 of 1,807,529 bytes, and decoded without error. A silent portrait 180×320 / 24fps input trimmed from 0.5 to 2.5 seconds produced a 2.000s H.264-only MP4, 46,069 bytes. Balanced and Off output timestamps differ by at most one source frame. No perceptual listening or actual browser playback was performed.

GitHub write integration successfully published the implementation to dev/browser-processing-mvp. The first GitHub Actions run installed dependencies and passed lint, then failed on browser DOM types. Generated public FFmpeg declarations are now excluded from app typechecking, and the adapter uses an explicit worker contract to isolate worker ambient types. Subsequent CI results must be checked.
