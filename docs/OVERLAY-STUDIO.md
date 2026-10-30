# Video Overlay Studio integration

Base: verified FFmpeg commit `1575b143b30429430fa7b47cb2b67d5fa4c8ac26`.
The dedicated branch is `feature/overlay-studio-integration`. Only the three-file
Overlay Studio change from v0 commit `d54b1b2f13e05faa7b64b873b637a81fb2dbc30d`
was selected. A whole-branch merge would delete newer processing and account code.
The import/preview milestone was committed separately as `3ab935e`.

## Local editing and playback

`/overlay-studio` remains available to guests. Choose one browser-playable main video
and one secondary video or static PNG/JPEG/WebP photo. Sources are Blob URLs, never
uploaded. Main and secondary videos share a primary playback clock; seeking maps
output time to main trim start and secondary source start. The secondary layer pauses
outside its active interval and corrects drift above 80 ms. Browser seeking is limited
by available decoded frames; it is not a guarantee of exact frame stepping.

Layouts: Top & Bottom (adjustable split), Picture-in-Picture (bounded position and
size), Full Overlay. Aspect ratios: 9:16, 16:9, 1:1, 4:5. Fit/crop, crop focal points,
opacity, main trim and layer timing are editable. Photo duration is the layer's output
end minus start. Video layers must contain the selected source interval; they do not
silently loop or freeze. One shared even-pixel geometry function drives CSS rectangles
and FFmpeg filter placement. Black areas remain black outside the active layer.

The preview requires the browser to decode both selected videos. Unsupported native
preview formats show a precise conversion/reimport instruction linking to the existing
Video Cutter. This studio does not silently transcode a whole source to make a preview.
The cutter's independently verified broader import/conversion support is preserved.
HDR/tone mapping, animated photos, arbitrary tracks and effects are outside this phase.

## Composition rendering

Composition always re-encodes; it cannot promise Fast Cut stream-copy speed. The user
explicitly approves local H.264/AAC encoding. The default visible output choice is a
360-pixel short edge, with an explicit 720-pixel option and 24/30 fps. Output dimensions
are displayed before rendering. Encoding uses libx264 ultrafast, CRF 20, 8-bit yuv420p,
AAC 128 kbps where selected audio exists, MP4 faststart. Scaling and encoding are lossy;
there is no silent quality or aspect-ratio change beyond these selected canvas settings.

`BrowserVideoEngine.compose` shares the existing transport, pinned core, versioned
same-origin assets, SHA-verified Cache Storage, startup phases and worker guards. It
mounts each input read-only with WORKERFS. The main mount and inspection can be reused;
the secondary mount is removed after each render. Live preview video elements are
unmounted during export to release browser decoders and avoid parallel preview decoding. A bounded MEMFS fallback rejects
large secondary copies. Inputs use seek and duration before `-i`, then timestamp
normalization, fps, scale/crop/pad, timed overlay and optional audio filters. It decodes
the selected range and necessary preceding GOP, not the entire remaining source.

Audio choices: main, secondary, mix, mute. Nonexistent secondary audio is rejected
rather than silently substituted. Secondary audio is trimmed and delayed to the layer
interval, then padded to output length. Mix uses a limiter. Preview audio uses browser
mixing; exact sample-level limiter behavior is not simulated by the preview.

Progress uses actual FFmpeg media timestamps and the existing tracker. Loading,
encoding, finalization, cancellation and failure remain distinct; no guessed time or
percentage is added. Cancel terminates the worker and discards partial output. Retry
creates a fresh runtime, reusing valid cached WASM. Metadata validation checks expected
H.264/AAC tracks, yuv420p, dimensions, duration, start timestamps and output size before
creating a downloadable Blob. This is structural validation; automated tests additionally
render video frames and perform full native output decoding.

Limits: 256 MiB combined source bytes, 16 MiB photos, 16 megapixels per decoded source,
and existing device-dependent output memory budget. These safeguards are not a device
memory guarantee. Long/high-resolution compositions can still exhaust Android memory.
No Android hardware or device farm is available; mobile checks use desktop Chromium
with a narrow viewport and do not establish Android performance.

## Private account drafts

The existing `projects` table receives one nullable `composition` JSONB column through
additive migration `20261030005154_overlay_composition_metadata.sql`. Existing records,
Auth, owner policies and revision triggers remain intact. Only authenticated column
insert/update grants are extended. RLS remains enabled and forced. The authorized
hosted database is exclusively `econtent-dev` (`wumkmbyohzxtxoovoaeb`), organization
`yqdnnnhxkpjiskkwkfvt`, Ireland. No other project or production database is used.

Server validation allows only bounded settings and secondary source metadata/digest;
URLs, media bodies and unknown fields are rejected. Database constraints restrict JSON
shape, size, types, choices and project trim consistency. The existing 16 KiB request
limit, CSRF checks, verified-user requirement, ownership checks and revision conflicts
also apply. Rename/duplicate preserve composition metadata. Opening a composition
project chooses this studio; cutter projects retain their existing editor.

Save stores metadata only after the user requests a cloud draft. Subsequent edits use
1.2-second debouncing and the existing serialized save queue. Reopening requests both
original files and verifies size and full SHA-256 before accepting each attachment.
Filenames may differ if bytes match. Local exports are not stored in Supabase. Guest
editing and exporting do not require an account.

The CLI's migration creation command could not start because its telemetry attempted
to write to read-only `/home/agent/.supabase`; a local additive SQL file was created and
then aligned with the hosted integration-generated migration version. The same SQL was
first tested in the disposable local database; hosted schema/RLS was read back afterward.
No destructive migrations, policy weakening, billing or SMTP changes were performed.

## Verification and reproduction

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:media`, `npm run build`,
`npm run test:browser` and `npm run test:imports`. The native composition suite checks
actual output pixels before/during/after the overlay, layouts, image/video layers,
opacity, duration, codecs, audio timestamps, secondary-audio silence and full decode.
Browser tests verify local imports, synchronized playback/seeks, four aspect ratios,
mobile layout, actual WASM composition, playable downloads and cancellation/recovery.
Existing Fast Cut, loading/cache, broader codec and ZIP regressions remain in the suite.

`npm run test:account:setup`, build, then `npm run test:account` use only the disposable
local Auth/PostgreSQL/Mailpit stack. Tests cover real verification/recovery/session flows,
existing cutter projects and overlay create/save/autosave/duplicate/rename/reopen,
wrong-file rejection, restored export and two-user API/direct database isolation.
No cloud users or original media are created by this harness.

The hosted security advisor retains an existing [leaked-password protection disabled
warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection);
Auth configuration was not changed. Performance advisors returned no findings.
Hosted email redirect allowlisting for a new Preview origin must be checked separately;
local email tests do not prove delivery or redirect configuration on the new hostname.

## Integration validation results

- Lint, TypeScript and build passed; 55 unit tests and 5 native media tests passed.
- Full guest browser suite: 15 tests passed. Final overlay tests additionally cover
  PNG/JPEG/WebP, image/video in all three layouts, main/secondary/mixed/muted audio,
  preview decoder release during render, cancellation during a queued encoding
  operation and a fresh-worker recovery export.
- Full local account suite: 3 tests passed. Final focused rerun passed overlay
  autosave, duplicate/rename preservation, wrong-file rejection, exact reconnection,
  restored composition export, cross-user API denial and direct RLS isolation.
- Existing import matrix: 22 cases passed (20 actual exports, two explicit unsupported
  rejections). Core version, binary hash, download/cache implementation and timeouts
  are unchanged by the studio.
- The owner confirmed adding the new stable Preview callback URL to Supabase's
  allowlist while retaining existing settings. Hosted mail delivery is not claimed
  verified by the local Mailpit tests.
- Special anamorphic/orientation metadata and animated image sources have not been
  established by this fixture set; the verified cases use square-pixel SDR sources
  and static photos. Real Android hardware remains untested.
