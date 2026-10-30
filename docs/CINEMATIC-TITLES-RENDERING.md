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

## Metadata persistence — approved development migration

Titles drafts use a separate versioned `TitlesDraft`: document plus local background
fingerprints/name/dimensions/duration/type/size. No File, Blob URL, media bytes or
credentials are persisted. Parsing and byte/range/geometry/enum validation run on
both client and server. Existing authenticated project CRUD, revision conflict
checks, owner predicates and RLS are reused. Saved title projects reopen at the
existing `/projects/:id` URL. First save is explicit; subsequent edits debounce at
1.2 seconds. Reopened backgrounds must be reattached; SHA-256, size, dimensions,
duration and type are verified. Replacing a background requires an explicit choice.

The approved proposal
[20261030195314_cinematic_titles_drafts.sql](proposed-migrations/20261030195314_cinematic_titles_drafts.sql)
was applied unchanged to `econtent-dev` (`wumkmbyohzxtxoovoaeb`) after compatibility
checks and a successful disposable-database account run. Supabase recorded version
`20261030220115`; the active repository migration
[`20261030220115_cinematic_titles_drafts.sql`](../supabase/migrations/20261030220115_cinematic_titles_drafts.sql)
matches that history. The archived proposal and active migration are byte-identical.

It adds a nullable `titles_draft` JSONB column (32 KiB database limit; application
metadata is capped at 24 KiB), a shape/size/exclusive-tool check and authenticated
column grants. No Auth setting, credential, owner policy or existing project changed.
Both existing hosted rows retained the exact original-column digest
`918f40f44bd4bb827b724f156294096e`; both new fields are null. Owner RLS remained enabled
and forced; policy digest `efcc5af3464eb661172f11b2a4326e03` was unchanged. All existing
constraints and the new constraint are validated. Anonymous SELECT on the column
is denied; authenticated INSERT/UPDATE grants are present. No production or other
Supabase project was modified.

The account regression now requires a successful Titles save rather than accepting
the migration gate. It checks saved reopening/editing/autosave, exact local media
reattachment, cross-account API denial and **direct authenticated PostgREST** SELECT,
UPDATE and DELETE denial. Malformed Titles JSON must fail the database constraint.
The unchanged application continues to fail clearly if deployed against a database
that has not received the additive migration.

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

Local validation: lint, TypeScript and production build passed, with 64 unit tests,
eight native media tests and the full 30-case browser suite. All six real local
account regressions passed after the approved migration, including the full Titles
path. The strengthened direct-PostgREST Titles isolation test also passed. Existing
Cutter/Overlay and Auth behavior remains covered.

## Hosted browser verification without permanent CA changes

`scripts/verify-titles-preview-isolated.mjs PRIVATE_CONFIG_JSON` launches a disposable
read-only container using existing system browser/libraries. The private JSON file
contains `{origin, shareUrl}` for a verified immutable Econtent Preview deployment;
never commit it. No password or service-role key is used. Temporary Vercel share
access remains limited to that Preview. The browser is limited to two CPUs and
2 GiB RAM; this is cloud desktop testing, not Android hardware.

The supplied environment CA is imported **only into the container's tmpfs NSS
store**. No host/browser permanent trust store is mounted or changed. The container
uses `--rm`; its browser profile, local files, generated negative-control certificate
and temporary trust store disappear on exit. TLS checking stays enabled, and an
untrusted local self-signed HTTPS certificate must be rejected before testing the
Preview. Host NSS certificates were checked unchanged afterward.

The isolated browser verified TLS 1.3, Titles UI HTTP 200, actual FFmpeg loading,
real MP4 rendering/playback/download with native H.264/AAC validation, login cloud
configuration, protected Projects navigation, completed Cutter Fast Cut and mobile
drawer/layout behavior. A synthetic one-second 640×360 title rendered in about
4.9–5.4 seconds including cold startup in this container; no mobile-speed promise.

These hosted browser checks are guest/account-configuration checks. Actual
**hosted authenticated two-user writes** are not claimed: the connected SQL tool
declined a rollback-only role-simulation test without providing a reason. That test
did not run; no existing user was impersonated and no test row was created in the
hosted database. Real authenticated save/reopen/edit and cross-user database checks
were performed on the disposable local Auth/PostgreSQL stack; hosted policies,
grants and row preservation were checked separately.

The hosted security advisor reports no RLS finding. Its unchanged Auth warning is
[leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Auth settings and billing were left unchanged.
