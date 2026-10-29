# Mobile processing investigation

Performance branch: `perf/mobile-cut-workload`, based on authorized integration commit
`3de6253c8c17281e8730c6dccf154ad3daa3d08c`. Authentication, saved-project schema and
Supabase Auth configuration are not changed.

## What the reported 5% means

Precision Cut decodes video and re-encodes H.264 in the single-thread FFmpeg WASM core.
Compression Off previously selected CRF 18 / x264 `fast`, rather than stream copy.
For seven equal 30-second clips, 5% overall can mean approximately 10.5 seconds of the
first clip has been encoded, with no finalized clip yet. Overall percentage measures
processed media duration, not linear wall-clock completion. We cannot establish that
this was the exact cause on the reporter's Android device without its footage/device.
Background throttling, thermal limits, resolution, frame rate and memory also matter.

Fresh editors already defaulted to Fast Cut. Two important distinctions existed:
explicit Precision settings are restored from saved projects; and compression selects
Precision, while turning compression Off previously could retain Precision in a
restored project. At the low-level engine API, omitted cut strategy also defaulted
to encoding. No existing automatic codec fallback from Fast to Precision was found.

Input-side seeking, a retained FFmpeg worker, a single WORKERFS source mount, cached
source/keyframe probes and per-output cleanup were already implemented. They are
preserved. The source is not recopied for each clip. A one-time MEMFS fallback remains
for browsers without WORKERFS. The account fingerprint worker still reads bounded
1 MiB source chunks for safe saved-project reconnection; it does not upload videos.

## Changes

- Fast Cut is the low-level default for compression Off as well as the fresh editor
  default. Choosing Off or replacing an Off source visibly selects Fast. An explicitly
  saved Precision choice is preserved and disclosed, rather than changing project metadata.
- Selecting compression visibly explains Precision re-encoding. Fast incompatibility
  stops before encoding, explains the actual container/codec, and offers an explicit
  Precision alternative. There is no silent encoding fallback.
- One cached source inspection reads actual duration, size, resolution, average frame
  rate and codecs before encoding. Workload displays selected duration and approximate
  frames, rather than a duration promise inferred from megabytes.
- Android/iOS user agents and reported device memory <=4 GiB trigger an inline Precision
  workload confirmation. It offers Fast when compatible, an explicit Continue, and Cancel.
  The confirmation receives focus and is scrolled into view; only active progress
  remains sticky, keeping completed/failed panels off editing controls.
  This is a conservative UX policy, not a tested device capability threshold.
- Precision/Off changes only x264's speed preset from `fast` to `ultrafast`, retaining
  CRF 18, original dimensions/frame timing, yuv420p and AAC 128 kbps. This trades coding
  efficiency for speed: output files can be substantially larger. It is still lossy.
  High/Balanced/Small settings remain unchanged. No lower resolution or frame rate is
  silently selected.
- Fast keyframe indexing now uses compact packet text and stores only keyframe numbers,
  avoiding JSON objects/arrays for every packet. It still scans packets once without
  frame decoding and caches its result.
- Starting a job pauses the original preview, avoiding continuous preview decoding
  alongside the processing worker. Output previews use preload=none so the browser need not initialize every preview
  while encoding other clips. Pressing Play loads the actual local MP4 normally.
- Mobile/low-memory retained-output safety budget is 128 MiB (desktop remains 512 MiB).
  An exceeded budget stops the job with completed clips available to download. This is
  a guard, not proof that smaller jobs cannot exhaust memory. Source/ZIP limits remain.
- Progress explicitly labels Fast stream copy versus Precision re-encoding, current clip,
  finalized clip count, measured overall/clip progress, elapsed and reliable ETA. Missing
  or stalled timestamps remain indeterminate. Cancel stays outside disabled controls.

## Benchmark method

Fixtures are derived locally from the licensed 720p/24fps H.264/AAC Sintel trailer,
looped/re-encoded with 10-second GOPs and constant bitrate. Files are about 10, 30, 70
and 110 decimal MB, with durations about 52, 210, 480 and 720 seconds respectively.
These are controlled fixtures, not the reporter's video. No footage is committed.

Baseline is a frozen copy of the integration engine. Both versions use the same machine,
Chromium and fixtures, with no simultaneous builds/media jobs. Fast runs split the full
source into 30-second targets plus a kept remainder. Precision comparisons each encode
one 30-second range [1.25,31.25], to bound benchmark cost. They are not timings for full
long-source Precision jobs. The optimized 30 MB fixture additionally runs seven complete
30-second Precision clips, discarding only its short final remainder.

Times include source preparation/indexing, copy/encode and output probe/read, but exclude
initial core loading and downloads/ZIP. Initial load is reported separately. Fast output
boundaries differ from Precision; copy duration can include padding and preroll. Each
mode is compared with its own baseline. Single trials are not statistical guarantees.

CPU is sampled from the controller/browser process tree with one-second CPU-time
resolution. Peak summed RSS is an approximate process-tree proxy, double-counts some
shared pages and is not a WASM heap measurement or an Android memory measurement.

Reproduce on an idle desktop with native FFmpeg and `/usr/bin/chromium`:

```sh
bash scripts/create-mobile-benchmark-fixtures.sh /tmp/econtent-mobile-bench
# Preserve baseline/lib/video from integration commit in an ignored directory first.
node scripts/benchmark-compile.mjs test-results/mobile-performance/baseline/lib/video test-results/performance/site/baseline
node scripts/benchmark-compile.mjs lib/video test-results/performance/site/optimized
node scripts/benchmark-mobile.mjs baseline
node scripts/benchmark-mobile.mjs optimized
```

Run `scripts/verify-benchmark-outputs.mjs` on the resulting JSON reports to fully decode
outputs, compare first frames and check stream-copy packet synchronization. It records
first-frame PSNR for lossy Precision and byte-identical keyframe content for Fast.

## Android and compatibility limits

No real Android device, ADB connection or Android device farm is available in this
workspace. UA/viewport browser tests verify policy/layout only and do not benchmark
Android performance. Desktop results must not be advertised as an Android fix.

A 30 MB job within three minutes is a target, not a guarantee. There is no fixed ETA
from file size alone. Fast requires compatible H.264/AAC MP4 and follows keyframes;
Precision/compression can remain slow on mobile. Keep the tab foregrounded and avoid
other memory-intensive work. Mobile browser OOM, thermal/background throttling, Safari,
Firefox, VFR/unusual timestamps and corrupt media need additional real-device evidence.

Multithreading is not enabled. Earlier isolated desktop experiments improved encoding
speed but used more memory and a large pthread pool (see PERFORMANCE.md). Those results
do not justify changing security/isolation headers or increasing worker memory on an
untested Android device. Hardware WebCodecs encoding is also not introduced without
muxing, audio-sync and device evidence.

## Measured results

Linux x64, Chromium 154.0.8037.57, 2 CPU-core quota / 8 GiB memory limit,
@ffmpeg/core 0.12.10 and wrapper 0.12.15, single-thread engine. One trial per case.

| Source MB / duration | Fast full source, before → after | Precision 30-second sample, before → after |
| --- | ---: | ---: |
| 10.0 / 52.21s | 0.524 → 0.583s | 117.064 → 17.700s |
| 30.1 / 210.14s | 1.469 → 1.463s | 116.876 → 16.915s |
| 70.3 / 480.15s | 3.373 → 3.133s | 116.127 → 17.343s |
| 110.4 / 720.13s | 4.810 → 4.825s | 116.039 → 17.257s |

Precision samples improved about 6.6–6.9× in these desktop trials. Fast was already
fast; its small before/after differences do not establish a speed improvement.
The same 30-second scene required essentially the same baseline encoding time despite
very different total file sizes. Duration, pixel count, frame rate and encoder settings
are more informative than megabytes alone.

The optimized 30.1 MB source produced **seven 30-second Precision/Off clips in 105.519s**
of measured engine processing, plus 0.284s local core initialization. All seven exported
durations were 30.000s. This meets the three-minute optimization target on this host
only; the full seven-clip baseline Precision job was not timed. It is not an Android
result and excludes real network startup, input fingerprinting, downloads and ZIP.

Output size is the main tradeoff: the first 30-second sample increased from 7.34 to
19.78 MB, and the full seven Precision exports totaled 106.76 MB from a 30.07 MB source.
The same CRF does not guarantee identical perceptual quality across encoder presets.
Compression settings remain available when size matters, but their slower presets
are unchanged. Fast preserves compressed source streams instead.

The baseline Precision samples consumed 117–118 sampled CPU seconds over 116–117 wall
seconds. Optimized samples consumed about 18 CPU seconds over 17–18 wall seconds:
one-core encoding cost is the measured bottleneck, not repeated source transfers.
Both versions made exactly one source mount and zero complete source byte-array writes
per run. Existing input-side seek/source reuse was not the missing optimization.

Observed summed process-tree RSS ranges were 785–936 MiB baseline / 828–925 MiB updated
for Fast, and 892–894 MiB baseline / 881–907 MiB updated for Precision samples. The full
seven-clip Precision run peaked at about 939 MiB. These measurements do not demonstrate
a general peak-memory reduction. Compact indexing reduces intermediate objects and
preload=none avoids eager output preview work, but real Android memory behavior remains
unverified.

**Output verification:** 126 actual MP4s fully decoded: 15 Precision and 111 Fast outputs,
including the additional seven-clip Fast export validity run. All Precision durations
matched their requested spans in this dataset; first-frame reference PSNR was >=49.832 dB
(or identical). This is a first-frame/content check, not a whole-video perceptual score.
All Fast first decoded frames matched source keyframes byte-for-byte. The largest
common video/audio packet timestamp-offset spread was 0.686 ms. Fast durations still
include padding/preroll and remain keyframe limited. Native tests also exercise
non-keyframe requested boundaries, all compression presets and silent portrait footage.

Machine-readable measurements: [benchmarks/mobile-processing.json](benchmarks/mobile-processing.json).
Raw per-case measurements, output files and full verification records are retained in
ignored `test-results/performance/` and are reproducible with the scripts above.

## Regression verification

- Lint, TypeScript and builds passed with accounts unconfigured and with the isolated
  local Auth configuration.
- 27 unit tests passed, covering Fast defaults, preset retention, source/worker reuse,
  cached inspection, incompatible-codec rejection without encoding, failed-probe recovery,
  frame-rate parsing, mobile confirmation/budget policy, progress/ETA and ZIP cancellation.
- Both native media tests passed, including all compression presets, non-keyframe cuts,
  silent portrait input, stream-copy frame identity and audio/video timestamps.
- Three editor Chromium tests passed, including real MP4 playback, all/selected ZIP,
  source reuse, progress aggregation, cancellation and an Android-like UI policy test.
  UA/viewport emulation is explicitly not an Android hardware performance test.
- Both real local GoTrue/PostgreSQL/Mailpit account tests passed: verification, login,
  recovery, refresh, CRUD/autosave, RLS isolation and original-file reconnection. An
  explicitly saved Precision/Off project was reopened and retained its mode/ranges.
  A transient hidden-page locator race was corrected in the test without changing Auth.
- No Supabase migration, Auth setting, project schema or existing Preview configuration
  was changed. Production and main are outside this delivery.

### CI registry reliability

The first remote account job stopped before running tests because public ECR returned
“Data limit exceeded” on a shared GitHub runner. Editor CI passed. CI now selects the
maintainers' public Docker Hub images by immutable amd64 manifest digest. GoTrue,
PostgREST and Mailpit config digests were checked against the locally tested ECR
images and matched exactly, preserving image/layer content. Local default image names
remain available via optional Compose overrides; no Auth/database setting changed.
No registry subscription, token, billing change or paid service was introduced.

Follow-up: [codec compatibility and bounded long-source trims](CODEC-COMPATIBILITY.md)
adds explicit diagnostics, additional validated remux inputs and range-limited keyframe scans.
