#!/usr/bin/env python3
"""Offline SAM 2.1 person-tracking benchmark. No uploads, API keys or paid services.

Requires a separately installed SAM2 environment, torch, numpy, Pillow and ffmpeg.
Use an explicitly downloaded, license-reviewed SAM 2.1 checkpoint/config.
"""
import argparse
import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--video", type=Path, required=True)
    p.add_argument("--checkpoint", type=Path, required=True)
    p.add_argument("--config", required=True, help="SAM2 config name, e.g. configs/sam2.1/sam2.1_hiera_t.yaml")
    p.add_argument("--x", type=float, required=True, help="Positive click X in source pixel coordinates")
    p.add_argument("--y", type=float, required=True, help="Positive click Y in source pixel coordinates")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--fps", type=int, default=8)
    p.add_argument("--max-seconds", type=float, default=10)
    args = p.parse_args()
    if args.fps < 1 or args.fps > 30 or not 0 < args.max_seconds <= 60:
        p.error("fps must be 1–30 and max-seconds must be >0 and <=60")
    if not args.video.is_file() or not args.checkpoint.is_file():
        p.error("Video and checkpoint must exist")
    if args.out.exists() and any(args.out.iterdir()):
        p.error("Output directory must be empty (avoid overwriting previous results)")
    if not shutil.which("ffmpeg"):
        p.error("ffmpeg is required")
    import numpy as np
    import torch
    from PIL import Image
    from sam2.build_sam import build_sam2_video_predictor

    args.out.mkdir(parents=True, exist_ok=True)
    frames_dir = Path(tempfile.mkdtemp(prefix="econtent-sam2-"))
    try:
        run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
             "-i", str(args.video), "-t", str(args.max_seconds),
             "-vf", f"fps={args.fps}", "-q:v", "2", str(frames_dir / "%06d.jpg")])
        frames = sorted(frames_dir.glob("*.jpg"))
        if not frames:
            raise RuntimeError("No decodable frames")
        with Image.open(frames[0]) as im:
            w, h = im.size
        # Click is specified in source coordinates; require source and extracted
        # frame dimensions to match. The ffmpeg command does not resize frames.
        if not (0 <= args.x < w and 0 <= args.y < h):
            raise ValueError(f"Click ({args.x}, {args.y}) outside {w}x{h} frame")
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA GPU required for this benchmark; no CPU fallback")
        start = time.perf_counter()
        predictor = build_sam2_video_predictor(args.config, str(args.checkpoint), device="cuda")
        state = predictor.init_state(video_path=str(frames_dir))
        predictor.add_new_points_or_box(
            inference_state=state, frame_idx=0, obj_id=1,
            points=np.array([[args.x, args.y]], dtype=np.float32),
            labels=np.array([1], dtype=np.int32),
        )
        masks = args.out / "masks"
        masks.mkdir()
        processed = 0
        areas = []
        with torch.inference_mode():
            for index, object_ids, logits in predictor.propagate_in_video(state):
                if 1 not in object_ids:
                    raise RuntimeError(f"Tracked subject missing at frame {index}")
                i = list(object_ids).index(1)
                mask = (logits[i] > 0).squeeze().cpu().numpy()
                if mask.shape != (h, w):
                    raise RuntimeError(f"Unexpected mask dimensions {mask.shape}")
                Image.fromarray((mask.astype(np.uint8) * 255), mode="L").save(
                    masks / f"{index:06d}.png"
                )
                areas.append(float(mask.mean()))
                processed += 1
        elapsed = time.perf_counter() - start
        report = {
            "model": "SAM 2.1", "video": args.video.name,
            "frames_decoded": len(frames), "frames_segmented": processed,
            "resolution": [w, h], "sampling_fps": args.fps,
            "elapsed_seconds_including_model_load": round(elapsed, 3),
            "frames_per_second_including_load": round(processed / elapsed, 3),
            "gpu_peak_allocated_gib": round(torch.cuda.max_memory_allocated() / 2**30, 3),
            "foreground_coverage_by_frame": areas,
            "warning": "Binary masks only. No alpha matting, quality score, audio or composited video. Human visual review required.",
        }
        (args.out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({k: v for k, v in report.items() if k != "foreground_coverage_by_frame"}, indent=2))
    finally:
        shutil.rmtree(frames_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
