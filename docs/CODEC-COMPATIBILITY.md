# Fast Cut codec compatibility and long trims

Branch `fix/fast-cut-codec-compatibility` builds on `perf/mobile-cut-workload` at
`edeea339f18bf9c39f7267ce5d85854d201eb8d6`, retaining the authorized account integration.
No Supabase schema, Auth settings, account code or deployment configuration is changed.

## Reported rejection

The exact reported message is present in integration commit `9416eb0` and was removed
by performance commit `36f02c8`. It comes from a pre-processing allowlist: MP4/MOV,
H.264, AAC or no audio. The tested Preview may still be serving the older integration
rather than the performance branch. MP4 names, dimensions, duration and file size do
not identify codecs. Without this source or its probe report, **its actual codec and
specific rejection remain unknown**. We have not reproduced its Android failure.
Rejection occurs before encoding or keyframe indexing, so 0%/0 clips is expected;
the reported 13 seconds cannot be attributed to an encoder or the keyframe scan.
Core download/loading, metadata probing and device conditions can contribute.

Use **Check codec compatibility** after selecting/reconnecting a source. It loads the
local worker, inspects without decoding frames, displays video/audio codecs, demuxer
container name, Fast eligibility and reason, and creates no output. The same cached
inspection/mount is used when processing. Browser preview failure does not imply
FFmpeg remux failure; inspection can supply editor metadata for such sources.
The processing action also performs this preflight before any copy/encode starts.

## Stream-copy policy

| Video | Audio | Input container | Fast Cut |
| --- | --- | --- | --- |
| H.264 | AAC, MP3, or none | MP4/MOV family, Matroska | Enabled, MP4 remux without re-encoding |
| HEVC, MPEG-4 Part 2, VP9, AV1, others | Any | Any | Disabled; explicit Precision conversion may work if this core can decode it |
| H.264 | AC-3, Opus, PCM, others | Any | Disabled; explicit Precision converts decodable audio to AAC |
| H.264 | Supported audio | Other containers, e.g. MPEG-TS/AVI | Not validated; re-export or explicitly try Precision |

One video track, zero/one audio track, and no extra subtitle/data/attachment tracks
are required for Fast Cut. Multiple tracks, cover-art video and identified encrypted
tracks receive a stream-configuration reason rather than silently discarding tracks.
Unknown codec/container metadata is distinct from a detected unsupported codec.
Missing MP4 moov atoms/truncated headers receive a malformed-metadata error;
unreadable probe output/runtime failures report probe failure and unknown compatibility.
Raw FFmpeg logs and local filenames are not included in diagnostic messages.

HEVC and additional MP4-legal codecs are deliberately not enabled just because MP4
can contain them: decoder/browser availability differs, especially across devices.
The policy describes supported **remuxing**, not universal preview playback. No native
Android playback claims are made. Precision is always an explicit choice, never a
fallback; Off still re-encodes when Precision is selected. Damaged/encrypted files
may require a fresh authorized source export rather than Precision.

## Long-source performance

The previous compatible Fast path scanned every video packet in the full source to
build its keyframe index. It did not decode the full video, but unrelated hours still
created probe work and a large intermediate packet-text file. The new path seeks to
10 seconds before the selected start (demuxer seek lands at a preceding GOP), scans
only through the selected end rounded up to a 30-second bucket plus one second, and
retains only this window's numeric keyframes. The bucket is bounded to source duration;
its extra slack allows nearby clips to reuse inspection. Each new window replaces the
old cache. Input-side `-ss`, output `-t`, stream copy, one source mount and one worker
are preserved. Container header/index loading can still depend on total file size;
WORKERFS avoids full-source copies where available. MEMFS fallback still copies once.
Large outputs, source indexes, fingerprinting, ZIP and the WASM heap still use memory.

Desktop Chromium 154, Linux x64, 2-core quota / 8 GiB host cap, single-thread core
0.12.10. Synthetic fixture: 239,281,832 bytes, 6791.197 seconds, 1152×480 at 24fps,
H.264/AAC. Generated with `scripts/create-codec-benchmark-fixture.sh`. It matches
approximate reported dimensions/duration/size but **is not the user's footage**.
Single trials on the same host with no concurrent builds/media jobs:

| Requested range | Before processing | After processing |
| --- | ---: | ---: |
| 0–150 seconds, first job | 4.520 s | 0.548 s |
| 5400–5550 seconds, same worker/source | 0.229 s | 0.408 s |
| Sum | 4.749 s | 0.956 s |

Times include source/keyframe preparation, copy and output verification/read; exclude
initial core loading, account fingerprinting, downloads and ZIP. Local core loading
is recorded separately in the [raw summary](benchmarks/codec-long-trim.json).
The first scan fell from 4.094 s for the full file to 0.178 s for `0%151`.
The late window was `5390%5551`, 0.174 s. Generated packet text was 4,859,567 bytes
before (one cached full scan), versus 222,699 bytes after (two bounded scans total).
A cached full index can make subsequent arbitrary trims faster; this change trades
that for much faster first short trims and bounded index work/storage per window.
Approximate peak summed process-tree RSS was 891.5 MiB before and 866.6 MiB after;
shared pages can be double-counted, so this is not a true WASM/private-memory measurement
or proof of Android memory capacity. Small JS heap numbers do not describe WASM memory.

Before/after output pairs have identical SHA-256 hashes. All four MP4s fully decoded
with native FFmpeg `-xerror`. Keyframe snapping is unchanged: the first synthetic trim
has about 140.096 seconds exported, the late trim about 150.128 seconds, including
timestamp padding. These are **not exact 150-second guarantees**. The looped fixture
has approximately 10-second GOPs and shifted keyframe timestamps. Output targets and
actual durations remain visible. Precision remains available for accurate boundaries.

## Verification scope

Unit tests cover supported policies, unknown metadata, unsupported video/audio codecs,
containers, extra/encrypted tracks, malformed-vs-probe errors, no silent fallback,
source reuse and bounded range arguments. Native media regression tests retain all
Precision compression presets, silent portrait, Fast keyframes and A/V sync.
Browser tests use the real WASM worker to inspect, export, decode, preview/play and
download H.264/MP3 MP4, H.264/AAC MOV and Matroska. They compare common A/V packet offsets,
reject MPEG-4 Part 2 and AC-3 MP4 with specific reasons, and distinguish truncated MP4.
Existing editor tests retain ZIP, cancellation, compression, progress and mobile UI
policy coverage. Account tests use disposable local GoTrue/PostgreSQL/Mailpit only.

Local results: lint, TypeScript and builds passed; 31 unit tests, 2 native media
tests, 4 editor browser tests and 2 real local account browser tests passed. No
hosted Supabase schema or authentication configuration was modified.

No Android hardware, ADB or device farm is available. Android speed, memory and playback
remain unverified; desktop UA/viewport emulation tests only UI behavior. This branch
has not been manually deployed, merged into main or deployed to production.

Current import/export extension: [VIDEO-IMPORT.md](VIDEO-IMPORT.md). It supersedes the
earlier passthrough audio policy: standard exports now use AAC, with explicit audio
conversion when needed, and verified broader inputs may use Precision conversion.
