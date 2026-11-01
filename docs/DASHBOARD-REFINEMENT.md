# Dashboard refinement

The dashboard is isolated to `components/account/creator-dashboard.tsx` and its `dashboard/` components. Its typography and palette are scoped through a CSS module and a self-hosted Inter font (OFL license in `public/fonts/`). Studio interfaces, processing engines, authentication configuration, project routes and database policies are unchanged.

## Data and actions

- Counts come from the existing authenticated `/api/projects?sort=recent` response. They describe saved project statuses, not export counts or cloud processing. At the API's 200-row limit, the dashboard discloses that scope. Loading and failures show an em dash instead of a fabricated zero.
- Search, status filtering, sorting and grid/list controls operate on that response. The full Projects page retains its existing retrieval, search and management behavior.
- Completed projects reopen through `/projects/:id`. Failed projects use the same owner-protected route with a **Review & retry** action and guidance to inspect saved settings and reconnect local media. Opening a card never starts processing automatically.
- Self-contained Titles drafts can show an actual saved scene frame using the existing canvas renderer. Uploaded image/video backgrounds and original videos remain local; absent media gets an explicit unavailable preview, without invented thumbnails or uploads.
- Workspace updates reflect failed saved projects. The account menu uses existing Supabase sign-out. Credits, subscriptions and future AI capabilities are explicitly unavailable and have no simulated balances or usage.

## Navigation and accessibility

The dashboard has grouped Workspace, Creative Tools and Account links. All five existing studio routes remain linked. Sidebar collapse preference alone is stored in localStorage. The mobile drawer keeps its content mounted, uses `display:none` while closed to prevent hidden keyboard targets, locks background scrolling, makes the background inert, traps Tab, supports Escape and restores focus. Dashboard search and filters survive drawer toggles. Studio layouts keep their existing WorkspaceShell.

## Verification

- `npm run typecheck`
- `npx eslint components/account/creator-dashboard.tsx components/account/dashboard lib/projects/dashboard.ts tests/dashboard.test.ts tests/account/e2e/dashboard.spec.ts`
- `npm run build`
- `npm test`
- `npm run test:media`
- `ECONTENT_CHROMIUM_PATH=/usr/bin/chromium npm run test:account -- dashboard.spec.ts`
- Existing account and editor regressions, including login, email confirmation/recovery, refresh sessions, saved draft reopening, ownership isolation, real MP4 processing and mobile navigation.

The dashboard browser suite uses verified disposable local accounts and the real project API. It seeds completed and failed fixtures, tests reopen/reconnect, empty/error/retry states, search/filter/sort, keyboard focus, touch drawer controls, and overflow at 375–1920px. Screenshots are generated in ignored `test-results/dashboard-{desktop,mobile}.png` and were visually reviewed.

Repository-wide lint has pre-existing errors in `components/transcription-studio.tsx` and `components/video-editor/multitrack-editor.tsx`; these studio files are outside this task. Real Android hardware is unavailable. Local authenticated tests do not establish a successful login to the owner's hosted account. Hosted testing must retain Vercel protection and normal TLS validation.
