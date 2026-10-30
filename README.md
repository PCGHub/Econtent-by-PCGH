# Econtent by PCGH

**Cut. Create. Transform.**

Econtent by PCGH is a web-based video cutting, compression and content-creation platform under development. The first release prioritizes **free, watermark-free video cutting, optional compression, previews and real MP4 downloads**. AI features are deliberately deferred until the basic workflow is proven.

> **Status: browser editor implementation in development.** The `dev/browser-processing-mvp` branch implements local FFmpeg processing and export workflows. See `docs/PROCESSING.md` for exact verification evidence and limitations; the checklist below remains the product acceptance specification.

## Product principles

- **User control first:** never automatically apply AI, compression, music or narration without selection.
- **Free core tools:** timed splitting, section splitting, manual trimming, basic compression and video downloads are free and watermark-free.
- **Real files, not JSON exports:** deliver playable MP4 clips and optional ZIP bundles. Internal metadata may use JSON, but the user's video export must not.
- **Privacy by design:** prefer local browser processing for MVP; do not silently upload footage.
- **Cost discipline:** no paid APIs, unnecessary backend infrastructure or production deployment without owner approval.
- **Separate product:** this repository is **PCGHub/Econtent-by-PCGH**, independent of ReelForge and the older Econtent repository. Do not change those or other PCGH projects.

## Initial target users

Creators, podcasters, educators, small businesses and everyday users who need to cut and compress video without complicated editing software.

## MVP scope (Phase 1)

### Upload and preview
- Drag/drop or choose a local video; show filename, size, duration and resolution.
- Preview original video with playback and seek controls.
- Start with **MP4 (H.264 video, AAC audio)** as the tested target. Other codecs and containers must be detected and handled honestly; do not promise universal support.
- Clearly communicate tested file-size, duration, browser and device limits. Avoid inventing limits before benchmarking.

### Cutting modes (all required)
1. **Entire video:** split sequentially into clips of the chosen duration.
2. **Selected section:** choose start and end (e.g., 05:00–10:00), then split *only that range* sequentially.
3. **Manual trim:** choose an exact start and end time and export that range.

Duration presets: **30, 45, 60, 90, 120, 190 seconds**, plus positive custom seconds. Validate all inputs and ranges. Users choose whether to **keep or discard the final shorter remainder**. Name clips in sequence and show their actual time ranges. Never pad or invent missing footage.

Choose **Fast Cut** for compatible H.264 with AAC or no audio in validated MP4/MOV, Matroska, FLV or MPEG-TS sources, remuxed to MP4 with compression Off. Other decodable audio can be explicitly converted to AAC while video stays copied. Its boundaries follow source keyframes and may differ from requested times; exported targets and durations are displayed. Choose **Precision Cut** for frame-accurate re-encoding. Compression selects Precision Cut. See [measured performance and progress behavior](docs/PERFORMANCE.md).

### Compression (optional, independent of cutting)
- Offer **Off**, **High quality**, **Balanced**, **Smaller file**.
- Permit compressing the original video **without cutting**, and compressing clips when cutting.
- Show original/output sizes and relevant encoding details when available.
- Compression is not guaranteed to shrink every source; explain this if it happens.
- Prefer H.264/AAC MP4 for broadly playable outputs. Respect source quality; upscaling cannot add detail.
- Where precise cut boundaries require re-encoding, prioritize correct cuts and synchronized audio over misleading "lossless" claims.

### Preview and export
- Preview each processed clip before downloading.
- Download one clip, a user-selected subset, or all clips as a ZIP.
- Export **actual playable MP4 files**, without watermark and without requiring registration for supported browser-local processing.
- Clear progress, cancellation, error recovery and temporary-resource cleanup.
- No silent external upload or persistence of source videos.

### Explicitly out of MVP
AI intelligent clipping, captions, background music, AI storytelling, AI voice-over, payments, subscriptions, accounts, server-side bulk processing, and automatic publishing.

## Suggested engineering architecture (subject to validation)

- **UI:** Next.js App Router, React, TypeScript, Tailwind CSS and accessible reusable components.
- **Frontend builder:** v0 by Vercel may produce initial UI code; **Codex owns integration, code review, functionality and tests**.
- **Processing:** evaluate FFmpeg WebAssembly / browser-local media APIs for MVP. Use a Web Worker where feasible to avoid blocking the UI. Check package licensing, browser isolation requirements, memory usage and codec support before selecting implementation.
- **Hosting:** Vercel preview for the frontend when authorized; do not run long FFmpeg jobs in ordinary serverless API routes.
- **Future:** dedicated processing workers, secure object storage and Supabase only if justified by tested needs. No Supabase project, keys or paid resources should be created as part of bootstrap.
- **Security:** validate files and media metadata, limit resource use, handle malformed inputs, avoid unsafe filename/path handling, sanitize displayed data and revoke object URLs/clean up temporary files.

### Proposed project structure (not yet created)

```text
app/
  page.tsx
  editor/
components/
  video-upload/
  video-player/
  cutting-controls/
  compression-controls/
  clip-gallery/
  export-panel/
lib/
  video/
    engine.ts
    cutting.ts
    compression.ts
    export.ts
  validation/
workers/
tests/
docs/
```

Codex may adapt the structure when technically justified. Keep core media processing independent from UI components.

## Development milestones and acceptance gates

**Do not mark a milestone complete without evidence.** Work sequentially; stop at gates requiring owner approval.

### M0 — Foundation
- [ ] Inspect repository, confirm it is the intended **Econtent-by-PCGH** project and record the starting state.
- [ ] Propose a development branch (e.g. `dev/foundation`) and avoid direct unapproved changes to `main`.
- [ ] Initialize Next.js, TypeScript, styling, linting and basic test framework.
- [ ] Add setup instructions, environment examples (no secrets), and build/test commands.
- [ ] Establish CI checks if permitted.

**Gate:** local build, lint and basic tests pass; preview deployment only after approval.

### M1 — Functional frontend shell
- [ ] Responsive upload/editor screen, video preview, timeline/range controls.
- [ ] All three cutting modes and duration presets represented in the UI.
- [ ] Optional compression selector, clip gallery and export controls.
- [ ] Accessible loading, progress, errors, empty states and mobile layout.
- [ ] No fake "completed" processing or nonfunctional download buttons.

**Gate:** users can configure a real workflow; UI integrated into repo, not only a standalone mockup.

### M2 — First real end-to-end video (FIRST PRIORITY)
- [ ] Select a real supported MP4.
- [ ] Trim a **30-second** segment with accurate start/end behavior.
- [ ] Apply **Balanced** compression on user selection.
- [ ] Preview the processed video with synchronized audio.
- [ ] Download a playable, watermark-free MP4.
- [ ] Verify duration, playback, file validity and cleanup; record actual test environment and results.

**Gate:** one genuine upload → cut → compress → preview → download success. **Do not advance to feature expansion until this works.**

### M3 — Complete free tools
- [ ] Entire-video sequential splitting.
- [ ] Selected-section splitting.
- [ ] Manual trimming.
- [ ] 30/45/60/90/120/190/custom durations.
- [ ] Keep/discard final remainder.
- [ ] Compression without cutting, plus compression-off behavior.
- [ ] High/Balanced/Small compression options.
- [ ] Individual, selected and ZIP downloads; naming and preview.
- [ ] Cancellation, cleanup and meaningful error messages.

**Gate:** tested combinations produce correct clips and valid exports.

### M4 — Reliability, privacy and compatibility
- [ ] Test short/long, portrait/landscape, different frame rates, no-audio and malformed/unsupported media.
- [ ] Test representative desktop and mobile browsers; document unsupported combinations.
- [ ] Validate cut boundaries, audio sync, progress/cancellation and memory cleanup.
- [ ] Benchmark performance and set honest device/file limits.
- [ ] Review dependencies, security and copyright/licensing obligations.

**Gate:** critical tests pass and known limitations are documented.

### M5 — Controlled beta
- [ ] Invite roughly 10–20 testers after owner approval.
- [ ] Observe cutting, compression and ZIP download completion.
- [ ] Collect opt-in feedback without uploading private videos unnecessarily.
- [ ] Resolve blockers and evaluate usability.

**Gate:** target >=90% successful supported workflows in the defined beta environment, with no critical unresolved blockers.

### M6 — Public free MVP
- [ ] Landing page, clear upload entry, help, privacy policy and terms.
- [ ] Supported-browser/device limits and transparent processing behavior.
- [ ] Privacy-respecting analytics if approved.
- [ ] Public deployment only with explicit owner approval.

**Gate:** reliable, free, watermark-free video processing for supported users.

## Later roadmap (NOT for initial implementation)

- **M7 — Captions studio:** speech-to-text API evaluation, editable subtitles, caption templates, animated/word-highlight styles, SRT and burned-in captions.
- **M8 — Music studio:** user-uploaded or properly licensed background tracks, mixing, fade in/out, volume control and original-audio preservation.
- **M9 — AI intelligent clips:** optional scene/speech analysis, ranked highlights, suggested clip boundaries and titles.
- **M10 — AI storytelling:** user explicitly selects **Generate AI Story**; multimodal scene understanding, optional transcription as context (not the only source), and timed editable scripts. Modes: factual documentary (no invented claims), clearly labeled creative cinematic, and educational explainer.
- **M11 — AI voice-over:** user approves script, selects voice and narration options, generates synchronized speech and previews/mixes audio. No voice cloning without appropriate consent and rights.
- **M12 — Commercial features:** validated subscriptions or usage credits for costly AI features, batch processing, teams, secure server jobs and quotas.

**AI safety/quality rule:** AI storytelling must correspond to the footage; fictional narration must be clearly identified. Never automatically narrate every clip or imply invented events are factual.

## Codex execution instructions

1. Read this README first. Treat it as the current product scope and acceptance checklist.
2. **Begin with M0 only**, then report findings, implementation plan, exact files to change, commands/tests and blockers. Do not attempt the entire roadmap in one pass.
3. Prefer small, reviewable commits and clear milestone-specific PRs. Preserve existing code and history.
4. Do not modify ReelForge, older Econtent, SiteGuard AI, PCGH Crowd or any other repository.
5. Never commit credentials, tokens, service-role keys or user videos.
6. Do not create paid resources, enable billing, deploy to production, or merge to `main` without explicit owner approval.
7. Do not describe mock UI, tests or exports as real functionality unless verified.
8. At each milestone, report: **implemented / tested / not tested / limitations / next approval needed**.
9. Keep the MVP focused: **first achieve one real video uploaded, cut, optionally compressed and downloaded**.

## Branding

**Econtent by PCGH** — *Cut. Create. Transform.*

The product name and tagline are working brand choices; check domain and trademark availability before commercial launch.

---

**Current status:** implementation and verification are recorded in `docs/PROCESSING.md`. Production deployment is not authorized.

## Accounts and saved projects (integration Preview)

Email authentication, owner-only saved editing settings, autosave and original-video
reconnection are integrated without requiring an account for guest editing. See
[Account workspace setup and verification](docs/ACCOUNT-WORKSPACE.md) for development
Supabase configuration, migrations, privacy boundaries and real Auth/database tests.

See [mobile workload handling and measured performance](docs/MOBILE-PERFORMANCE.md)
for Fast/Precision defaults, mobile safeguards, before/after desktop benchmarks and
unverified Android limits.

See [Fast Cut codec diagnostics and long-source trims](docs/CODEC-COMPATIBILITY.md)
for the expanded remux policy, precise rejection reasons and desktop benchmark limits.

See [browser video import and standard MP4 export](docs/VIDEO-IMPORT.md) for the current
verified format matrix, HEVC conversion, audio-only conversion, source timing, mobile
memory safeguards, limitations and reproducible tests.

## Video Overlay Studio (integration Preview)

The browser-local [Overlay Studio](docs/OVERLAY-STUDIO.md) combines one main video
with one photo or secondary video, synchronized preview and actual H.264/AAC MP4
composition export. It preserves the separate Fast Cut workflow; compositions require
explicit video encoding. Signed-in users can save metadata-only drafts and reconnect
their original local files. No source media is uploaded.
