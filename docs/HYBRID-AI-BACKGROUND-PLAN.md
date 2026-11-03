# Hybrid AI Background Removal — Preview-first evaluation plan

Status: PLANNED, not implemented. Branch: feature/multitrack-video-editor. No production deployment authorized.

## Product target
Full-body action footage (running, fighting, rapid movement), people entering/exiting frame, overlapping actors, occlusion, camera cuts, hair/clothing boundaries. No promise of perfect automatic results.

## Existing system
Next.js browser editor; current MediaPipe Pose segmentation at /ai-background remains unchanged until replacement passes benchmarks. Preserve browser cutter, overlay editor, audio, and export workflows.

## Candidate evaluation
1. **SAM 2.1** (Apache-2.0): user-click/box selection, multi-person tracking, prompt corrections, propagation across video. Start with tiny/small; compare base-plus for accuracy. Confirm code/checkpoint/dependency licenses.
2. **Robust Video Matting** (GPL-3.0): compare automatic human alpha matting and temporal stability, but DO NOT integrate into proprietary commercial backend without legal review and an acceptable licensing approach. Seek permissively licensed matting alternative if necessary.
3. SAM masks are segmentation, not necessarily fine alpha mattes. Benchmark feathering/refinement separately; do not represent them as automatically equivalent.

## Benchmark suite and gates
Obtain properly licensed clips: standing/talking, running, fast arm/leg movement, two fighters overlapping, camera cuts, motion blur, partial occlusion, multiple people, entering/exiting. Include 9:16 and 16:9, 720p and 1080p. Preserve source audio.
For each clip record: visible-person mask quality (IoU where annotated), boundary quality (alpha SAD/gradient where ground truth exists), temporal flicker, tracking ID switches, missing limbs, failed frames, operator corrections, processing seconds per video minute, GPU peak VRAM, GPU billed seconds, output file size, audio sync and failure recovery. Require human review of side-by-side output. Do not claim passing until executed.

## Proposed architecture
Browser (Next.js) -> authenticated job API (Vercel) -> Supabase RLS job row + private input/output object storage -> signed short-lived input access -> GPU worker (container, queue, bounded concurrency) -> mask/matte + FFmpeg compositing -> private output -> status polling -> signed download.
Job states: queued, uploading, processing, needs_input, completed, failed, canceled. Each job scoped to org/user; no service-role secrets in browser. Validate media type, size, duration, codec, quotas, and output; cap upload and runtime; cancellation and retry must be idempotent. Use TTL cleanup and deletion policy. Do not expose uploaded user media publicly. Explicitly disclose cloud processing to users before upload.

## Cost controls
No paid GPU provisioning until benchmarks and owner approval. Runpod illustrative published Nov 2026: Pod RTX A5000 $0.27/h, RTX 4090 $0.89/h; Serverless 24GB tier from $0.75/h. Measure actual billed worker time, idle/cold-start, storage, network egress and failed/retried jobs; estimate cost per exported minute and quota economics from results, not model-only FPS.

## Preview-only delivery phases
P0: license/dependency audit and representative clip set; acceptance rubric.
P1: isolated offline SAM 2.1 worker proof of concept; mask video and composite; measured benchmark.
P2: evaluate matting refinement and legally suitable alternatives; compare RVM only in license-compliant testing.
P3: private storage, authenticated job API, budget-limited queue, cancellation, TTL, progress, audit.
P4: opt-in Advanced AI mode in Preview /ai-background, with explicit cloud-upload notice; leave existing local mode untouched.
P5: browser/e2e and GPU integration tests, security/tenant isolation, cost report; owner acceptance required before any production rollout.

## Acceptance requirements
- No regression to existing editor, audio, or local background mode.
- Full-body subject maintained in clear-action clips, with no opaque-original fallback.
- Clear unsupported/occluded cases flagged for user correction rather than silently corrupting video.
- Every export visually checked; no partial-success downloads on failure.
- Cost, latency, GPU memory, model/license compliance, and privacy documented.
- Production/main branch unchanged until explicit approval.
