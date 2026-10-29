# Fast Cut regression investigation and worker recovery

Base: `feature/broad-video-import`, `ca760fb055985b8186ad2de55b8c4359437d55e1`.
Comparison: previous Fast Cut engine `9f075e7a12eda22d6b721c09bb0f022233876998`.
Fix branch: `fix/fast-cut-stall-recovery`.

## Findings and scope

The reported Android stall has **not** been reproduced: the source, selected method,
compression, range and last stage for that exact run were not recorded. An earlier
source was HEVC/AAC MP4, but it must not be assumed to be the stalled source. No
Android hardware, ADB device or device farm is available here.

Controlled real-WASM comparisons did not find a Fast Cut slowdown introduced by broad
imports. Compatible jobs use `-c copy`, input-side seek and bounded packet-only
keyframe windows. They do not start a conversion. Every benchmark mounted its source
once with WORKERFS and wrote zero full-source bytes. Metadata and source state remain
cached across clips. Capability inventory is checked once; local initialization remained under 0.4s in
these runs. Network download/compilation can be much slower on a cold mobile connection.

The supplied existing Preview was checked against Vercel metadata: deployment
`dpl_3jxSiwvtAaReJKmWPWHmEtpgEubV` is Ready at the intended base commit, not an older
Fast Cut build. A different saved URL, browser cache or service worker on the reporter's
device cannot be established from this check.

Two concrete failure-handling defects were found:

1. Wrapper 0.12.15 tracks worker requests using message IDs, but does not attach a native
   worker error handler that rejects pending requests. A failed worker script/startup or
   worker loss can leave load/probe/encode/read promises unresolved. This was reproduced
   by blocking the real worker script. Previously there was no application timeout.
2. Repeated, non-advancing media timestamps refreshed progress freshness. That could
   leave an old ETA looking current while no additional measured work was occurring.

Neither proves the cause of the reporter's particular Android run. Conversion CPU cost,
core download, memory pressure, background suspension, damaged indexes and device thermal
limits remain possible contributors.

## Targeted fix

- Guard every asynchronous worker request, including loading, mounting, probing, copying,
  encoding and reading outputs. After 120 seconds without a response or **advancing**
  valid media timestamps, reject the operation, terminate the worker, release source and
  capability state, and present a shorter-range/fresh-worker/Fast Cut recovery message.
  Repeating the same timestamp or producing log messages does not extend this deadline.
- Cancellation rejects outstanding requests even when the underlying worker never replies.
  Retrying loads a fresh worker. No partial file is accepted as completed.
- Preserve the last stage message across timestamp-only callbacks. Show the current/last
  operation and its actual elapsed time outside a collapsible diagnostics panel. Inside
  the panel, show time since the last advancing media measurement and explain the safety
  limit. Operations distinguish core loading, capability inventory, read-only mounting,
  MEMFS fallback, metadata, selected-window keyframes, stream copy, encoding and output
  verification/read. No source contents, credentials or filenames enter diagnostics.
- Repeated timestamps no longer refresh progress freshness or ETA. Missing/stale work
  remains indeterminate; completion still requires validated output bytes.

This is an inactivity safety policy, not a two-minute completion guarantee or proof of
worker death. Very slow valid operations with no observable progress can be stopped.
A suspended tab can delay timers; a browser that kills the entire page cannot display
an in-page recovery message. Keep the tab foregrounded. Conversion remains explicit,
range-limited, lossy and potentially expensive; there is no automatic encode fallback,
resolution reduction, new core/thread build, cloud upload or paid service.

## Paired desktop benchmarks

Linux x64, Chromium 154, two-core CPU quota, 8 GiB host limit, single-thread core 0.12.10.
Single sequential trial per case/version, not a statistical speed claim. Times below
include locally served core initialization/capability checks, source/keyframe preparation,
processing, MP4 metadata verification and Blob read. They exclude page navigation, file
selection/account fingerprinting, network conditions on a phone, downloads and ZIP.
Actual deployed UI click-to-completion checks are reported separately in delivery.

| Workload / compression Off | Previous Fast Cut engine | Broad-import base | Fix |
| --- | ---: | ---: | ---: |
| 30.07 MB H.264/AAC 720p, seven 30s clips | 1.807s | 1.843s | 1.709s |
| 70.31 MB H.264/AAC 720p, sixteen 30s clips | 4.121s | 4.007s | 3.918s |
| 239.28 MB / 6791s H.264/AAC, trim 5400–5430s | 0.613s | 0.599s | 0.576s |
| 238.33 MB / 6791s HEVC/AAC 1152×480, convert 5400–5430s | 9.347s | 9.712s | 9.209s |
| VP9/Opus 720p WebM, convert 1.25–31.25s | 19.802s | 19.914s | 19.934s |

The seven/sixteen-clip runs omit each source's tiny final remainder. Fixtures use the
licensed Sintel trailer for 720p and synthetic long sources, not private user footage.
Source sizes do not predict conversion cost. Local initialization was roughly 0.24–0.32s.
The fix's encode commands took 8.72s HEVC and 19.53s VP9 versus 0.62s/1.55s total stream copying
for seven/sixteen clips. Conversion, rather than repeated loading or decoding unrelated
hours, dominates these conversion tests. The late H.264 keyframe scan was bounded to
5390–5431s; conversion produced only 30s of output from the late selected range.

Peak summed process-tree RSS was approximately 757–914 MiB across fixed cases, with
sampled process-tree CPU roughly 0–20 seconds (one-second resolution). Shared pages can
be double-counted. This is neither private WASM memory nor measured Android memory,
and does not demonstrate a memory improvement. No Android 3–7-second guarantee is made.

All 78 benchmark MP4s fully decoded with native FFmpeg. All 72 Fast first frames matched
their aligned source keyframes byte-for-byte; copied video/audio packet offset spread
was at most 0.686 ms. The six converted outputs were 30.000s H.264/AAC, with first-frame
reference PSNR at least 53.704 dB. Audio validation uses packet/timestamp checks, not
subjective listening. Keyframe limits and MP4 padding remain: Fast durations/boundaries
can differ from requested values. See [machine-readable measurements](benchmarks/fast-cut-regression.json).

## Reproduction and regression coverage

Preserve each baseline's `lib/video` under ignored `test-results/regression/`, then use
`scripts/benchmark-compile.mjs` to compile versions to `test-results/performance/site/`.
Generate fixtures with `create-mobile-benchmark-fixtures.sh`,
`create-codec-benchmark-fixture.sh` and `create-long-hevc-fixture.sh`. The VP9 sample is a
35s Sintel excerpt encoded with libvpx-vp9 `deadline=realtime`, `cpu-used=8`, 1500k video
and Opus 96k. Run `benchmark-video.mjs VERSION FILE METHOD off RANGES` with
`ECONTENT_BENCH_LABEL` set to each case name. Exact ranges are in the JSON artifact.
Run versions sequentially without concurrent builds/media jobs.

Use `verify-benchmark-outputs.mjs REPORT...` for full decode, first-frame and packet-sync
checks. Its source packet verification now reads the selected window, avoiding an
unnecessary multi-hour JSON dump/20 MiB buffer overflow in this offline test helper.
No verification limit is relaxed.

Automated regressions cover lost replies during load/probe/copy/encode/read, cancellation
while unresponsive, fresh-worker retry, advancing-work timeout renewal, stale/repeated
progress, stage-message retention and diagnostic elapsed clocks. A real Chromium test
blocks worker startup, advances only the test clock through the safety timeout, checks
failure/no output, then unblocks startup and completes Fast Cut with a fresh worker.
Existing broad import, HEVC cancellation/compression, ZIP, precision and guest workflows
remain in the browser suite. No Supabase schema, Auth code, RLS or account settings were
changed. The fix Preview receives the same authorized public account configuration,
scoped to its dedicated branch; email callback allowlisting still requires owner setup
for a new Preview origin.

Local verification passed: lint, TypeScript, Next build, 44 unit tests, four native
media tests, eight Chromium editor tests and the 22-case real-WASM import matrix
(20 exports and two deliberate rejections). The final worker-recovery case was rerun
against the rebuilt delivery code. A metadata-loading race in that new test was fixed
by waiting for the source's real duration before setting its trim and installing the
test clock. Final rerun outputs were byte-identical to all 26 previously decoded fixed
benchmark outputs. Hosted email flows and real Android behavior are not established
by these tests; repository CI account verification is reported separately.
