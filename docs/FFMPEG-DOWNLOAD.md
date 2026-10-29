# FFmpeg download delivery and caching

This investigation compares commit `10a7c68a97b2da3145839eaf9dd10731cb873dc7` with the download fix. No Android hardware was available. The reported phone failure is a download timeout; its particular network trace and throughput are unknown.

## Confirmed findings

The existing Preview returned complete HTTP 200 JavaScript/JSON/WASM with correct MIME types, no asset redirects after Preview authorization, and no observed CSP/CORS blocker. It already used Brotli: the captured WASM response was 9,646,830 compressed bytes, expanding to 32,232,419 bytes. Unversioned assets used `public,max-age=0,must-revalidate`. The core JavaScript was fetched for preflight and then imported. There was one WASM download per fresh worker, not multiple cores per clip.

Repeated fresh-worker tests downloaded the WASM again on warm reloads. Immutable HTTP headers alone also failed to eliminate that transfer in our Chromium test, so this fix adds an explicit verified Cache Storage entry. This is a demonstrated delivery/cache weakness, not proof of the specific Android network failure.

## Delivery fix

All runtime assets now come from the same deployment under the content-addressed release below, with one-year immutable caching. Build-time Brotli quality 11 reduces the cold WASM body to 7,280,521 bytes (24.5% below the captured previous response), without changing the binary. The core JS is imported once. Cache Storage retains only the public engine binary, keyed by decoded SHA-256; no video, account data or credentials are cached there. Streamed magic, exact size and incremental SHA-256 validation run before a cache write can commit and on every cache read. Corrupt entries are removed; explicit retry creates a fresh worker. Cache failures/quota/eviction allow a network load and show a warning.

Release prefix: `/ffmpeg/releases/12ffe595eca7bdfe49fbe9d4d5b31e9d8d3a2ac67c738d12a347055512cead73`

| Asset suffix | Decoded bytes |
|---|---:|
| `hash/sha2.js` | 19,112 |
| `hash/_md.js` | 8,372 |
| `hash/_u64.js` | 4,972 |
| `hash/utils.js` | 20,182 |
| `startup-worker.js` | 758 |
| `core-loader.js` | 7,803 |
| `ffmpeg/worker.js` | 5,085 |
| `ffmpeg/const.js` | 1,016 |
| `ffmpeg/errors.js` | 332 |
| `core/ffmpeg-core.js` | 111,804 |
| `core/ffmpeg-core.wasm` | 32,232,419 |

Each URL is the Preview origin plus that release prefix and asset suffix. The release manifest is `asset-manifest.json`. WASM is served with `Content-Type: application/wasm` and `Content-Encoding: br`; all JS modules use JavaScript MIME. The root manifest remains available at `/ffmpeg/asset-manifest.json` for auditing.

Decoded WASM SHA-256: `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`.

## Timing and diagnostics

The existing five-minute download ceiling and 30-second no-new-byte guard are unchanged. The ceiling starts before request headers and ends at decoded EOF; it includes request queue/TTFB/streaming and overlapping compiler backpressure, not subsequent runtime initialization. There is no automatic download retry loop. Cache lookup and optional cache persistence now have separate bounded phases (1-second lookup and 5-second optional write wait; parent cache guard 10 seconds), outside the download budget. Worker startup, JS loading, streaming read, compile finalization and runtime initialization retain distinct failure messages.

Progress counts actual decoded bytes against the pinned decoded size, explicitly distinguished from compressed network bytes. Resource Timing reports transferred/body bytes where available; unavailable measurements are not invented. Cache hits report zero WASM network bytes and measured cached-read time. Streaming compilation overlaps downloading: compile-finalization time is only the work remaining after EOF, not total compiler CPU time.

## Controlled cold/warm measurements

Desktop Chromium, real paced HTTP response bodies, default browser cache, no route interception. Warm means same browser context, page reload and a fresh worker. These profiles model throughput/latency, not Android CPU, radio or memory behavior. Each output was natively probed/decoded. The selected four-second H.264/AAC cut took about 0.08–0.13 seconds after startup; these are engine-loading benchmarks, not 30 MB end-to-end or Android speed claims.

| Profile | Previous cold / warm | Fixed cold / warm |
|---|---|---|
| 1.6 Mbps, 150 ms latency | 50.04 s / 49.50 s | 38.57 s / 0.56 s |
| 512 kbps, 300 ms latency | 154.83 s / 153.17 s | 118.80 s / 0.56 s |

Previous cold and warm WASM transfers were each 9,646,830 bytes; fixed cold transferred 7,280,521 and fixed warm transferred zero. Detailed measured timings and request summaries are in [benchmark data](benchmarks/ffmpeg-download.json).

Reproduce current: prepare assets (`node scripts/prepare-ffmpeg.mjs`), generate the import fixtures with the existing import-matrix runner, compile `lib/video` into `test-results/download-fix/current-engine` using `scripts/benchmark-compile.mjs`, then run `node scripts/benchmark-download.mjs current 64000 300` (set `ECONTENT_CHROMIUM_PATH` when needed). The historical comparison additionally requires the base compiled engine/worker/loader/manifest snapshots under `test-results/download-fix/base` and the captured previous Brotli response at `/tmp/econtent-base-wire.br`; these ignored audit artifacts are not application dependencies.

## Limits

Very slow or stalled cold connections can still reach the unchanged ceiling. Storage may be denied or evicted. Cache Storage is origin-specific: use the stable branch Preview URL for repeated tests; a new canonical deployment hostname starts cold. The binary hash key allows reuse across releases on the same origin. Streaming cache writes can add worker-side buffering; no Android memory improvement is claimed. No Android device testing was available. Account routes, Supabase, video commands and codec decisions are unchanged.
