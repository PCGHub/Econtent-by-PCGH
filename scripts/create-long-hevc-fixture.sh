#!/usr/bin/env bash
set -euo pipefail
# Synthetic, local-only benchmark fixture; no uploaded or copyrighted customer media.
fixture_prefix=${1:-/tmp/econtent-hevc}
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=1152x480:rate=24 \
 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 30 -c:v libx265 \
 -preset ultrafast -b:v 240k -maxrate 240k -bufsize 480k \
 -x265-params 'pools=none:frame-threads=1:log-level=error:keyint=240:min-keyint=240:scenecut=0' \
 -c:a aac -b:a 32k -y "${fixture_prefix}-base.mp4"
ffmpeg -hide_banner -loglevel error -stream_loop -1 -i "${fixture_prefix}-base.mp4" \
 -t 6791.168 -c copy -movflags +faststart -y "${fixture_prefix}-long.mp4"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,start_time \
 -of json "${fixture_prefix}-long.mp4"
