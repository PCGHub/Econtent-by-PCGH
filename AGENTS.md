# Codex engineering mandate — Econtent by PCGH

Read `README.md` and `docs/ARCHITECTURE.md` before editing. This repository is the ONLY permitted workspace. The current working integration branch is `v0/econtent-frontend`.

## Authority
You are authorized to autonomously implement, refactor, test, debug, commit, push, and deploy a **non-production preview** of the Econtent MVP. Create additional modules, tests, docs, and branches as necessary. Do not stop for routine approvals. Investigate and resolve technical blockers. If deployment cannot be completed with available authorized access, report the precise blocker and continue local verification. Never bypass access controls.

Do not edit unrelated repos, merge into main, create paid resources, enable billing, expose secrets, or deploy to production. The owner can separately authorize these later. Do not silently upload users' media or send it to third parties.

## Goal
Build a genuinely functional free, watermark-free video editor. Deliver upload → preview → accurate cut → optional compression → preview output → downloadable playable MP4, then all three cutting modes, duration presets, keep/discard remainder, ZIP exports, cancellation and errors. Prioritize actual working processing over decorative UI. Preserve and improve the existing white/blue v0 frontend.

## Workflow
1. Inspect repository, existing UI, dependency versions, browser constraints and README requirements. Verify branch and git status.
2. Make an implementation plan, then **execute it autonomously**. Do not merely write a plan.
3. Integrate browser-local processing behind typed interfaces, keeping UI responsive and memory bounded. Choose suitable FFmpeg WASM implementation after validating runtime, bundling, worker paths, headers, licenses and browser support.
4. Implement real media tests with reproducible fixture generation (where local FFmpeg is available), inspect duration/codec/audio sync using ffprobe or equivalent. No fake exports or fabricated success metrics.
5. Run install, lint, typecheck, build, unit and applicable integration/browser tests. Resolve failures. The prior v0 sandbox lacked `next-adapter.mjs`; diagnose environment separately rather than assuming source code is broken.
6. Commit incremental changes, push branch, and deploy to Vercel **Preview** if connected/authorized. Confirm deployed URL and actual browser behavior where tooling permits.
7. Report what was implemented, tested, untested, limitations, URLs, commit IDs, and any remaining blockers. Explicitly distinguish build success from real media-processing verification.

## Implementation guardrails
- Never run heavy media processing in Vercel serverless request handlers.
- Prefer local-only video processing for MVP; no accounts/storage/database required.
- Avoid loading huge source and output copies concurrently when possible; manage Blob URLs and WASM virtual FS cleanup.
- Support MP4 H.264/AAC as initial target, detect and explain unsupported inputs.
- Compression OFF means do not intentionally compress; frame-accurate cutting may still require re-encoding. Document behavior honestly.
- Handle zero-length ranges, out-of-bounds times, final remainder, no audio, VFR, cancellation, memory errors, codec errors and ZIP failures.
- No AI, music, payment or subscription APIs in MVP.
- Accessibility, mobile layout, real progress and useful error states matter.

## Definition of done
A user can complete the full workflow with a real supported video, and automated plus manual evidence verifies output file validity. A preview deployment is useful but does not alone satisfy this definition.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
