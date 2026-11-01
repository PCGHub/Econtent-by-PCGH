# Cinematic Titles export recovery — active investigation

Scope: Titles and necessary shared FFmpeg infrastructure only. Branch
`fix/titles-export-performance`, starting at `9350c0cc8567493cf129a7e37ff53c769fcd8a29`.
Earlier transcription work is preserved separately on `integration/transcription-studio`
at local WIP `1f278db` (functional checkpoint `decab99`). None of it is imported here.

## Confirmed source-code mismatch (deployment verification next)

`9f8c065` / `9350c0c` changed `scripts/prepare-ffmpeg.mjs` to publish raw WASM:
`const packed=wasm`, `wasmEncoding:'identity'`, 32,232,419 bytes.
`next.config.ts` still declares `Content-Encoding: br` for those same URLs.
A browser will attempt Brotli decompression of a raw WASM response, which can surface
as a network/ReadableStream failure before the core can initialize. This is an
actual code inconsistency; the affected deployed response must be measured before
claiming it explains the user's particular run.

The loader also has a verified-cache read path but no cache.put after successful
verification in 9350c0c. Warm offline behavior cannot meet the existing cache tests.
It still uses TransformStream despite the prior change's stated streaming concern.

## Inspected

AGENTS.md, README.md, docs/ARCHITECTURE.md, rendering/FFmpeg docs;
scripts/prepare-ffmpeg.mjs; workers/ffmpeg-core-loader.js;
workers/ffmpeg-startup.js; lib/video/ffmpeg-transport.ts;
lib/titles/renderer.ts and commands.ts; next.config.ts;
tests/e2e/asset-cache.spec.ts; recent eight fix commits.

## Next steps

1. Inspect authorized Vercel Preview for the exact 9350c0c commit and fetch its
   manifest/JS/WASM with protection handled through supported share access.
2. Reproduce the raw-Brotli mismatch locally and record HTTP/header/magic evidence.
3. Align encoding metadata/body, simplify bounded reads, restore verified caching,
   validate failure/retry and fresh workers. Do not change timeouts as a substitute.
4. Benchmark actual 7/27/60-second Titles exports (cold/warm), animations/credits,
   sizes/frame rates, playback/audio and cancellation; run all required checks.
5. Push verified commit, deploy only to existing Econtent Preview project/team,
   verify actual hosted export, and record IDs/timings here.

No new tests or deployment has been claimed for this recovery yet.
No database, Auth, navigation, Cutter/Overlay/Transcription UI or billing changes.

## Implemented repair (local, not yet deployed)

- Restored verified Brotli generation and the matching existing `Content-Encoding: br`
  contract. Fresh release `bd32aff7f580…` has 8,367,469 wire bytes / 32,232,419 decoded
  bytes. Build verifies decompressed bytes/magic/hash; browser tests validate the
  actual HTTP header/body pair. The incorrect release remains immutable and unused.
- Replaced TransformStream/Response reconstruction with a bounded 32 MiB reader.
  Length, magic and SHA-256 are checked before compilation. Response read errors now
  identify byte counts and the Content-Encoding/network checks needed.
- Restored atomic verified CacheStorage writes, with bounded best-effort storage time.
  No media is cached. Corrupt cached data is deleted before explicit fresh retry.
- Kept existing worker handshakes, finite startup deadlines, cancellation and renderer.
  No timeout increase, format/quality reduction or unrelated feature modification.

## Verification so far

Local Chromium reproduced the old contract: HTTP 200, application/wasm,
Content-Encoding br, Content-Length 32232419, then body read TypeError: Failed to fetch.
The original raw build artifact is raw WASM; Brotli decoding is therefore invalid.

TypeScript and production build passed. Eight focused browser cases passed: cold/warm
asset cache, corrupt-cache recovery with a blocked network, HTTP/MIME/binary/compile
errors, cancellation/retry, real Titles MP4 output, animation/credit pixels, background
video/audio loops and explicit download failure recovery.

Full lint found an **unchanged baseline error** in components/transcription-studio.tsx:79
(react-hooks/set-state-in-effect) plus two unused import warnings. This is outside
explicit Titles scope and has not been edited or suppressed. Scoped lint will be run.
The unit suite exposed a stale five-minute message expectation after the earlier
three-minute timeout commit; the infrastructure test was updated to the existing
three-minute message without changing a runtime deadline.

Performance tests for actual 7/27/60-second UI exports are running; do not claim PASS
until completed. Individual output files/results are in test-results/titles-performance.

## Hosted access blocker

Vercel confirms READY Preview `dpl_GBzQDdXHHdT5w8zY2V1UHGw6MQBK` at
https://econtent-by-pcgh-2bh6mxhkm-pcgrowthhub-2263s-projects.vercel.app,
exact branch/commit 9350c0c. Actual protected asset/browser inspection is not yet done.
Automatic approval review rejected creating a Vercel share link because it grants
link-based access beyond a specifically approved audience. Do not call web_fetch
or another indirect method that creates the same link. Existing CLI/OIDC access is
being checked; do not disable protection or TLS checks. If no narrower access is
available, obtain approval for a temporary link to the concrete repaired Preview.

## Measured local exports — executed, passed

Actual UI export, MP4 download, native ffprobe codec/duration/frame counting and
browser playback passed for all four cases (desktop Chromium, no Android hardware):

| Case | Total render/validation time | Size | Video frames |
| --- | ---: | ---: | ---: |
| 7 s, 640×360, 24 fps, cold | 4.095 s | 714,048 bytes | 168 |
| Default 27 s / 3 scenes, 854×480, 24 fps, warm new worker | 17.259 s | 5,542,817 bytes | 648 |
| 60 s / 3 scenes, 640×360, 30 fps, warm new worker | 27.349 s | 7,217,274 bytes | 1,800 |
| 7 s, 1280×720, 30 fps, warm new worker | 12.163 s | 4,262,950 bytes | 210 |

All exported H.264/AAC. The last MP4 container duration was 7.010667 s (normal AAC
packet padding); frame count is exactly 210. The final warm worker measured zero
network body bytes, 504.9 ms cache read, 65.5 ms compile and 14 ms runtime initialization.
Cold/warm startup snapshots will be expanded in the full regression run. Raw evidence:
`docs/benchmarks/titles-export-recovery.json`. These are measured desktop results,
not a five-second universal promise or Android claim.

WebCodecs H.264 configuration is supported by this desktop browser; MP4 MediaRecorder
is not. No new native encoding backend was introduced: it needs separate mux, audio,
mobile and parity benchmarking before replacing a tested deterministic renderer.

TypeScript and all 76 units now pass. Scoped lint passes for changed infrastructure
and tests. The unrelated baseline global-lint error remains documented above.
Native media and full browser regressions are running next.
