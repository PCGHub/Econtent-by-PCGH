#!/usr/bin/env bash
set -euo pipefail
fixture_dir="${1:-/tmp/econtent-mobile-bench}"
mkdir -p "$fixture_dir"
# Sintel trailer, (c) Blender Foundation, CC BY 3.0. No footage is committed.
curl -fL --max-time 120 https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4 -o "$fixture_dir/sintel-720p.mp4"
while read -r label duration bitrate; do
  ffmpeg -hide_banner -loglevel error -stream_loop -1 -i "$fixture_dir/sintel-720p.mp4" \
    -t "$duration" -vf fps=24 -c:v libx264 -preset veryfast -b:v "${bitrate}k" \
    -minrate "${bitrate}k" -maxrate "${bitrate}k" -bufsize "$((bitrate * 2))k" \
    -x264-params nal-hrd=cbr:force-cfr=1 -g 240 -keyint_min 240 -sc_threshold 0 \
    -pix_fmt yuv420p -threads 2 -c:a aac -b:a 96k -y "$fixture_dir/$label.mp4"
  ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,avg_frame_rate -of json "$fixture_dir/$label.mp4"
done <<'CASES'
10mb 52.208333 1435
30mb 210.125 1040
70mb 480.125 1070
110mb 720.125 1125
CASES
