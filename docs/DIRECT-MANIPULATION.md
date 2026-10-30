# Overlay Studio direct manipulation

Based on verified `integration/overlay-phase2` commit
`040642a9531f93f4993766dea0db3a407506d2ac`. Dedicated branch:
`feature/direct-manipulation-editor`. Existing FFmpeg worker, versioned assets,
cache, cutter, audio filters, authentication and database migrations are preserved.

## Canvas controls

Click/touch an active text clip or secondary photo/video to select it. Drag to
position it; use the bottom-right handle to resize. Pointer capture and
`touch-action: none` on these targets keep gestures from scrolling or seeking.
Dragging pauses playback, keeps the current media time and commits once on release.
Pointer cancellation rolls back the temporary position. Arrow keys nudge a focused
layer; arrow keys on the resize handle resize it. Escape cancels a text/layer geometry gesture.

Text can move throughout the canvas and scales uniformly by changing its editable
font size. Secondary layers move/resize in Picture-in-Picture, selected explicitly
with **Free layer positioning**. Top & Bottom and Full Overlay retain their layout
constraints; dragging does not silently change them. Center guides snap within six
CSS pixels; the optional 5% safe-area outline and guides never enter exports.

Fit shows the whole source with black bars. Fill crops to the layer rectangle.
Reposition is available only after explicitly choosing Fill and adjusts the visible
crop focal point, including touch input. The existing even-pixel geometry still
drives both preview and FFmpeg. Changing a rectangle does not change the source's
aspect ratio: Fit/Fill defines how it fits inside that rectangle.

Positions are stored normalized, not as screen coordinates. Layer x/y are canvas
fractions. Backward-compatible text x/y are fractions of remaining space after
raster dimensions, ensuring the entire text rectangle stays inside the canvas.
Font size remains relative to a 360-pixel short edge. Screen resizing does not
change the saved layout.

## Text styling and output

Existing timed text fields remain editable. Additions: multiline alignment,
outline width/color, shadow, background color/transparent and rotation in degrees
(-180 to 180). Rotation is controlled numerically; video/photo rotation is outside
this change. Text rotates into a bounded transparent PNG; preview and actual MP4
use the same rasterizer. If text/rotation cannot fit, an explicit error requests
smaller text rather than silently clipping it. Fonts still depend on the browser.

Position-only text gestures reuse the PNG; styling/size changes rerasterize it.
Committed edits invalidate rendered MP4s through the existing composition signature.
Undo/redo retains up to 40 spatial/style changes, one per pointer gesture. It restores
matching layer geometry and text styles without rolling back text content, clip
timestamps, source references or audio edits. History is session-local; saved
projects preserve the resulting settings, not the undo stack.

## Persistence and privacy

Optional bounded text fields extend the existing validated `studio_tracks` JSON;
legacy text records remain unchanged and unknown fields remain rejected. Drafts using
new styles require this build or newer; older strict parsers cannot read the extra
style fields. The existing
metadata column and migration accept these nested fields: no new migration, hosted
Auth change, storage upload, service role credential or RLS change is needed.
Main/layer geometry continues in the existing `composition` metadata. Reopening
still requests and fingerprints local source files.

## Verification

New browser tests use actual mouse input and Chromium CDP touch input with mobile
viewport emulation. They exercise dragging, resizing, undo/redo, pointer cancellation,
no accidental seeking and explicit crop repositioning. Real WASM exports in 9:16,
4:5, 1:1 and 16:9 are fully decoded; measured colored pixel bounds are compared to
the live text/photo rectangles (2.5% tolerance for rounding, rotation and H.264).
Account regression tests save, duplicate and reopen normalized text positions and
styles through the real local Auth/PostgreSQL stack. Unit tests preserve legacy
parsing, reject invalid styles and ensure undo leaves timing/audio untouched.

Real Android hardware is unavailable. Emulated touch tests do not establish Android
performance or device-specific decoder/memory behavior. Composition still re-encodes;
no new speed claim or silent quality reduction is introduced.

Completed local checks: lint, TypeScript, production build, 58 unit tests, six native
media tests, all 19 browser regressions and all four real local account regressions.
The 22-case pinned WASM import matrix also passed (20 exports, two explicit
unsupported rejections). The final account test includes an actual pointer drag
before autosave, duplicate and reopening, plus restoration of styling and local
music fingerprint verification. No Android hardware result is claimed.
