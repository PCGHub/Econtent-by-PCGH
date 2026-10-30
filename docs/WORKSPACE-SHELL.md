# Responsive workspace shell integration

Integration branch: `integration/responsive-workspace-shell`.
Working editor base: `9ef21b2cb6cdc6f15b017ad95355a17c58b8c779`.
Inspected v0 UI: `8ff08dc34bda6532303772a0b533abbaf3e01177` on
`feature/overlay-studio-integration-588c`.

## Selective integration and conflict decisions

The v0 branch descends from the older mock studio. Its shell commit changes six
files; its Overlay Studio change only removes unused indexes in that mock timeline.
A whole-branch merge/replacement would overwrite newer editing and account behavior.
The actual editor, direct manipulation, render reuse and processing logic are retained.

The new `WorkspaceShell` adapts v0's white/blue responsive sidebar and header. Existing
workspace roots (account content, ProjectEditor and OverlayStudio) use it once each.
Their superseded navigation headers are removed; project saving remains in a toolbar.
There is one page main landmark and one global navigation header per workspace.
The existing Studio tools navigation remains a separate editor toolbar.

Server route files are unchanged, including `requireAccount`, owner-only project
loading, not-found handling and existing URLs. Wrapping existing roots also covers
`/projects/new`, saved cutter/composition projects and the landing page's existing
in-place guest cutter entry, without route moves or nested shell wrappers.

The Cutter link points to `/editor`, rather than v0's `/` landing page. Profile labels
come from the existing account provider, with an explicit guest/loading state; no
fake account identity is shown. Settings and saved projects use their real routes.
Cinematic Titles and Transcription are marked unavailable and have no broken links.
They remain future milestones, in that order.

## State, accessibility and processing

Opening/closing the drawer and collapsing/expanding the desktop sidebar update shell
state and CSS around the same child subtree. They do not key, clone, reparent or
conditionally replace the editor. Video elements, blob URLs, text positions, history,
workers and rendered output are preserved. A deliberate route navigation still follows
the existing project navigation guards and normal local-media reattachment rules.
This integration does not promise unsaved media survives leaving its editor route.

At widths below 1024 px the sidebar becomes a labeled modal dialog. It supports touch,
Escape, a close button and backdrop dismissal. Focus starts at Close, Tab/Shift+Tab
remain in the panel, and closing restores focus to the opener. Background content
is inert while open; the closed off-screen sidebar is inert and invisible. Body
scroll locks only while the drawer is open, then restores its original overflow.
Desktop icon-only links keep accessible names and active routes use `aria-current`.
A skip link targets workspace content; reduced motion disables sidebar transitions.

A shared CSS offset keeps sticky processing progress below the new header. The
FFmpeg engine, versioned assets/cache, input mounting, Fast Cut/conversion,
composition, timed text/audio, cancellation and export code are unchanged.
Supabase schema, Auth, credential values and development migrations are unchanged.
The dedicated Preview reuses the existing Econtent development public configuration.

## Verification

Browser coverage checks live media element identity, attached source URLs, undo/redo,
rendered MP4 identity/bytes and no additional workers when toggling the sidebar.
Actual MP4 output is fully decoded and checked for H.264/AAC. Touch emulation verifies
focus trapping, Escape/backdrop/button/navigation dismissal, scroll restoration,
no horizontal overflow and preserved input state. A separate case holds the WASM
request during drawer interaction, checks that the worker stays alive and then cancels.

Account regressions exercise real local email verification, sign-in/session/recovery,
protected navigation across Dashboard/Projects/Settings/Studio, saving/duplicate/
reopening, source reconnection and cross-user isolation. The shell case also reopens
a saved cutter project at the same `/projects/:id` URL via mobile navigation.
Existing media/browser regressions cover dragging, all composition ratios, actual
text/music exports, caching, Fast Cut, compression, ZIP and cancellation/recovery.

Real Android hardware is unavailable. Chromium touch and mobile viewport emulation
do not establish Android performance. Hosted email delivery and new-origin callback
allowlisting remain separate from local account tests; hosted Auth settings are not
modified by this shell integration.

Completed checks: lint, TypeScript, production build, 58 units, six native media
tests, the full 21-test browser run plus the added loading/drawer regression,
all five local account regressions and the 22-case pinned WASM import matrix.
After unique accessibility IDs and the sticky offset were finalized, all three
shell browser checks and the protected account navigation check passed again.
React-generated IDs avoid duplicate dialog/skip-link targets during route transitions.
