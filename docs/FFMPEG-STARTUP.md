# Android FFmpeg startup investigation

Base: `7daa82f8f60614b1decfa6aaef63dbae60cdc2d8`, branch
`fix/fast-cut-stall-recovery`. The reported phone stopped in **Loading FFmpeg**, before
encoding. Its exact model, OS/Chrome versions, memory and direct/in-app browser context
remain unknown. No Android device, ADB connection or device farm is available here.

## Findings

The old `ffmpeg.load()` bundled worker creation, core module fetch, 32.2 MB WASM download,
compilation and runtime/memory initialization into one unresolved request. The generic
120s processing inactivity guard also wrapped that entire startup request. There are
no media timestamps to advance during loading, so a healthy slow download could hit
that deadline. The previous wrapper did not reject native worker/message errors.
The reported timeout alone cannot distinguish any of those causes. It establishes
neither slow encoding nor a video-size/codec problem.

The supplied Ready Preview was audited with authorized access. Its worker JavaScript,
core JavaScript and WASM all returned HTTP 200, correct JavaScript/application-wasm
MIME types and bytes matching the pinned package SHA-256 hashes. WASM length was
32,232,419 bytes with `00 61 73 6d` magic. No redirect, CSP or cross-origin-isolation
header was present on those responses. This does **not** prove what the Android
session downloaded or exclude expired Vercel authorization, an in-app browser policy,
unsupported browser instructions, device memory pressure or background suspension.
Same-origin workers/assets need no CORS relaxation; the single-thread core requires
no SharedArrayBuffer/COOP/COEP changes. No such headers were changed.

## Changes

A small typed transport keeps the pinned upstream 0.12.15 worker's command/filesystem
protocol and the same core 0.12.10. It waits for a worker-ready handshake before posting
LOAD, handles native `error` and `messageerror`, rejects all pending requests on failure
and terminates the worker. A bounded final LOAD acknowledgement is also required.
A worker lost between jobs invalidates cached source mounts/metadata before replacement.

The bootstrap imports the upstream worker from the same origin. A core-loader module
uses explicit same-origin paths and credentials, checks HTTP status, redirects and MIME,
and checks the manifest version, WASM magic and exact byte count. The upstream default
CDN URL/core-version constant is not used. There is no external CDN dependency.
Build preparation now emits a version/size/SHA-256 manifest. Runtime checks version,
size and magic; cryptographic hash comparison is part of deployment verification.
Both postinstall and prebuild prepare assets to prevent stale generated files in a
cached checkout. No dependency/core version is upgraded.

WASM compilation streams bytes in the worker, with measured received/expected bytes
sent to the UI. Compilation can overlap downloading; its final phase begins when all
bytes are received. `compileStreaming` absence uses a buffered worker-side compatibility
branch. The precompiled module is passed directly to runtime instantiation, avoiding a
second WASM fetch or a main-thread full-binary transfer. This is an allocation strategy,
not an Android memory benchmark or guarantee. The core still needs substantial memory.

| Phase | Safety policy |
| --- | --- |
| Module-worker startup handshake | 15s, native failures reject immediately |
| Core-JS and WASM download phases | 30s without new reported bytes; 5-minute absolute limit per phase |
| WASM compilation after download | 60s |
| Runtime/memory initialization | 60s |
| Final LOAD acknowledgement | 15s |
| Processing/probing/filesystem commands | Existing 120s without response or advancing valid media timestamps |

These are separate failure limits, not a completion ETA or a blind increase of the old
timeout. Only advancing bytes extend download inactivity; repeated messages cannot.
The absolute download limit remains bounded. Runtime failures include abort/allocation
or instantiation errors where observable. A browser killing the entire page cannot
produce an in-page recovery message; a suspended tab can delay timers.

The white/blue progress panel shows the startup operation, its elapsed time, real
FFmpeg download bytes and an accessible download progress bar. Last measured bytes
remain visible after a download failure. Download progress does not advance video-job
percentage, ETA or completion. Cancellation stays accessible. A retry using Process
video creates a fresh worker with no partially initialized state; validated immutable
browser asset caches may be reused. Fast Cut, codec capability inventory, source reuse,
range seeking, compression, outputs and ZIP are retained. No Supabase/Auth/RLS settings,
schemas, Vercel environment variables or billing changes are needed.

## Regression evidence and limits

Tests exercise native worker/script loss, message errors, HTTP 401, redirected/HTML
asset responses, invalid WASM magic, compilation failure, download inactivity, cancellation,
fresh-worker recovery, buffered compilation fallback, idle worker loss and final LOAD
acknowledgement loss. Source-metadata readiness is awaited before editing test ranges.

A real-WASM standalone browser test streams the actual binary in eight portions. It
advances the parent test clock by seven 18s steps (126s), waiting for measured bytes
between steps, then initializes and performs a Fast Cut. It verifies one WASM request.
This is a real binary/worker and a simulated deadline test, not a real 126s network or
Android benchmark. It directly protects against the old blanket two-minute load guard.

The standard native, broad-format, Fast/Precision, HEVC cancellation, MP4 playback,
ZIP and account CI suites remain required. Deployment reports identify exact commit,
Ready URL and results separately. Android success cannot be claimed without another
real phone run. The new failing phase, download byte count and native error should
be recorded on that run; do not infer the cause from source file size.

Local checks passed: lint, TypeScript, build, 52 unit tests, four native media tests,
11 browser tests and the 22-case real-WASM matrix (20 exports/two deliberate rejections).
Five startup/recovery/Fast browser cases were rerun after the final changes. CI reruns
the entire suite on the pushed commit. In idle-host desktop Chromium trials, startup
plus seven 30s Fast clips from 30.07 MB took 1.945s (load 0.319s); sixteen clips from
70.31 MB took 3.764s (load 0.286s). Each used one WORKERFS mount and zero full-source
writes; all 23 MP4 outputs were byte-identical to the previously fully decoded outputs
at the base commit. These locally served single trials exclude phone/network behavior,
file selection/fingerprinting, downloads and ZIP. They are not an Android speed claim.
