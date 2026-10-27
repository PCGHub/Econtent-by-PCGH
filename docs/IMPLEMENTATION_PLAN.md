# Autonomous implementation plan for Codex

This is an actionable backlog, not a completion report. Follow `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md` and `docs/PROJECT_TREE.md`.

## P0 — Audit and bootstrap
- Inspect `v0/econtent-frontend` and verify working directory and GitHub remote.
- Preserve white/blue brand, accessibility and current landing page.
- Run `npm install`, `npm run lint`, `npm run build` (or existing package manager). Record results.
- Fix actual errors. Create a minimal test runner and CI checks; do not mix lockfile package managers.

## P1 — Core media domain
- Wire `types.ts`, `validation.ts`, `planner.ts`, `presets.ts`, `engine.ts` into the editor.
- Implement file input, metadata extraction, Blob URL preview, clear invalid-input errors.
- Test split-plan edge cases including exact multiples, shorter remainder and section boundaries.

## P2 — Working FFmpeg engine (critical)
- Select compatible `@ffmpeg/ffmpeg` and `@ffmpeg/util` versions, check licenses and worker/asset packaging.
- Lazy-load WASM; validate CORS/isolation requirements on local and Vercel Preview.
- Implement accurate single-range trim; optionally apply compression; export a real playable MP4.
- Wire real progress/cancel/failure states; dispose WASM virtual files and object URLs.
- Verify video/audio using actual sample files and `ffprobe` if available.
- Never claim complete before this works in a browser.

## P3 — Full free editor
- Entire-video and selected-section consecutive splits with all presets/custom seconds.
- Keep/discard final shorter remainder; correct numbering and clip metadata.
- Compression-only path, high/balanced/small presets, compression off.
- Clip previews, selected clip downloads, all-clips ZIP, renaming.
- Handle memory pressure and cancellation honestly.

## P4 — Quality and deployment
- Unit/integration/e2e tests, error paths, no-audio and variable frame rate.
- Responsive/mobile usability and keyboard accessibility.
- Deploy **Preview only** to authorized Vercel project. Verify URL and actual browser workflow.
- Push commits to development branch. Do not merge main or deploy production.

## Reporting template
- Branch and commit SHA
- Implemented functionality
- Tests executed (pass/fail/blocked)
- Real media file verification (duration, codec, audio)
- Browser/device limitations
- Preview URL or precise deployment blocker
- Remaining work, ordered by severity

**Execution authority:** Codex may continue through P4 autonomously. Approval only for production, billing, unrelated repositories, or access/security exceptions.
