#!/usr/bin/env bash
set -euo pipefail
benchmark_dir="${1:-/tmp/econtent-bench}"
mkdir -p "$benchmark_dir"
# Sintel trailer, (c) Blender Foundation, CC BY 3.0. Never commit downloaded footage.
curl -fL --max-time 120 https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4 -o "$benchmark_dir/real-720p.mp4"
ffmpeg -hide_banner -loglevel error -stream_loop -1 -i "$benchmark_dir/real-720p.mp4" -t 720.625 -vf fps=24 -c:v libx264 -b:v 700k -preset veryfast -g 240 -keyint_min 240 -sc_threshold 0 -threads 2 -pix_fmt yuv420p -c:a aac -b:a 80k -y "$benchmark_dir/720p-long.mp4"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,avg_frame_rate -of json "$benchmark_dir/720p-long.mp4"
