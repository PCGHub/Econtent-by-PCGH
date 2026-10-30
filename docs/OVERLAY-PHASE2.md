# Phase 2 studio integration and recovered workspace

The original `/workspace/Econtent-by-PCGH` workspace and `integration/overlay-phase2`
branch were recovered intact. Foundation commit `e308149` and its uncommitted UI,
tests and millisecond timeline fix were preserved in checkpoint `3187592` before
further changes. The migration filename was aligned to its already-applied hosted
version; its SQL contents did not change. No workspace reset or project reconstruction
was performed.

The Phase 2 v0 UI at `50014346b564f8d9a944dff36bab6caa067d7d14` was inspected and
integrated selectively. Its placeholder rendered flag was replaced by the working
composition engine. Existing cutter processing, caching, Auth and composition workflows
remain covered by regression tests.

## Text, audio and timeline

Up to eight timed text clips support content, font size, color, horizontal/vertical
position, bold and italic. Canvas rasterization produces transparent PNGs for both live
preview and FFmpeg composition, avoiding an unverified drawtext/font dependency. Unicode
uses the browser's available fonts. Font size is relative to a 360-pixel short edge and
scales with selected output resolution. Rendering uses half-open intervals; visible
video boundaries are quantized to the selected output frame rate.

Up to four music/narration clips use local MP3, WAV or another format that both the
browser and pinned core can decode. Each has start/end, source offset, volume and mute.
Main and secondary video audio can be muted independently. Source ranges are checked;
FFmpeg seeks and reads only the selected audio interval, delays it onto the output
clock and pads gaps with silence. Mixed MP4 audio uses a limiter with headroom. Live
browser mixing is an interactive approximation; the rendered MP4 is authoritative for
final audio, including limiter behavior.

The multitrack timeline selects, moves, trims and seeks actual composition state.
Pointer movement is rounded to milliseconds to prevent floating-point noise in editable
fields. Moves preserve duration; a left audio trim advances its source offset. Invalid
ranges are rejected or bounded to the project/source. Numeric fields also allow exact
editing. Zoom is saved as timeline metadata.

## Real rendered preview and lifecycle

Render Preview runs the real pinned browser FFmpeg runtime and creates a verified,
playable H.264/AAC MP4 Blob with normal video controls. Export reuses that output when
settings and File identities still match. Changed settings or media mark the render
outdated, hide completion status for the new state and disable its download. No live
DOM preview is represented as an encoded file. Repeated unchanged renders are verified
to avoid encoding again and produce byte-identical downloads.

Inputs are mounted read-only where available, including bounded text/music track mounts.
Temporary mounts and files are removed after processing. Source URLs and music elements
are released on removal/unmount. Existing FFmpeg startup, verified Cache Storage,
progress, worker guard, cancellation and fresh-worker recovery remain in use. Composition
still requires encoding; it does not have Fast Cut stream-copy performance.

## Drafts, privacy and preserved configuration

The existing development migration `20261030081454_phase2_studio_tracks.sql` adds one
nullable `studio_tracks` JSONB column to the authorized `econtent-dev` database
(`wumkmbyohzxtxoovoaeb`). This recovery does not reapply or alter it. Existing composition
JSON remains backward-compatible. Owner policies, forced RLS, identity grants, Auth and
revision checks remain intact. Track metadata has strict server validation and bounded
JSON request/storage sizes (32 KiB request limit; 24 KiB track JSON).

Drafts store text/style/timing, timeline zoom, volume/mute settings and original music
file size/SHA-256 metadata. Source videos, photos, music and exports remain local. Each
music source must be reattached and fingerprint-verified on reopening, along with the
existing main/layer reattachment workflow. Older cutter and two-layer projects remain
supported. No secret/service-role key is introduced and no source media is uploaded.

## Verification and limits

Checks: lint, TypeScript, build, unit tests, native media tests, browser regression suite,
local real Auth/PostgreSQL/Mailpit account suite and the 22-case import matrix. Phase 2
browser checks measure actual exported frames and decoded PCM at active/gap timestamps,
text raster visibility, original-audio muting, rendered-file identity/reuse, invalidation,
pointer dragging/trim handles, bounds rejection and seeking. Native tests also mix four
loud overlapping clips and check decoded peaks remain below clipping.

Account tests cover text/style/music restoration, debounced saving, duplicate preservation,
wrong-music rejection and export after reattachment, alongside existing authentication,
recovery, session, CRUD and cross-user ownership tests. They use the disposable local
stack, not hosted mail recipients. Hosted email delivery and redirect allowlisting on
a new Preview hostname are separate from those local test results.

Real Android hardware is unavailable. Desktop Chromium and mobile viewport checks do not
establish Android performance. Processing retains the 256 MiB combined-input safety cap,
64 MiB per audio file and device output budget; memory exhaustion is still possible.
Fonts depend on the current browser/device. The track limits are intentional; unlimited
tracks, AI generation and advanced effects are outside this phase.

## Recovery verification results

- Lint, TypeScript and a fresh production build passed.
- 56 unit tests passed; six native media tests passed.
- All 17 browser regressions passed serially against the same build, including
  timed text/music output, render identity/invalidation and actual pointer/trim/seek
  interactions. The millisecond dragging fix is verified.
- All four real local account regressions passed, including Phase 2 metadata autosave,
  duplicate, reopening, wrong-music rejection and verified audio reattachment/export.
- The 22-case pinned WASM import matrix passed: 20 real exports and two explicit
  unsupported-format rejections.
- Read-only hosted checks confirmed `20261030081454` is applied and project RLS remains
  enabled and forced. Recovery did not modify hosted Auth settings or migration SQL.
- The new Preview branch uses the same existing authorized public Supabase URL/key,
  scoped to Preview only. Existing branches and production environment variables were
  not changed. Hosted email callback allowlisting for its new origin is not changed
  by this recovery; it remains separate from local Auth tests.
