# Authentication and saved projects

Integration branch: `integration/auth-saved-projects`. The base is processing commit
`9416eb00eeef8f836bf86502436d5f3ee2d679b3`. Account layouts were taken selectively
from `feature/account-workspace-ui` at `1ddc89c3757dfa9a6901763ae599081917a05ca9`.
A wholesale merge would have removed the newer FFmpeg implementation. The processing
engine, workers, exports, progress and existing media tests are retained.

## Authorized development database

- Project: **econtent-dev**, reference **wumkmbyohzxtxoovoaeb**.
- Organization: `yqdnnnhxkpjiskkwkfvt`; region: `eu-west-1`.
- Creation was quoted at $0/month on the existing free plan and explicitly authorized.
- This database is exclusively for `PCGHub/Econtent-by-PCGH`. No other databases were reused.
- Applied migrations: `20261028162412_econtent_projects` and
  `20261028165616_cache_auth_policy_claims`.

No Storage buckets, video upload endpoints, paid services or production configuration
are introduced. A Supabase project's default database branch is sometimes called
“production” by its dashboard; this entire project is the separately authorized
Econtent development environment.

## Environment and Auth configuration

Copy `.env.example` to `.env.local` and provide the development project's URL and
**publishable** key. Never use a service-role/secret key in `NEXT_PUBLIC_*` variables.
The client configuration rejects secret keys and legacy JWTs with non-anon roles.
Guest editing works without either variable. Account operations show configuration
errors when unavailable.

For Vercel use **Preview only**, scoped to `integration/auth-saved-projects` in the
existing `econtent-by-pcgh` project/team. Do not set production variables.

Supabase Dashboard → Authentication → URL Configuration must have the intended Preview
origin as Site URL and its exact `/auth/callback` URL in Redirect URLs. PKCE verification
and recovery return through that route. A narrowly scoped development branch alias is
preferable to a broad `*.vercel.app` wildcard. The callback only redirects to known
same-origin application paths and never forwards arbitrary destinations.

Keep email confirmation enabled; configure an authorized development email sender.
Supabase's built-in sender has recipient restrictions and rate limits. App code does
not provision SMTP, change billing, enable Google, or disable confirmation to evade
those restrictions. The connected database tools do not expose Auth URL/SMTP settings;
those settings require the owner's Dashboard access or an authorized management integration.

## Security and persistence

`@supabase/ssr` uses PKCE and cookie sessions. Next's proxy refreshes sessions, forwards
updated cookies, and disables caching of account responses. Protected pages and API
routes independently call `auth.getUser()` and require verified, non-anonymous users.
Client user metadata is used only for display names, never authorization.

Projects store owner, title, editing mode/range, split duration/remainder, compression,
Fast/Precision strategy, source metadata/fingerprint, last processing status and
server-generated timestamps/revisions. Status describes the last local processing job;
it does not mean cloud video or exports are available.

RLS is enabled and forced. Each operation has an owner-only authenticated policy;
updates have both USING and WITH CHECK. Ownership/identity/timestamps are not writable
through Data API column grants. Server queries also constrain owner ID, validate all
inputs and use revision checks. Cross-site unsafe API requests are rejected; request
bodies are bounded JSON and cannot contain videos or arbitrary settings fields.
API errors avoid disclosing another user's project existence.

Autosave waits 1.2 seconds after edits, serializes requests, coalesces newer drafts and
uses the database's returned revision. Stale saves return 409 and stay visibly unsaved.
Manual save retries failures. Leaving an unsaved project warns; media downloads remain
available. Lists support search, sort, grid/list, rename, duplicate and confirmed delete,
showing at most 200 matching projects. Profile display names can be updated; account
self-deletion and Google sign-in remain unavailable and clearly labeled.

## Local video reconnection

No video or export is sent to Supabase or the application server. A bounded-memory
worker computes SHA-256 from 1 MiB file slices. A saved project requires the original
file's size and full digest to match before its editor is mounted with saved cuts.
Changing the filename is allowed if bytes match. Reloading or moving devices requires
reselection; the UI does not imply that original media is synced. Exports also need to
be rendered again after reopening. The existing 256 MiB input safety limit applies.

## Reproducible verification

Standard checks:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:media
npm run build
npm run test:browser
```

For real Auth and database tests, use Docker with the local socket. The harness creates
only the `econtent-auth-tests` Compose stack, binds ports to loopback, and uses a small
PostgreSQL 17 image plus real Supabase GoTrue, PostgREST and Mailpit. Test credentials
are fixed, local-only fixtures, never cloud credentials. It uses no cloud service-role
key and sends mail only to Mailpit. Do not deploy this harness.

```sh
npm run test:account:setup  # fresh disposable stack; creates ignored .env.local
npm run build             # compile the local test URL/publishable anon key
npm run test:account
npm run test:account:stop  # deletes only this local test stack and volumes
```

Stop the stack before rerunning setup: migrations deliberately fail if already applied.
The harness uses the same committed migrations as the hosted database. The SQL ownership
test uses explicit BEGIN/ROLLBACK and leaves no fixtures. Browser tests use real
registration, email verification, sessions, recovery, CRUD, autosave, conflict checks,
wrong-file and same-size/wrong-digest rejection, restored cutting, real MP4 probing,
and two accounts accessing both API and PostgREST directly. A separate test observes an
actual refresh-token response and reloads a protected page. Local test JWT lifetime is
60 seconds; it does not change cloud Auth policy.

The CI accounts job runs these tests against its own disposable containers. It receives
no cloud secrets. Do not upload browser auth state, email verification links or session
cookies as CI artifacts.

Cloud SQL fixture testing was declined by the connector; schema advisors and read-only
schema inspection remain available. Local isolation testing is independent of that
cloud operation. End-to-end cloud email delivery and redirect configuration must be
verified separately from local test results.

## Verified on 2026-10-28

- Lint and TypeScript checks passed.
- 21 unit tests passed, including serial/coalesced autosave and failed-save retry.
- 2 native FFmpeg media tests passed.
- Production builds passed both with local Auth configuration and with accounts unconfigured.
- 2 guest Chromium editor tests passed: Precision/Balanced playback and MP4/ZIP outputs;
  Fast Cut, multiple clips, progress, source reuse and cancellation controls.
- 2 real local Auth/workspace Chromium tests passed: verified signup, login/logout,
  recovery/new-password login, refresh, CRUD/search/sort/delete confirmation, autosave,
  stale-revision rejection, CSRF rejection, wrong-size and wrong-digest reconnection,
  restored cuts/compression and a probed three-second H.264/AAC MP4.
- Two verified users were tested through both the project API and direct PostgREST:
  cross-user reads/updates/deletes were denied; ownership changes/spoofed inserts were denied.
- Local transactional SQL ownership/guest isolation passed with ROLLBACK.
- Hosted migrations are applied. Security advisor: no warnings. Performance advisor:
  no warnings; two informational unused-index notices on the new empty database
  ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).

Hosted email delivery, Auth redirect allowlisting and cloud authenticated CRUD are not
claimed verified by these local results. Preview deployment verification is reported
separately with its exact commit/deployment URL.
