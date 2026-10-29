# Browser-local video import and standard MP4 export

This feature builds on codec/performance commit
`9f075e7a12eda22d6b721c09bb0f022233876998` and retains its account integration.
It does not install a new FFmpeg core, introduce uploads, change Supabase schemas,
or create infrastructure. Core 0.12.10 / wrapper 0.12.15 remain pinned.

## Processing choices

The loaded WASM core is queried once for its actual decoder, encoder and muxer
inventory. Source inspection sniffs file contents rather than trusting extensions,
MIME types or an MP4 filename. Duration, dimensions, average FPS, codecs, pixel
format, transfer function and first-video timeline origin are inspected without
full frame decoding. Inventory and source mount/metadata are reused across clips.
A registered codec is not by itself proof of usable decode: native AV1 is excluded
because a real AV1 decode test returned “Function not implemented.”

- **Fast Cut:** copies H.264 8-bit 4:2:0 video and AAC audio, or silent video, to MP4.
  Only validated input container families are enabled. Both boundaries follow source
  keyframes; timestamp padding/preroll can add extra frames. No frame-accuracy claim.
- **Fast video + audio conversion:** for verified compatible H.264 streams paired
  with another decodable audio codec, an explicit per-job confirmation enables AAC
  128 kbps encoding while leaving video copied. Audio quality changes are disclosed;
  cuts still follow keyframes. No audio is silently discarded or re-encoded.
- **Precision Cut / conversion:** explicitly selected software decoding and H.264
  encoding; output is yuv420p with AAC 128 kbps where audio exists. Off uses CRF 18 /
  ultrafast, High/Balanced/Small retain existing settings. Off is lossy and output can
  grow. VFR output preserves timestamp spacing rather than intentionally imposing a
  new fixed frame rate. Original content is not downscaled. Odd dimensions receive
  at most one padding pixel per side dimension, with SAR adjusted to retain display
  aspect ratio. This path also gives accurate cuts for otherwise copyable sources.
- **Unavailable:** missing usable decoder/encoder, encrypted content, unreadable or
  malformed metadata, or unverified HDR tone mapping gets a precise reason. HDR/PQ/
  HLG is blocked before encoding; untagged HDR cannot reliably be identified. Higher
  bit depth/chroma conversion to 8-bit 4:2:0 requires an explicit confirmation.

Additional tracks are not silently copied into a misleading output. Fast requires
one video and zero/one audio tracks without extras. Precision explicitly discloses
that it exports the first video and first audio tracks, omitting additional tracks.
A first video track that is cover art must be re-exported with the desired track first.

## Source and export UI

Choose or reconnect a source and use **Check codec compatibility**. Unsupported
native browser preview does not block local FFmpeg metadata inspection or conversion.
The panel shows detected format, available/recommended methods, required conversion,
selected duration/resolution/FPS workload and limitations. No conversion starts from
inspection or as a fallback. Mobile Precision and audio-only confirmations receive
focus and scroll into view. Saved Fast/Precision settings remain unchanged; audio-only
consent is deliberately per job and is requested again after reconnecting.

Output verification checks positive finite duration, expected H.264/AAC track counts,
dimensions, 8-bit 4:2:0 pixel format, Precision duration and conversion timestamp
alignment when source timing is available. It does not decode every exported frame
again in the product, which would add processing cost. Regression exports are fully
decoded with native FFmpeg and played in Chromium. User preview remains recommended.
Completion remains gated on verified output bytes, not a timer or final progress event.

## Supported format matrix

The matrix below records actual bundled-WASM exports, not native FFmpeg capabilities
or universal claims about every file with an extension. Profiles, damage, timing,
extra tracks and available device memory can change eligibility. Metadata-only
recognition does not establish decode support.

| Tested source combination | Standard H.264/AAC MP4 method | Status |
| --- | --- | --- |
| H.264/AAC MP4, Matroska, FLV, MPEG-TS | Fast copy or Precision | Verified |
| H.264/AAC MOV | Fast copy or Precision | Existing regression verified |
| H.264 without audio / MP4 | Fast copy or Precision, silent output | Verified |
| HEVC Main / AAC MP4 | Explicit Precision conversion | Verified |
| HEVC Main 10 SDR / AAC MP4 | Explicit 8-bit conversion disclosure + Precision | Verified |
| HEVC PQ-tagged HDR | No unverified tone mapping | Deliberately blocked |
| VP9/Opus WebM | Explicit Precision conversion | Verified |
| VP8/Vorbis WebM | Explicit Precision conversion | Verified |
| H.264/PCM MOV | Explicit audio-only conversion or Precision | Verified |
| H.264/MP3 MP4 | Explicit audio-only conversion or Precision | Verified; MP3 passthrough replaced by AAC target |
| H.264/AC-3 Matroska | Explicit audio-only conversion or Precision | Verified |
| MPEG-4 Part 2/MP3 AVI | Explicit Precision conversion | Verified |
| H.264/AAC AVI | Explicit Precision conversion | Verified; Fast disabled for ambiguous packet timing |
| FLV1/MP3 FLV | Explicit Precision conversion | Verified |
| WMV2/WMAv1 and WMV2/WMAv2 WMV/ASF | Explicit Precision conversion | Verified |
| MPEG-2/MP2 MPEG program stream | Explicit Precision conversion | Verified |
| MPEG-4 Part 2/AAC 3GP | Explicit Precision conversion | Verified |
| FFV1/RGB Matroska, odd dimensions | Explicit 4:2:0 conversion; retain DAR | Verified |
| AV1/Opus Matroska | No usable software AV1 decoder in this core | Unsupported; real decode failed |
| Other containers/codecs listed by the loaded build | Probe + decoder/encoder checks | Candidates only; not covered by this matrix |
| Damaged/truncated MP4 | Precise malformed-header/probe error | Rejected in regression tests |
| Encrypted input or unknown/missing codecs | Explain inability; no fallback | Unsupported |

H.264 AVI with missing PTS was investigated using generated packet timestamps. Although
it could create a decodable MP4, first-frame comparison did not validate the intended
keyframe boundary. That experiment is not enabled. Conversion remains available.

## Long selections, memory and Android

Precision uses input-side absolute timestamp seeking and a duration limit. A requested
150-second trim does not decode an entire two-hour source. Only the preceding GOP and
selected range need frame decoding for indexed containers. MPEG program streams use
a bounded 30-second earlier input seek plus output trimming because their approximate
seek can otherwise jump past the requested first frame; this never means decoding
all preceding hours. Container index/header reads and the saved-project
SHA-256 fingerprint still depend on total file size. The fingerprint uses 1 MiB chunks
for source identity/security; it does not upload media and is not an encoder scan.
Packet probing uses selected entries without the core's sticky `-show_packets` switch.
Metadata probes explicitly clear packet/frame entries and reset interval/stream selectors;
real-WASM regression rejects leaked packet/frame enumeration after copy jobs.
Fast keyframe probing remains bounded to the requested window rather than the full file.

Timestamp origins are normalized to the first video track. Absolute seeking avoids a
negative audio-priming container origin causing a keyframe seek one GOP too early.
A real Matroska audio-only regression previously exposed a roughly two-second offset;
it now checks output start alignment and full decode. Where source timestamps are
missing or unreliable, Precision or an external source repair can be necessary.

WORKERFS mounts the source once without a full byte transfer. MEMFS fallback copies
once, never per clip, and is disclosed. On mobile/low-memory profiles, fallback for
sources above 128 MiB stops before allocating a full copy. This is a conservative guard,
not a measured safe Android capacity. Existing 256 MiB input and 128/512 MiB retained
output guards remain. Each UI export also uses a remaining-output-budget file-size limit;
limit-truncated files fail validation and are never shown as successful clips. This bounds
temporary file growth before a Blob transfer, although it is not an Android memory guarantee.
Download completed clips and process smaller selections to limit
retained outputs. Cancellation terminates the worker and releases its virtual state.

No Android hardware, ADB or device farm is available. UA/viewport emulation tests UI
policy only. HEVC software decoding and H.264 encoding can still take minutes on phones;
thermal limits, FPS, resolution, source complexity and browser memory matter. No fixed
completion time is inferred from megabytes. No multithread build, isolation-header
change, WebCodecs acceleration or silent resolution/FPS reduction is introduced.

## Benchmarks and HEVC remux investigation

Desktop Linux x64, Chromium 154, 2-core CPU quota, 8 GiB host cap; single-thread core.
The synthetic long source is **238,333,231 bytes / 6791.280518 seconds / 1152×480 at
24 fps, HEVC/AAC**. It is not the customer's footage. Same-host single trials, without
concurrent builds/media jobs during the timed processing:

| Precision Off requested range | Before (`9f075e7`) | This branch |
| --- | ---: | ---: |
| 0–150 seconds | 42.114 s | 42.209 s |
| 5400–5550 seconds, same source/worker | 39.779 s | 40.049 s |

Each output is 150.000 seconds. This is **not a measured HEVC speed improvement**:
conversion still needs software HEVC decode and H.264 encode. Initial local core load
was 0.234/0.285 seconds, excluded from processing times. Fingerprinting, downloads and
ZIP are also excluded. Both versions mounted the source once, wrote zero full-source
bytes and generated no keyframe-index text for Precision. Late cuts had similar cost
to early cuts; the engine did not encode all preceding 5400 seconds.

Outputs are about 76.9–77.3 decimal MB each, demonstrating possible expansion with Off.
All four long outputs fully decoded with native FFmpeg, retained H.264/AAC, and matched
first-frame source references above 35 dB PSNR. Approximate peak summed process-tree
RSS was 1112.7/1067.6 MiB. It can double-count shared pages and is not a WASM/private-heap
measurement or proof of phone capacity. No general memory or speed reduction is claimed.

The independent small matrix exports 4-second selections from 8-second synthetic files
at 320×180, including 10-bit and VFR cases. It records 20 successful combinations and
2 deliberate rejections (AV1, HDR). Timings are single observations, not user estimates.
Browser tests additionally verify rendered video frames, native full decode, codec/audio,
duration, first-frame identity for copies or PSNR >35 dB for conversions, odd-size DAR,
VFR spacing, HEVC cancellation/recovery, Balanced HEVC ZIP, and existing editor workflows.

HEVC `hvc1` remuxing took about 45 ms for a four-second sample and the file fully decoded
with native FFmpeg. However, this desktop Chromium advanced audio time while reporting
**zero video dimensions and zero decoded video frames**. Merely observing playback time
would have been a false video-playback success. This supports keeping HEVC passthrough
out of the standard H.264 export path; Android HEVC capability remains unverified.

Reproduce locally with native FFmpeg/ffprobe, Node 24 and Playwright Chromium:

```sh
npm run lint
npm run typecheck
npm test
npm run test:media
npm run build
npm run test:browser
npm run test:imports
# Set ECONTENT_CHROMIUM_PATH only when using a system Chromium executable.
# The imports script uses Playwright's browser by default, including in CI.
bash scripts/create-long-hevc-fixture.sh
node scripts/investigate-hevc-remux.mjs /tmp/econtent-import-fixtures/hevc-aac.mp4
```

For the paired long comparison, compile the baseline's `lib/video` into
`test-results/performance/site/import-before` and this branch into `import-after` with
`scripts/benchmark-compile.mjs`, then run:

```sh
ECONTENT_BENCH_LABEL=hevc-long node scripts/benchmark-video.mjs import-before /tmp/econtent-hevc-long.mp4 precision off '[[0,150],[5400,5550]]'
ECONTENT_BENCH_LABEL=hevc-long node scripts/benchmark-video.mjs import-after /tmp/econtent-hevc-long.mp4 precision off '[[0,150],[5400,5550]]'
node scripts/summarize-import-benchmarks.mjs
```

Benchmark helpers use system Chromium at `/usr/bin/chromium` except `test:imports`,
which supports Playwright's installed browser or ECONTENT_CHROMIUM_PATH. Account
regressions use the existing disposable local GoTrue/PostgreSQL/Mailpit harness only;
no hosted credentials or Auth settings are changed. CI now also runs the real-WASM
matrix, including rejection of packet/frame enumeration leaking into metadata probes.
See [import matrix data](benchmarks/import-matrix.json),
[long HEVC comparison](benchmarks/hevc-long-import.json), and
[HEVC remux investigation](benchmarks/hevc-remux.json).

HEVC passthrough can create an MP4 but preserves the HEVC decoder requirement. Setting
`hvc1` is not a transcode and does not make HEVC universally playable. The investigation
artifact is not an export target in the app: standard export remains H.264/AAC.

## Optional future conversion architecture — not implemented

A separately authorized server fallback could accept an explicit source/range selection
and upload consent, disclose that the original or a source segment leaves the device,
and show storage/processing/egress estimates and retention before upload. It should use
private per-user object storage, short-lived scoped upload/download URLs, owner-checked
jobs, bounded resumable uploads, deletion on request and a short documented retention
period. Guest processing would need separate abuse controls and quotas.

Untrusted media must be probed and converted inside isolated, resource-limited workers:
no shell interpolation, restricted FFmpeg protocols/filesystem/network, input/output size,
duration, CPU, memory and wall-time limits, patched codecs, cancellation and cleanup.
Never expose a service-role credential to the browser. Queues/jobs must not run long
media work in Vercel request handlers. Pricing/billing limits and codec/distribution
licensing require an explicit decision before provisioning. Core package license is
GPL-2.0-or-later; wrapper is MIT. Broad format support does not remove those obligations.
No server storage, uploads, queue, paid service or billing change is implemented here.

Recommended next steps: test the actual HEVC source on Android, collect codec/profile,
selected range, elapsed/progress and device/memory observations without uploading footage;
then evaluate a decoder-enabled AV1 core or optional hardware WebCodecs path with real
benchmarks. HEVC passthrough would require an explicit non-universal export label and
profile/device playback validation before being offered separately.

## Verification result for this feature

Local lint, TypeScript and builds with/without local account configuration passed.
38 unit tests, 4 native media tests, 7 browser integration tests and 2 real local
account/workspace tests passed. The independent actual-WASM matrix verified 20 successful
combinations and 2 expected rejections, asserted that metadata probes do not enumerate
packets/frames after copy work, and verified rejection of a file-size-limited partial
export. All four long HEVC conversion outputs fully decoded; first-frame PSNR was at
least 54.06 dB against source references (a boundary/fidelity check, not a whole-video
perceptual score). No original customer media or credentials are committed.

For the follow-up stall investigation, paired Fast/convert benchmarks, worker inactivity
recovery and visible processing diagnostics, see [FAST-CUT-REGRESSION.md](FAST-CUT-REGRESSION.md).
