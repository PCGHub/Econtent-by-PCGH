#!/usr/bin/env bash
set -euo pipefail
# Synthetic fixture only. No private footage or third-party service required.
fixture_dir=${1:-/tmp/econtent-codec-bench}
mkdir -p "$fixture_dir"
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=1152x480:rate=24 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 -t 30 -c:v libx264 \
  -preset ultrafast -b:v 240k -minrate 240k -maxrate 240k -bufsize 480k \
  -g 240 -keyint_min 240 -sc_threshold 0 -c:a aac -b:a 32k \
  -y "$fixture_dir/base.mp4"
ffmpeg -hide_banner -loglevel error -stream_loop -1 -i "$fixture_dir/base.mp4" \
  -t 6791.168 -c copy -movflags +faststart -y "$fixture_dir/long.mp4"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height \
  -of json "$fixture_dir/long.mp4"
