# Issue #1: person segmentation and background export

## Original Issue #1 cause

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

## Body-aware detection and fail-closed export

The old selfie model could produce plausible foreground coverage while dropping an
arm or leaving a hole through a torso. Coverage alone cannot establish person quality.
The current implementation uses pinned **MediaPipe Pose 0.5.1675469404, full model**
(`modelComplexity: 1`) for body segmentation and 33 body landmarks in one inference.
Inspection of its actual Chromium result confirmed the same red/alpha contract:
foreground `[255,0,0,255]`, transparent background, G/B zero. Alpha remains the confidence
channel. No dilation, invented limbs, previous-frame silhouette blending or opaque
original fallback is used. Default mask threshold is 0.5, with adjustable smooth edges.

`quality.ts` checks the **final refined mask**, not just a detector score:

- Confident visible body anchors must be retained, as must sampled limb segments.
- Interior torso samples must not contain substantial holes or low opacity.
- Uncertain centrally located body landmarks, excessive uncertain raw alpha and
  insufficient foreground/background separation reject the frame.
- Sudden coverage loss with stable body position or large tracking jumps reject the
  frame; a seek resets temporal comparisons rather than pretending it is movement.
- Out-of-frame joints are not required to appear in the cutout.

A failed tracked result gets at most one detector reset and re-evaluation of the
**same frozen source frame**, with identical quality requirements. A successful
reacquisition can recover tracking drift; a second failure blocks/aborts export.
The detector proposal threshold is 0.5: 0.7 rejected a real close-up portrait before
landmark inference. This does not relax the independent visible-body checks.

Preview shows candidate masks and the exact failure reason so users can inspect
problems. Export checks EVERY encoded frame and aborts at the first unresolved
failure, reporting the source timestamp. Encoder/muxer cleanup discards all partial
output. There is no "export anyway" override, interpolation over bad frames, or
successful download for an aborted run. Reattach/seek to a clearer frame, adjust
mask settings if appropriate, or retry; green-screen sources can explicitly use
chroma key. Retrying cannot make truly occluded anatomy recoverable.

These are **conservative consistency checks, not proof of pixel-perfect segmentation**.
Pose and segmentation share a model. A confident semantic error can still escape
checks; fine hair/fingers and small edge defects are not exhaustively assessed.
The supported workflow targets one clearly visible person. Occlusion, tightly cropped
portraits, multiple people, camera cuts and fast/blurred action may be rejected. A
valid frame elsewhere in the clip cannot override an invalid export frame.

## Same-origin model delivery

The build copies only the full model, graph, detector and SIMD/non-SIMD runtimes to
`/segmentation/pose-0.5.1675469404/` with SHA-256 manifest and Apache license notice.
The browser chooses one runtime; lite/heavy models are not copied or downloaded.
The SIMD path totals approximately **16 MB** before HTTP compression (one-time
versioned, immutable-cache assets). There are no runtime CDN model requests or media
uploads. Settings edits reuse the model. The full-body model is larger and more
expensive than the former roughly 6.27 MB selfie model; it is not a speed improvement.
Script, initialization and per-frame timeouts remain distinct, and Retry disposes the
old instance. Actual Android GPU, thermal and memory behavior needs hardware testing.

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

## Current body-aware verification

- Six new unit cases exercise complete bodies, missing wrists/forearms, torso
  holes, uncertain/invalid landmarks and raw alpha, cropped-out joints, and
  temporal coverage collapse. They verify that no body pixels are invented.
- Real Pose output on a full-body, extended-arms-and-legs photo passed all 17
  visible anchors and 8/8 limb segments. A local two-second 720×480 sequence exports
  24 frames at explicitly selected 12fps. FFmpeg decodes the WebM; pixels on both
  arms and both legs retain the person while a corner contains only replacement blue.
- Silent WebM container duration from this muxer can report the last frame's
  **start** timestamp (1.916s for 24 frames at 12fps); all 24 frames are present.
  This metadata rounding is distinct from dropped frames or wall-clock drift.
- The six-second real moving 9:16 portrait exports VP8/Opus and passes decoded
  foreground/replacement checks at 1, 3 and 5s. Speech correlation is 0.99953 at
  0ms measured lag. A tracked spurious wrist was caught at 0.708s; bounded
  same-frame detector reacquisition recovers it without relaxing quality checks.
- A real person followed by a blank interval aborts mid-export with the source
  timestamp and no download/partial-success link. Seeking back to the clear person
  restores preview readiness. Blank-only inputs remain blocked after Retry.

Validation summary for this change: production build, TypeScript, scoped ESLint,
91 unit tests and 8 native media tests pass. The broader browser run passed 10
cases and exposed one touch-cancellation layout failure (the three-minute stress
case was skipped). Per-seek diagnostic clearing was moving Cancel. The correction
keeps the last completed diagnostic visible during export while invalidating
internal frame state normally; final failures still publish immediately. After
rebuilding, the four affected positive-export, touch-cancel, person-loss and chroma
cases all pass. All 11 selected distinct browser cases have passing verification,
including two unchanged Cutter/FFmpeg regressions. The full-body case was exercised
with its optional fixture in the broader run; it was skipped in the targeted rerun.
The old three-minute exporter stress result below was **not rerun with Pose**.

The optional full-body fixture is the MediaPipe sample image at
https://storage.googleapis.com/mediapipe-assets/pose.jpg, retrieved into a disposable
local test directory only (not bundled with the application or committed). Use
`full-body.mp4` generated as below with this fixture, or an appropriately licensed
replacement and update its pixel-coordinate assertions. This test photo is not a
motion/action benchmark. The user's original action movie was not available; a
screenshot cannot establish segmentation quality or rejection over its video frames.
Real Android hardware is unavailable. No claim of perfect person detection is made.

## Historical exporter verification (previous selfie model)

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
codec, thermal or memory behavior. The historical long-export timings are not benchmarks for the new full-body model.
Expensive encodes can take substantial time on mobile.

### Reproduce

```
npm ci
npm run typecheck
npx eslint components/ai-studio/background-studio.tsx lib/background scripts/prepare-segmentation.mjs tests/background.test.ts tests/person-quality.test.ts tests/e2e/background.spec.ts
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

Optional full-body check (fixture is test-only; no application media upload):

```
ffmpeg -loop 1 -i pose.jpg -t 2 -vf scale=720:480 -r 12 -c:v libx264 -pix_fmt yuv420p full-body.mp4
ECONTENT_BACKGROUND_FIXTURE_DIR=/absolute/test/directory ECONTENT_BACKGROUND_FULL_BODY=1 ECONTENT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser -- background.spec.ts
```

Repository-wide lint reports pre-existing errors in the other AI studios,
Transcription Studio, multitrack editor and WorkspaceShell. These files are outside
the Issue #1 fix. No authentication, Supabase schema/credentials, billing, production
or other repository changes are required.
