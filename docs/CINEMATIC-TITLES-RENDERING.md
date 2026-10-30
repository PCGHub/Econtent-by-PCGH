# Cinematic Titles Studio — browser rendering integration

Base: verified frontend `70c7b33fd8e98ddc778947602befc9f2cf041abc`, itself based on
workspace `448d81bc3b64c22215122fac523df4ba27cf7532`.
Branch: `integration/cinematic-titles-rendering`. Route: `/titles-studio`.

## Rendering and playback

`lib/titles/raster.ts` is shared by the live canvas and encoded frames: wrapping,
tracking, font size/weight, outlines, shadow, background rectangles, normalized
position/size, rotation, gradient, vignette and deterministic grain. It calls the
same `sample()` timing model for fade, slide, zoom, typewriter, word reveal, letter
reveal and credit roll. Word/letter reveal keeps layout fixed as glyphs appear.
Credit speed is canvas-height percent per second. Names/roles are editable lines;
reorder lines to reorder credits. “Fit complete credit roll” computes a speed that
lets the final line clear the canvas. Export fails clearly if the roll would be
cut short. Extend its interval or reduce text/font size if the required speed is
above the control limit. Text intervals remain half-open.

Scenes join with **hard cuts**. No unsupported crossfade or transition is silently
substituted. Scene boundaries are quantized once on the global frame grid, so
rounding does not accumulate across scenes. Output can extend the requested total
by less than one frame. System fonts are drawn in this browser, so fonts/wrapping
can differ across devices; no new font or external asset downloads are introduced.

`BrowserTitlesRenderer` uses the existing `FFmpegTransport` and `WorkerGuard`.
It does not replace or modify `lib/video/` or Overlay composition processing.
The pinned versioned same-origin FFmpeg startup/core/cache/integrity path is reused.
One worker is retained for subsequent title renders; cancellation/failure terminates
it and retry creates a fresh worker. Download, compile and initialization diagnostics
are reported separately from frame drawing, encoding, muxing and validation.
The pinned core's documented successful ffprobe `ret=-1` behavior is accepted only
with fresh parseable metadata and required codec/dimension/duration checks.

For each frame, browser-native image/video decoding provides the background and
canvas paints the complete composition. Videos seek to the exact sampled scene
clock; a short video either loops explicitly or holds its last frame. Rendering
requires a background this browser can decode. It fails rather than omitting a
missing/unsupported image, video or effect. Convert an incompatible source with
the existing Cutter first. Uploaded files remain on-device.

PNG frames are transferred in bounded batches (at most one second and an estimated
16 MiB uncompressed raster working set), encoded to H.264/yuv420p with libx264,
ultrafast, CRF 20, then deleted immediately. Encoded batches are concatenated without
re-encoding video. One background decoder is active at a time; previous scene media is released.
Background video audio uses read-only WORKERFS mounts and explicit
per-scene volume; mute is zero. Audio is normalized to stereo 48 kHz AAC. Silent
scenes contain silent AAC, short non-looped audio is padded, and loops are explicit. Positive source audio
offsets are preserved. Looped audio is padded to the native video cycle duration
before repeating, so initial silence repeats in sync with the video.
The final result must pass pinned-core MP4 H.264/AAC/dimensions/duration checks.

Render Preview is a real temporary MP4 with standard controls. Download/Export
reuses the identical validated Blob if document and local media identities match.
Changing settings or media invalidates/revokes the output and cancels an active
render. No stale or partial MP4 is accepted. Workers, mounts, frames, canvas buffers,
media elements and Blob URLs have explicit cleanup.

## Budgets and progress

Default is explicitly shown as **480 px short edge / 24 fps**, with 360, 720 and
1080 px and 30 fps selectable. Nothing is silently downscaled during a render.
Initial guardrails: at most 2,880 frames, 1.8 billion frame-pixels, 96 MiB retained
encoded batches/final output, and the existing 256 MiB combined local media budget.
Large projects must be shortened or rendered separately. These are conservative
resource budgets, not promises of device memory use or guaranteed completion time.

Progress reports actual frames drawn and **completed encoded batches**; muxing and
validation are indeterminate. FFmpeg startup displays received/total asset bytes
when measured. Elapsed time is a clock, not an ETA. Cancel is available throughout
rendering. Keep the tab foregrounded; browser scheduling and memory pressure can
interrupt local work. Animated encoding does not have Fast Cut performance.

## Metadata persistence — approval gate

Titles drafts use a separate versioned `TitlesDraft`: document plus local background
fingerprints/name/dimensions/duration/type/size. No File, Blob URL, media bytes or
credentials are persisted. Parsing and byte/range/geometry/enum validation run on
both client and server. Existing authenticated project CRUD, revision conflict
checks, owner predicates and RLS are reused. Saved title projects reopen at the
existing `/projects/:id` URL. First save is explicit; subsequent edits debounce at
1.2 seconds. Reopened backgrounds must be reattached; SHA-256, size, dimensions,
duration and type are verified. Replacing a background requires an explicit choice.

The required additive SQL is **proposed, not applied**:
[20261030195314_cinematic_titles_drafts.sql](proposed-migrations/20261030195314_cinematic_titles_drafts.sql).
It adds a nullable `titles_draft` JSONB column (32 KiB database limit; application
metadata is capped at 24 KiB), a shape/size/exclusive-tool check and authenticated
column grants. It changes no Auth setting, credential, owner policy or existing
project. It is outside the auto-apply migration folder until owner approval.

Before approval, existing cutter/overlay project reads/writes continue against the
old schema; Titles save fails clearly with no partial project. Application
projections accept absent nullable future metadata, and legacy writes omit the new
column. Full real Titles save/reopen/RLS tests remain gated on applying this SQL to
the disposable test database, then the explicitly authorized Econtent development
project. No production migration is authorized.

## Verification and limitations

Tests use actual pinned FFmpeg WASM in Chromium and native ffprobe/ffmpeg to inspect
and decode downloaded MP4s. They cover four ratios, deterministic animation/export
frame comparison, multiple image/video scenes, timed silence/audible source audio,
looping, cached download byte identity, edit invalidation, cancellation and retry.
Existing unit/native/browser/account regressions cover Fast Cut, conversion, ZIP,
Overlay export, direct manipulation, text/music, auth and saved cutter/overlay drafts.

Local smoke measurement: a 1-second 640×360/24fps opening, including cold worker
initialization, output validation and download, took approximately 2.2 seconds on
the cloud desktop Chromium test environment. This is a synthetic smoke benchmark,
not an Android speed claim. Per-channel mean absolute pixel error at t=0.25s was
3.13–3.40/255 between resized live canvas and lossy H.264 frames for the seven presets.

Real Android hardware is unavailable. Mobile checks use Chromium touch/viewport
emulation. Android speed/memory, Safari/Firefox, long projects, complex-script font
shaping, unusual media timestamps and hosted email-link flows need broader testing.
Scene transitions, a standalone music track, title undo/redo and server rendering
are outside this integration; background-video audio is supported. The original
Cutter/Overlay functionality and hosted security configuration are preserved.

Local validation: lint, TypeScript and production build passed; 64 unit and eight
native media tests passed. A full 29-case browser run passed before the final audio
loop/memory refinement; the final eight focused Titles checks passed afterward.
All six local account checks passed on rerun: five exercise existing real Auth,
project and RLS flows; the sixth verifies the Titles migration gate and no partial
row creation. Real Titles cloud save/reopen/RLS is **not** claimed as verified.
One initial account run hit a transient duplicate-element assertion during Overlay
route hydration; the unchanged test passed in isolation and in the complete rerun.
Hosted read-only inspection confirmed owner RLS is enabled/forced and the Titles
column is absent. No hosted schema or Auth settings were changed.
