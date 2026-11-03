# SAM 2.1 offline proof of concept (not connected to the app)

This experiment is intentionally isolated from Next.js, Supabase and production.
It generates binary PNG masks and a measured JSON report for **one selected person** in up to 60 seconds of a video. It does not yet remove backgrounds in the Econtent UI, preserve audio, generate alpha mattes or export final videos.

## Prerequisites
- Linux GPU machine with NVIDIA CUDA and sufficient VRAM (availability and performance not yet tested).
- Python environment with a compatible PyTorch CUDA build, numpy, Pillow, and Meta's official SAM 2 repository installed per its documented instructions.
- ffmpeg on PATH.
- A SAM **2.1** checkpoint and matching config from the official distribution. Review code, weights and dependency licenses before commercial use.
- Locally owned/licensed test clips. Avoid confidential site footage without authorization.

## Example
```bash
python experiments/sam2/benchmark.py \
  --video /path/to/licensed-action.mp4 \
  --checkpoint /path/to/sam2.1_hiera_tiny.pt \
  --config configs/sam2.1/sam2.1_hiera_t.yaml \
  --x 350 --y 240 --fps 8 --max-seconds 10 \
  --out /tmp/econtent-sam2-first-run
```

Click coordinates refer to a point **inside the target person's body in the original video dimensions**. First-frame prompt is required. Compare `masks/*.png` with the matching original frames; masks are **binary segmentation**, not production-ready alpha. The script intentionally fails without CUDA or on empty input rather than silently claiming success. No data leaves the machine.

## Evaluation checklist
- Start with a clear one-person walking clip, then running, fighting, overlapping actors, occlusion and camera cuts.
- Review missing limbs, person identity switches, false background pixels, edge quality and mask flicker manually.
- Record runtime, peak GPU memory, cloud billed time and human corrections. Try tiny vs small checkpoint.
- Repeat on a separate matting candidate before committing to any commercial integration.
- RVM is GPL-3.0: **do not copy its code into the commercial app without legal review**.
- Do not purchase GPU capacity, connect cloud upload or deploy production without owner approval.

## Current status
**Prototype code committed, not executed on a GPU.** No claims about model accuracy, GPU compatibility, cost per video minute or successful output.
