# Cinematic Titles Studio — frontend handoff

Branch: `feature/cinematic-titles-studio`.
Base: verified workspace commit `448d81bc3b64c22215122fac523df4ba27cf7532`.
Entry: `/titles-studio`, available to guests inside the existing WorkspaceShell.
The sidebar's existing Cinematic Titles entry is activated; Transcription stays Soon.

This milestone implements interactive frontend editing and browser-native live
preview. It does **not** implement rendered previews, MP4 encoding, cloud saving,
transcription or a new processing service. The two video-output buttons are disabled
and labeled accordingly. The design is an in-memory session draft; refreshing or
leaving the route clears it. Media is never silently uploaded.

## Implemented frontend

- Eight curated, editable templates: movie opening, production introduction,
  actor/character, scrolling end credits, cast/crew, dramatic reveal, documentary
  introduction and social animation. The initial project contains three scenes.
- Add/duplicate/delete scenes; reorder using drag/drop on desktop or up/down controls;
  edit scene name and duration. At least one scene remains. Limits: 12 scenes,
  1–120 seconds each, eight text layers per scene.
- Text content, browser/system font stacks, size, weight, color, alignment, tracking,
  line height, outline, shadow and background tint/solid. Drag with mouse/touch,
  resize with a corner handle or keyboard, rotate numerically and edit normalized
  position/size. The existing Overlay Studio DirectBox is reused without modification.
- Scene-local text start/end, entrance/exit and animation duration. Fade, Slide Up,
  Zoom In, Typewriter, Word Reveal, Letter Reveal and Credit Roll have actual timed
  DOM previews. Exit supports fade/slide/zoom/none. Credit speed uses percent of canvas
  height per second. Entrance/exit each use at most half the text interval. Intervals
  are half-open. Word/letter effects are limited to 240 characters; other text permits
  2,000. Unicode uses available browser fonts; font shaping varies across platforms.
- Solid/gradient backgrounds, two colors/angle, grain/vignette, local image/video,
  explicit Fit or Fill/crop, optional video looping. Without looping, the last source
  frame is held. Preview volume controls background video audio when it exists.
- Play/pause across scenes, previous/next, scene and project scrubbers, real timestamps,
  ratio-aware fullscreen and four ratios (16:9, 9:16, 1:1, 4:5). Animations sample the
  playback clock; the clock updates at about 30 fps using requestAnimationFrame.
- Scene sequence and movable/trimmable text bars, keyboard movement and exact numeric
  timing. Changing duration bounds all text intervals to the shorter scene.
- Desktop three-panel editor plus bottom timeline, using container queries so layout
  responds to available workspace space. Mobile preview-first layout and Scenes/Text/
  Animation/Background/Export tabs with the existing accessible workspace drawer.

## Code boundaries

| File/module | Responsibility |
| --- | --- |
| `lib/titles/model.ts` | Versioned serializable document types, normalized geometry, range edits, clock lookup and pure animation sampling. Includes the **type-only** future `TitlesRenderer` contract. |
| `lib/titles/templates.ts` | Template catalogue/factories; deterministic initial IDs avoid server/client hydration mismatches. |
| `components/titles/studio.tsx` | Editor state, scene commands, clock, selection and local media registry/lifetime. |
| `components/titles/canvas.tsx` | Browser-native composition and synchronized media preview; no FFmpeg imports. |
| `components/titles/properties.tsx` | Text, animation, background and explicitly unconnected export controls. |
| `components/titles/timeline.tsx` | Scene sequence, seeking, pointer/keyboard text timing. |
| `components/titles/studio.module.css` | Scoped layout and visual styling. The scoped form-font reset avoids changing existing editors. |

Coordinates and box dimensions are canvas fractions. Font/outline sizes use a
360-pixel short-edge reference. Rotation is around the text box center. The pure
`sample()` returns visibility/opacity, normalized Y displacement, scale, progressive
text and entrance progress. Credit displacement is relative to canvas height.
CSS grain is a fixed local SVG noise texture; vignette is a radial gradient.

`TitleProject` contains no File, Blob, browser URL, auth data or processing instance.
Backgrounds reference an asset ID. The frontend registry holds `LocalMedia` separately.
A future renderer receives a frozen document snapshot and `ReadonlyMap<assetId, File>`;
it must report actual stages/progress and respect AbortSignal. No renderer adapter or
fake processing result is supplied by this milestone.

## Local media and safety

The unchanged shared media reader checks browser decoding, dimensions and duration.
Its existing limits apply: images up to 16 MiB, videos up to 256 MiB and 16-megapixel
sources. Title background files are additionally capped at 256 MiB combined.
Duplicates reference the same local File/URL; removing the last reference revokes it.
Replacing/removing media and unmounting release URLs. Pending import is abortable.
Only browser-previewable media is accepted; conversion remains the existing Cutter's
explicit workflow. No FFmpeg worker or WASM download starts in Titles Studio.

## Rendering integration checklist — intentionally deferred

1. Validate untrusted/persisted document data before accepting imports or cloud drafts;
   current state is constructed internally by typed frontend controls.
2. Resolve/fingerprint local assets and require reattachment on reopening. Never
   serialize blob URLs or imply original files are available across devices.
3. Pin/license fonts and reproduce wrapping, tracking, outline, rotation, grain,
   animation sampling and credit positions in a real rendering adapter. Browser
   layout/native playback is an interactive preview, not evidence of MP4 parity.
4. Reuse the authorized cached FFmpeg runtime safely through a separate title-renderer
   adapter. Do not replace Cutter or Overlay composition processing.
5. Implement a verified H.264/AAC MP4 preview/export, cancellation, resource budgets,
   actual progress, output validation and render invalidation/reuse.
6. Test exported pixels and decoded audio at exact timestamps, especially across scene
   joins, looping/final-frame holds, word/letter effects and long scrolling credits.
7. Add saved-project integration only after schema/ownership review. This change adds
   no migrations, Supabase settings, auth changes or credential edits.

## Evidence and limits

Tests cover deterministic templates, scene/range boundaries and actual time sampling;
frontend browser checks cover scene CRUD/reordering, typography, typewriter timing,
playback, all ratios, touch dragging/resizing, rotation, drawer state, timeline pointer/
keyboard edits, image/video imports, volume/loop behavior, invalid media errors and
zero FFmpeg workers or upload POSTs. Disabled export buttons are explicitly verified.
Existing workspace/media/account regressions remain part of repository CI.

Local verification passed: ESLint, TypeScript, production build, 61 unit tests,
six native media tests, 26 Chromium browser regressions and five disposable local
account regressions. Account checks use the existing isolated test stack, not the
hosted Supabase database. The four Titles browser cases include desktop and mobile
touch emulation, not real Android hardware. A final focused rerun also verifies
replacing a duplicated scene's video and restoring the original shared source.

Real Android hardware, Safari/Firefox and encoded title output are not verified.
The browser-native video clock uses drift correction and is not a sample-accurate
final audio mix. Session persistence, undo/redo for titles, animation curves/keyframes,
asset libraries and cloud projects remain future work. Existing Overlay Studio undo/
redo and processing remain unchanged.

Screenshots: [desktop](screenshots/titles-desktop.png), [mobile](screenshots/titles-mobile.png).
