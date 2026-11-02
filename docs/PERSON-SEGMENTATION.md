# Issue #1: person segmentation and background export

## Confirmed cause

The pinned `@mediapipe/selfie_segmentation@0.1.1675465747` produces a red/alpha
texture, **not a grayscale RGB confidence mask**. Actual Chromium inspection of
MediaPipe's ordinary-background portrait fixture found:

- Foreground centre: RGBA `[255, 0, 0, 255]`; background corner: `[0, 0, 0, 0]`.
- R: 0–255, mean 139.56; G/B: entirely 0; alpha: 0–255, mean 130.74.
- The mask was an 820×1024 ImageBitmap. With ImageBitmap/OffscreenCanvas disabled,
  the SDK uses an HTMLCanvasElement result instead.

Averaging RGB caps foreground confidence at **1/3**, below the old 0.55 threshold.
The foreground therefore disappears. The old empty/full-mask fallback then draws
an opaque original over the replacement, causing the opposite reported symptom.
Canvas alpha unpremultiplication also makes red saturate at 255 even where alpha
is fractional; red is not a reliable alternative confidence channel.

## Fix

`lib/background/renderer.ts` snapshots **both** callback image and alpha mask
synchronously in `onResults`. It never retains SDK-owned image/canvas references.
Input frames are bounded to 720px on the longest edge. Original/mask snapshots
remain paired; seeks invalidate in-flight results by epoch. The renderer waits for a presented
video frame, with a guarded two-paint-turn fallback after seeked/loadeddata for
paused or offscreen videos that omit frame callbacks. It never samples the initial
undecoded black frame as a completed preview. ImageBitmaps are closed
after copying. Paused frames are processed, including after a seek, and background,
threshold and softness edits redraw owned snapshots without reloading the model.

`mask.ts` turns alpha confidence into a smooth threshold. High-confidence pixels
remain fully opaque. A dedicated foreground canvas uses `destination-in`; that
foreground is then drawn over the already-loaded replacement. Source-over never
draws an unmasked original onto a composite. Invalid masks produce an explicit
error and block export. The explicitly labelled Original diagnostic view remains
available but cannot be exported as a composite.

Diagnostics include actual result representation/dimensions, source timestamp,
RGBA minima/maxima/means, exact foreground coverage, processed frames and inference
time. Playback/export notifications are throttled; paused edits refresh immediately.
The mask view displays raw alpha as grayscale, not an assumed RGB channel.

## Same-origin model delivery

The npm dependency and lockfile pin the exact inspected model version. The build
copies assets to `/segmentation/0.1.1675465747/` with an integrity manifest and Apache
license notice. Versioned assets use immutable HTTP caching. There are no runtime
CDN model requests or media uploads. The SIMD branch loads approximately 6.27 MB
(JS wrapper, SIMD runtime/WASM, landscape model and graph); the non-SIMD branch is
available for capability fallback. The browser selects one runtime. Settings edits
reuse the existing model. Script loading, initialization and frame-response errors
are distinct and a Retry action disposes the old instance.

## Export reliability

An actual initial stress test exposed a second problem: real-time MediaRecorder
captured a 180.02s source as 205.34s under software-GPU load. Wall-clock recording
cannot guarantee the source timeline while inference stalls playback.

The repaired exporter uses browser WebCodecs VP8/Opus and a WebM muxer with explicit
**source timestamps**. It seeks/processes one paired frame at a time, bounds encoder
queues, closes VideoFrame/AudioData objects and finalizes duration/seeking metadata.
It never buffers all video frames. Original audio is decoded locally only when
selected, encoded on the same timeline and padded with silence only where the source
has no more samples. It uses no microphone/camera permission or captureStream.
Cancellation discards partial output and closes encoders. Unsupported encoders or
audio decoding fail clearly; silent export requires the user's explicit selection.

Limits are visible in the UI: source duration up to 3 minutes (small container timing
tolerance), file size up to 64 MB, longest output edge 720px, default 24fps or explicitly
selected 12fps. Audio decoding retains a bounded whole audio buffer; stereo 180s at
48kHz is approximately 69 MB before other browser/model/encoder memory. Encoded
payload is capped at 64 MB. Browser GPU memory is additional and device dependent.
This is WebM export; it does not claim to be MP4 or Fast Cut. Existing FFmpeg and
MP4 workflows are unchanged. Export needs HTTPS/localhost and supported WebCodecs,
VP8 and (when selected) Opus; preview can still work without these encoders.

## Actual verification

- Real model: opaque face/torso and replacement simultaneously; raw alpha view,
  paused threshold editing, empty-mask rejection and fresh-model retry.
- Reusable-canvas fallback with touch/390px layout, seek to 1.500s, background Fit,
  cancellation, and successful explicit silent retry.
- Actual moving presenter: 9:16 360×640 clip with 16:9 replacement. Exported foreground
  and replacement checked at 1, 3 and 5s. Both picture and speech decode; 6.000s WebM.
- Speech waveform correlation 0.99953, measured best lag **0ms** over ±100ms search.
- Synthetic tone export: 3.000s, VP8/Opus, audio RMS 2886.43 (not an empty audio track).
- Three-minute stress fixture: looped six-second real presenter, 180.020933s source,
  12fps export, **180.020s** WebM, **34,769,446 bytes**, full FFmpeg decode. Test wall
  time about 5.4 minutes in software-rendered desktop Chromium; this is not an
  Android speed claim. At source positions 1, 90 and 174s, speech correlations were
  0.99955 / 0.99958 / 0.99938, each at 0ms measured lag over ±30ms.
- Unsupported encoder and damaged replacement image have explicit failures.
- Chroma key and explicit silent export remain separate from person detection.

The ordinary-video fixture is a public-domain White House weekly address, not user
footage. The stress recording loops its six-second excerpt; it is not a different
three-minute performance benchmark. Actual Android hardware is unavailable. Chromium
touch/mobile-layout and reusable-canvas tests do **not** establish real Android GPU,
codec, thermal or memory behavior. Hair/fast movements can still have segmentation
artifacts, and expensive encodes can take substantial time on mobile.

### Reproduce

```
npm ci
npm run typecheck
npx eslint components/ai-studio/background-studio.tsx lib/background scripts/prepare-segmentation.mjs tests/background.test.ts tests/e2e/background.spec.ts
npm test
npm run test:media
npm run build
ECONTENT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser -- background.spec.ts
```

Regular browser tests use the committed public-domain portrait to generate local
fixtures. Moving-video and long tests are opt-in; see `tests/fixtures/PERSON-LICENSE.md`.
Retrieve the referenced weekly address into a disposable test directory, then:

```
ffmpeg -ss 15 -i address.webm -t 6 -vf scale=640:360 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac presenter.mp4
ffmpeg -ss 15 -i address.webm -t 6 -vf 'crop=608:1080:656:0,scale=360:640' -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac portrait-presenter.mp4
ffmpeg -f lavfi -i color=c=blue:s=640x360 -frames:v 1 background.png
ffmpeg -stream_loop 29 -i presenter.mp4 -t 180 -c:v copy -c:a aac presenter-180.mp4
ECONTENT_BACKGROUND_FIXTURE_DIR=/absolute/test/directory ECONTENT_BACKGROUND_LONG=1 ECONTENT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser -- background.spec.ts
```

Repository-wide lint reports pre-existing errors in the other AI studios,
Transcription Studio, multitrack editor and WorkspaceShell. These files are outside
the Issue #1 fix. No authentication, Supabase schema/credentials, billing, production
or other repository changes are required.
