# High-quality portrait matting — implementation decision (2026-11-03)

## Decision
Prioritize a commercially permissive alternative to RVM. **MODNet (Apache-2.0)** is the candidate for a separately opt-in **Detailed Edges** engine. Do **not** bundle official Robust Video Matting (GPL-3.0) into this commercial product without a separate license review. Existing SelfieSegmenter remains the working Fast mode.

References:
- https://huggingface.co/Xenova/modnet (Apache-2.0 model card; Transformers.js browser usage)
- https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter (existing Fast model)
- https://github.com/PeterL1n/RobustVideoMatting (GPL-3.0 official RVM)

## Engineering sequence
1. Validate exact MODNet weights/license and a pinned ONNX/browser runtime. Pin hashes, avoid relying on a mutable model revision or runtime CDN.
2. Run an isolated browser proof of concept on representative **portrait** frames from the podium footage; benchmark initial model download, RAM, per-frame latency and matte quality. Do not infer that a portrait model will keep the podium.
3. Add a separate model adapter with a common segmentation-result contract. Ensure alpha-mask geometry matches source aspect ratio; normalize correctly, no stale canvas frames.
4. Add Fast (SelfieSegmenter) / Detailed Edges (MODNet) selector. Load MODNet only on selection. Report unsupported devices and memory failures without silently changing engines.
5. Handle seeking, video playback, cancellation and sequential export. MODNet is frame-based: optional temporal smoothing must reset on seeks and avoid ghosting.
6. Verify a short audio-preserving export, then full 2:21 clip; test mobile and desktop; run lint/typecheck/build and confirm Preview Ready.

## Guardrails
- The requested capability is **not shipped** until model inference, UI, and audio export have passed.
- Object preservation (podium) is separate from human matting and will require an additional user-controlled mask or object segmentation.
- Only `feature/multitrack-video-editor` and Vercel Preview; no production deployment or main merge.
