# Video-processing acceptance test plan

## Automated planner cases
- 120-second video at 30-second preset → 4 clips, no remainder.
- 125-second video at 30-second preset → 4 clips when discard, 5 when keep; final 5 seconds.
- 20-second video at 30-second preset → 1 clip when keep, 0 when discard.
- Section [300,600) at 120-second preset → 3 clips when keep, 2 when discard.
- Manual trim [12.5,39.5) → one 27-second clip.
- Reject NaN, infinity, negative duration, zero clip length, reversed ranges and ranges past source duration.
- Verify consecutive intervals never overlap or exceed source bounds.

## Real media acceptance
- H.264/AAC MP4 upload, preview, 30-second cut, optional balanced compression, preview result, download playable MP4.
- Verify cut start/end tolerance relative to frame rate; check audio sync.
- Test compression off and on independently; size not guaranteed smaller.
- Test video with no audio; landscape and portrait; short and long inputs.
- Export multiple clips; ZIP extracts and each MP4 plays.
- Replace video and cancel job without leaked URLs or orphaned temporary files.

## Browser and deployment
- Chromium desktop smoke test; test Firefox and Safari where available.
- Android/iPhone layout and capability behavior; unsupported devices get actionable errors.
- Confirm WASM worker and headers work in Vercel Preview, not just `next build`.
- Record CPU/memory/file limits based on measurements, not guesses.

## Evidence format
For every real-media run record: fixture duration/codec/resolution, chosen settings, output duration/codec, playback/audio verification, browser, result, and failure notes. Never fabricate test evidence.
