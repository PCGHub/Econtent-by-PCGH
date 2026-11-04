# Cloud project media — preview only

Branch: `feature/cloud-project-storage`, based on multitrack/editor commit `2d652bd`.
No merge into main or production deployment is authorized.

## Activation status

The hosted development migration was declined by the approval system on 2026-11-04,
without a stated reason. It was not reapplied through another tool. The migration,
Edge cleanup function, and scheduler are therefore **not active** in the hosted
preview. Frontend code can be reviewed in Preview, but cloud upload/restoration and
multitrack cloud saves cannot be accepted as working there until backend activation
is approved. Existing metadata-only Cutter/Overlay/Titles flows remain available.

Local verification: all 102 unit tests, 8 native media tests, 4 Chromium regression tests (including real MP4/ZIP outputs, mobile controls and honest guest saving), TypeScript and the optimized build pass. Scoped ESLint has no errors (two existing native-image warnings); repository-wide lint retains unrelated existing errors.
A rolled-back local PostgreSQL test verifies migration syntax, confirmed-user
checks, byte-size RLS, owner isolation, blocked self-promotion, safe project deletion,
exact quota release, and Premium limits. This uses temporary Storage metadata; it
is not a physical object-provider test. Actual Storage API browser tests are written
but could not run because Docker's VFS copies exceeded the environment's disk cap.
The smaller-image recovery was also attempted; no hosted test data was substituted.

## Product behavior

Free accounts receive 500,000,000 bytes at any time and 3-day project retention.
Premium accounts receive 5,000,000,000 bytes and 30-day retention. This is occupied
space, not a daily/monthly upload allowance. Deleting actual cloud objects releases
space. Pending upload reservations also consume capacity until cancelled/deleted or
cleaned up after one hour. Retention starts at project creation; editing/opening a
project does not extend it. Existing projects whose windows have expired retain
settings but need a new project for a new cloud storage window.

Cutter Save includes an explicitly disclosed, optional source upload. Multitrack
Save project and source files saves its full timeline/source registry and uploads
originals. Both save subsequent editing settings automatically. Overlay and Titles
save settings automatically after their first save; use **Save source files to
workspace** to upload their backgrounds, layers and music. All saved project types
restore cloud media on opening, checking the original SHA-256 and byte size. Local
file reconnection remains available for expired/missing files. No video processing
runs on Vercel; it remains in the user's browser.

Completed status describes the latest local render, not a stored output. MP4/ZIP
exports remain local unless the user explicitly saves the exported file in Library.
Library now uses the same quota/expiry registry; the old unmetered Library upload
path is closed in the development database. Saved metadata and editing decisions
are retained after physical media deletion. Local browser copies are separate and
are not erased by cloud expiry.

## Development capacity and pricing

This initial preview uses the existing `econtent-dev` Supabase project, not R2.
No paid resource or billing change is made. Its free development limits mean cloud
uploads are capped at 50,000,000 bytes per object and the whole preview is capped
at 900,000,000 reserved/stored bytes. These are in addition to account limits and
existing browser processing safety limits. The nominal 5 GB Premium policy cannot
be fully consumed within this shared test capacity. Premium rules are tested with
administrator-granted entitlements; there is no paid checkout or user-accessible
plan promotion switch.

The earlier R2 storage estimate does not apply to this Supabase-backed preview.
R2 credentials, bucket CORS, and a private object-provider adapter would be needed
before switching providers for larger-scale pricing. No claim of a guaranteed
monthly hosting/processing bill follows from a storage quota alone.

## Security and accounting

`project_media` is owner-readable under RLS, with no client write grants. A private
security-definer RPC implementation verifies confirmed/non-anonymous identity,
project ownership, expiry, actual file metadata and quotas. A public security-
invoker wrapper exposes only those operations. Neither JWT `user_metadata` nor
client-submitted plan names authorize Premium. `storage_plans` is owner-readable
and administrator/service-role writable only.

Reservations serialize with an advisory transaction lock, including the preview-
wide capacity check. The Storage API's INSERT RLS checks the reserved path, owner,
actual size and upload lease while holding a row share lock. No overwrite/update
policy is granted. Downloads require a ready/unexpired owned record (deleting
records remain selectable so the Storage API can remove them). A deleting record
cannot be reused for upload. Quota is released only after the Storage API has
removed its object; failed deletions keep the reservation for retry. Direct project
Data API deletion is rejected while media records remain, preventing billable
orphan files. Reusing one original across timeline clips stores it once per
project; different project uploads are separate physical copies and count separately.

An upgrade extends only unexpired media to 30 days from project creation. An
entitlement downgrade/expiry reduces capacity for new uploads, preserves existing
promised file deadlines, and leaves current projects readable. No automatic
subscription charging is implemented.

## Cleanup

`project-media-cleanup` is an Econtent-development Edge Function with gateway JWT
verification enabled. It accepts POST only and no arbitrary object targets. A
project anon JWT may trigger only the same due-file cleanup; credentials used to
remove objects are obtained inside the Edge runtime, never sent to browsers.
It marks due rows deleting, removes files using the Storage API, and only then
releases accounting. Failed jobs are retryable. Active files cannot be selected by
caller-supplied IDs/paths. It also removes abandoned upload reservations.

After approval, configure the development database's `pg_cron`/`pg_net` schedule to run every 15 minutes. Expiry
blocks ordinary reads immediately; physical cleanup/released capacity may lag by
the scheduler interval or longer during service failure. Metadata stays saved.
The UI displays exact expiry and an hours-remaining notice in the final 24 hours.
Email reminders are not configured; no email delivery is claimed.

## Reproducible checks

`npm ci`, `npm run typecheck`, `npm test`, `npm run test:media`, `npm run build`.
New unit tests validate expiry boundaries and full timeline serialization/input
validation. The disposable local account stack now includes the actual Supabase
Storage API and filesystem backend. Start with `npm run test:account:setup`, build
against its generated local public configuration, then run:

```
ECONTENT_CHROMIUM_PATH=/usr/bin/chromium npm run test:account -- --grep 'real cloud media|server quotas'
```

Cloud tests use only the fixed local signing secret and loopback endpoints. They
create confirmed local fixture users without sending email, verify uploads,
restore in a fresh browser context, deny cross-user access/direct unsafe deletion,
check exact deletion/quota reuse, serialize competing reservations, reject
underdeclared uploads, test administrator-only Premium/extended expiry, and run
the same cleanup implementation against actual expired objects. Fixtures are
removed after the tests. The production database is never a test fixture target.
