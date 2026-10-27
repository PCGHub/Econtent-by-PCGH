# Econtent by PCGH — implementation architecture

Status: **proposed implementation blueprint**, not a claim of completed functionality. Read `README.md` for product requirements and `AGENTS.md` for Codex authority.

## System boundary

```text
User browser
  ├─ Next.js/React responsive UI (existing v0 landing + editor shell)
  ├─ Video input + metadata / preview via File, Blob URL, HTMLVideoElement
  ├─ Editor state + pure cut-plan generator + validation
  ├─ Media engine adapter (Web Worker + FFmpeg WASM where compatible)
  ├─ Output store (ephemeral in-memory blobs/URLs, resource lifecycle)
  └─ MP4 download / selected or all clips ZIP
Vercel Preview: serves static/client UI and WASM/worker assets, not video jobs
No backend, auth, database, paid APIs or external uploads for MVP
```

## Recommended modules (Codex may improve)
- `components/editor/`: upload, player, timeline, split controls, compression, job status, clip list, export.
- `lib/video/types.ts`: `SourceVideo`, `EditMode`, `CutRange`, `CompressionPreset`, `ExportJob`, `ProcessedClip`, `ProcessingStatus`.
- `lib/video/planner.ts`: pure deterministic split/range planning and remainder rules.
- `lib/video/validate.ts`: finite times, bounds, positive durations, supported media checks.
- `lib/video/engine.ts`: async processing interface with progress/cancel/cleanup; no React dependencies.
- `lib/video/ffmpeg-browser.ts` and/or `workers/media.worker.ts`: concrete browser processing.
- `lib/video/download.ts`: object URL lifetime, naming, single MP4 download.
- `lib/video/zip.ts`: stream/bundle selected clips if feasible with memory safeguards.
- `tests/`: planner boundary tests, processing fixtures and end-to-end smoke tests.

## Processing rules
- Time intervals are half-open `[start,end)`, measured in seconds; validate against actual duration.
- Full split: range `[0,duration)`; section split: `[selectedStart,selectedEnd)`; manual trim: exactly one selected range.
- For segment length `s > 0`, generate consecutive non-overlapping intervals. If final remainder is shorter than `s`, include it only when user chooses Keep. Exact multiples produce no extra clip. If section shorter than `s`, Keep yields one short clip; Discard yields none and explains why.
- Presets: 30, 45, 60, 90, 120, 190 seconds, plus validated custom positive duration.
- Prefer frame-accurate output; FFmpeg stream copy may cut only on keyframes, so re-encode when needed. Avoid implying compression-off always means bit-for-bit identical quality.
- Presets: Off, High Quality, Balanced, Smaller File. Choose documented codec/CRF/bitrate/resolution mappings and test them; output size can increase.
- Keep source dimensions/aspect ratio unless explicitly changed. Never upscale by default. Preserve audio when present; handle silent video.
- Export MP4 H.264/AAC when technically supported; do not label incompatible containers as MP4.
- Per-job states: idle, validating, preparing, processing, finalizing, completed, failed, cancelled. Progress is real or indeterminate, never fabricated.

## Browser and deployment constraints
- FFmpeg WASM can be large and memory-intensive; lazy-load only when processing starts. Verify compatibility with Next.js client boundaries and worker asset paths.
- Some FFmpeg builds require SharedArrayBuffer and COOP/COEP headers. Test deployment and cross-origin assets; choose single-thread build if cross-origin isolation cannot be configured safely.
- Don't claim universal mobile support; detect capabilities and communicate device limits.
- Avoid serverless execution timeouts by not running transcodes in Next.js route handlers.
- Dispose FFmpeg virtual files, revoke object URLs, and handle navigation/replacement/cancellation.
- Use strict TypeScript and accessible semantic controls. Preserve white/blue branding and responsive design.

## Acceptance evidence
1. Build, lint and typecheck succeed.
2. Planner unit tests cover boundaries and remainder logic.
3. A real sample MP4 with audio is processed, downloaded and inspected for valid duration and synchronized audio.
4. Compression-off and compression-on tested separately.
5. Multi-clip ZIP extracts and contains playable clips.
6. At least one browser smoke test confirms real UI interaction; disclose if unavailable.
7. Vercel Preview deploy status and exact URL verified, or blocker documented.

## Delivery order
Foundation/UI integration → one real 30s cut/compress/download → all cutting modes → ZIP → reliability/tests → preview deployment. Codex can work through these without requesting milestone-by-milestone approval, provided the guardrails in `AGENTS.md` are followed.
