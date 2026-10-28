# Processing performance and progress upgrade

## Changes

- Fast Cut is the default with compression Off: H.264/AAC MP4 streams are copied without re-encoding. Other codecs are rejected with an actionable Precision Cut recommendation; no silent re-encoding fallback.
- Precision Cut remains the explicit frame-accuracy option. Compression automatically selects and explains Precision Cut. Input-side accurate seek avoids decoding from the beginning for every clip. CRF/presets are unchanged.
- Fast targets use preceding source keyframes at both boundaries, so neighboring target ranges remain consecutive. Very short ranges with no distinct keyframes require Precision. The displayed target range is not a claim of exact output boundaries: stream-copy preroll, B-frames and MP4 timestamp padding can add footage or change duration. Every output shows its probed exported duration.
- A packet-only keyframe scan avoids decoding frames just to locate keyframes. The source is mounted once through read-only WORKERFS and reused alongside one loaded FFmpeg worker. A compatibility fallback transfers the input into MEMFS once per source. Replacing the source, cancellation, errors or component unmount release retained resources. Each clip's temporary output/probe files are deleted.
- The Blob is constructed directly from transferred output bytes, avoiding the former extra Uint8Array copy. Clip cards are memoized so elapsed/progress updates do not repeatedly render all previews.
- ZIP creation runs in a separate Web Worker with JSZip's real packaging callback. Cancel terminates it; partial archive data is discarded.

## Progress semantics

The panel shows the current clip, clip progress, overall job progress, elapsed time and ETA when reliable. Loading FFmpeg, preparing the source/keyframe index, encoding/copying, finalizing/verifying, packaging ZIP, completed, cancelled and failed are distinct states. The responsive panel and Cancel stay outside disabled editing controls and remain visible while scrolling.

The FFmpeg wrapper's raw `progress` ratio can use the original source duration even when exporting a subrange. We use output timestamps in microseconds (`time` and machine-readable `out_time_us`) divided by the active output range duration. Out-of-range, non-finite, regressing and missing measurements never advance progress. Stalled measurements become indeterminate after four seconds.

Overall video progress is duration-weighted across the requested clips: finalized clip duration plus measured work in the current clip, divided by planned duration. This measures media work, not a promise of linear wall-clock completion. Loading, filesystem operations and finalization have no invented timer/weight; these stages are explicitly indeterminate and retain the last measured lower bound. 100% is reserved until every output has been verified and its Blob read. Job progress is monotonic; a new ZIP download is a separate job whose measured percentage starts over.

Elapsed time includes startup/preparation/finalization and freezes on completion/cancel/error. ETA requires six or more progressing samples spanning at least five seconds with rate coefficient of variation below 0.35; it disappears when stale, unreliable or outside encoding. Fast copy often completes before an ETA is meaningful. No synthetic progress or fixed ETA is shown.

FFprobe in core 0.12.10 can leave its return sentinel at -1 after successful execution. A fresh, parseable output file and required metadata fields are validated; a missing/invalid probe never counts as successful output.

## Measured 720p results

Single runs on the same Linux host, Chromium 154, two CPU cores / 8 GiB memory, wrapper 0.12.15 and core 0.12.10. Source: actual 1280×720 / 24fps H.264/AAC [Sintel trailer](https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4), 52.208333s / 7,608,204 bytes, Blender Foundation, CC BY 3.0. Footage is not committed. The old engine is preserved from commit `d481927f7b4cb14478f533811eb677ad1acdb1e5` for comparison.

| Case | Previous engine | Updated engine | Interpretation |
| --- | ---: | ---: | --- |
| Three cuts covering 52.208s, Precision / Off | 198.012s | 191.654s | Small difference; no substantial speed claim |
| Same three requested ranges, Fast / Off | Re-encoded above | 0.486s | Stream copy with different keyframe boundaries; not equivalent accuracy |
| One 20s range, Precision / Balanced | 87.442s | 86.711s | Essentially unchanged; encoding dominates |
| Same Balanced cut, experimental two-thread isolated core | — | 47.626s | 1.82× vs updated single-thread; not enabled in the app |
| Nine Fast cuts of a 720.641s / 71,163,858-byte fixture | Not measured end-to-end here | 3.216s | Eight 90s targets plus final remainder |

The long fixture repeats the licensed trailer and re-encodes it locally to 720p/24fps, about 700kbps video + 80kbps AAC, with fixed 10-second GOPs. It is similar in size/duration to the reported user case, but it is not that user's file. Video duration is 720.625s; AAC packet rounding makes container duration 720.641333s. Do not compare the 3.216s directly with the user's >10 minutes on unknown hardware/footage as a controlled speedup ratio.

Times sum actual engine.process calls, including preparation, remux/encode, output probe/read; exclude initial core/network loading and ZIP. Local core load was 0.2–0.7s; real first-load downloads can take longer. Warm filesystem/OS caches and one trial per case limit statistical conclusions. Exact records and output checks: [benchmarks/2026-10-28.json](benchmarks/2026-10-28.json).

### CPU and memory

The old three-cut job consumed about 198 CPU seconds over 198 wall seconds, using roughly one of two available cores. Single-thread Balanced consumed about 88 CPU seconds over 87 seconds; two-thread Balanced consumed about 92 CPU seconds over 48 seconds. Single-thread WASM re-encoding is the main remaining Precision bottleneck. Seeking/source reuse alone cannot remove that cost.

Old three-cut input transfers: 3 × 7,608,204 = 22,824,612 bytes. Updated jobs mounted once and transferred zero complete source byte arrays. For the long nine-cut run, the old architecture would copy the 71,163,858-byte input nine times (640,474,722 transferred bytes); the tested new engine mounted once with zero full-file transfers. This transfer comparison follows the old implementation; its full long encode was not timed here.

Approximate peak process-tree RSS: old short Precision 928.5 MiB, updated Precision 941.4 MiB, short Fast 774.4 MiB, long Fast 951.3 MiB. This sampling sums shared resident pages across Chromium/controller processes and is not a unique/private WASM heap measurement. Avoid claiming reduced peak memory for all cases. The MT Balanced experiment reached 1,178.6 MiB versus 926.0 MiB single-thread, approximately 27% higher.

MT required an isolated local benchmark origin (COOP same-origin and COEP require-corp), a separate core, and two encoder threads. The build contains a 32-worker pthread pool. The deployed app does not currently have that isolation or broad mobile/Safari/Firefox memory/compatibility evidence. MT is therefore NOT shipped or automatically enabled; the temporary benchmark assets were removed. No project-wide isolation/security changes or paid processing services were introduced.

### Output validity, accuracy and sync

Seventeen actual benchmark MP4s were fully decoded without errors. Fast starting frames matched the decoded source keyframes byte-for-byte. Across copied video and AAC packets, the common timestamp-shift spread was at most 0.707 ms: synchronization was preserved. Initial stream PTS can differ because of preroll; equality of first timestamps is not the correct stream-copy sync test. Export durations can exceed target spans by a few frames/padding, and large source GOPs can move requested boundaries by seconds.

Precision starting frames at nonzero targets matched reference frames with PSNR 39.8–51.8 dB after lossy encoding; exported durations were within one frame of the requested spans. This checks actual cut content as well as metadata, without claiming lossless encoding. Audio synchronization was assessed via timestamps/packets, not subjective listening.

## Reproducing

Run `bash scripts/create-benchmark-fixtures.sh /tmp/econtent-bench` to download the attributed sample and generate the long case. Before changing the engine, or using a git checkout of the baseline, copy the baseline `lib/video` files into an ignored directory. The source and generated media must stay outside git.

```
node scripts/benchmark-compile.mjs path/to/baseline/lib/video test-results/performance/site/baseline
node scripts/benchmark-compile.mjs lib/video test-results/performance/site/optimized
node scripts/benchmark-video.mjs baseline /tmp/econtent-bench/real-720p.mp4 precision off '[[0,20],[20,40],[40,52.208333]]'
node scripts/benchmark-video.mjs optimized /tmp/econtent-bench/real-720p.mp4 precision off '[[0,20],[20,40],[40,52.208333]]'
node scripts/benchmark-video.mjs optimized /tmp/econtent-bench/real-720p.mp4 fast off '[[0,20],[20,40],[40,52.208333]]'
```

The runner requires installed dependencies, native FFmpeg/ffprobe and `/usr/bin/chromium`. It serves the real same-origin FFmpeg distribution and transpiled engine modules locally, uses actual File objects and downloaded MP4s, and records measured IO/time/RSS/CPU. `ECONTENT_BENCH_LABEL` selects a distinct output/report suffix. Run media benchmarks sequentially without other heavy jobs. `scripts/verify-benchmark-outputs.mjs` fully decodes outputs, compares first frame pixels and checks copied packet timestamp offsets.

For the optional isolated MT experiment only, unpack `@ffmpeg/core-mt@0.12.10`'s ESM distribution into ignored `public/ffmpeg/core-mt`, set `ECONTENT_BENCH_MT=1`, and use the optimized engine. The benchmark origin alone sets isolation headers and limits encoder threads to two. Remove those temporary assets before builds. This is a benchmark path, not a product option.

## Checks and remaining limits

Unit tests cover progress weighting/monotonicity/100% gating/stalls/ETA, source/worker reuse and fallback cleanup, cancellation, keyframe selection and ZIP worker cancellation. Native tests cover all compression presets, silent portrait footage, exact cuts, copy frame identity and packet sync. Browser tests cover Precision Balanced and Off, Fast Off, multiple clips, output playback, MP4 and full/selected ZIP downloads, actual progress transitions, small-screen Cancel visibility and cancellation. See CI for final revision results.

Safari, Firefox, mobile processing, unusual timestamps/VFR, fragmented MP4, huge GOPs, corrupt media and low-memory devices need more evidence. The 256 MiB source / ZIP and 512 MiB output safety caps are conservative guards, not proven device capacities. Long Precision encoding remains slow. Fast Cut's speed must always be presented alongside its keyframe/compatibility limitations.
