# Econtent by PCGH — full target architecture tree

**Status:** This is the target repository layout. Only files actually committed to GitHub exist; entries marked `[future]` are specifications, not implemented functionality. Codex may adapt paths to avoid unnecessary scaffolding.

```text
Econtent-by-PCGH/
├── AGENTS.md                         # Codex engineering instructions
├── README.md                         # Product requirements and milestone gates
├── docs/
│   ├── ARCHITECTURE.md               # Architecture decisions and constraints
│   ├── PROJECT_TREE.md               # This target tree and ownership map
│   ├── IMPLEMENTATION_PLAN.md        # Phased executable backlog
│   ├── TEST_PLAN.md                  # Test cases and evidence
│   └── DEPLOYMENT.md                 # [future] Preview deployment runbook
├── app/
│   ├── layout.tsx                    # Root shell / metadata
│   ├── page.tsx                      # Existing v0 landing + editor shell
│   ├── globals.css                   # Brand tokens and responsive styles
│   └── editor/
│       └── page.tsx                  # [future] Dedicated editor route
├── components/
│   ├── ui/                           # Existing shadcn primitives
│   ├── layout/                       # [future] Header, nav, footer
│   └── editor/
│       ├── video-upload.tsx          # [future] Drag/drop, validation
│       ├── video-player.tsx          # [future] Original/output playback
│       ├── editor-toolbar.tsx        # [future] Modes and state
│       ├── video-timeline.tsx        # [future] Playhead and range handles
│       ├── cut-settings.tsx          # [future] Split/trim settings
│       ├── compression-settings.tsx  # [future] Codec/preset controls
│       ├── processing-status.tsx     # [future] Progress/cancel/errors
│       ├── clip-gallery.tsx          # [future] Clip preview/select
│       └── export-panel.tsx          # [future] MP4 and ZIP downloads
├── hooks/
│   ├── use-video-source.ts           # [future] Metadata/object URLs
│   ├── use-editor-state.ts           # [future] Editing state
│   └── use-processing-job.ts         # [future] Worker lifecycle
├── lib/
│   ├── utils.ts                      # Existing styling helpers
│   ├── video/
│   │   ├── types.ts                  # Media domain contracts
│   │   ├── validation.ts             # Range and duration validation
│   │   ├── planner.ts                # Pure deterministic cut planner
│   │   ├── engine.ts                 # Processing adapter interface
│   │   ├── presets.ts                # Compression definitions
│   │   ├── download.ts               # Browser download helper
│   │   ├── ffmpeg-browser.ts         # [future] Real FFmpeg WASM engine
│   │   ├── zip.ts                    # [future] ZIP assembly
│   │   └── media-metadata.ts         # [future] Codec/container probing
│   └── errors/
│       └── media-errors.ts           # [future] Typed recoverable errors
├── workers/
│   └── video.worker.ts               # [future] Off-main-thread transcoding
├── public/
│   ├── icon.svg                      # Existing app icon (if present)
│   └── ffmpeg/                       # [future] Versioned WASM assets
├── tests/
│   ├── planner.test.ts               # [future] Boundary unit tests
│   ├── validation.test.ts            # [future] Input validation tests
│   ├── fixtures/                     # [future] Generated non-sensitive MP4s
│   └── e2e/
│       └── editor.spec.ts            # [future] Browser workflow test
├── .github/
│   └── workflows/
│       └── ci.yml                    # [future] Build/lint/test
├── package.json
├── pnpm-lock.yaml                    # Existing lockfile if present
├── tsconfig.json
├── next.config.*                     # Existing Next.js config
└── .gitignore
```

## Boundaries

1. `components/` and `hooks/` render the UI and manage user interaction. They must not contain FFmpeg command construction.
2. `lib/video/planner.ts` computes intervals only; it must not read files or call browser APIs.
3. `lib/video/engine.ts` describes the processing contract; a browser adapter implements it.
4. `workers/` performs costly processing off the main thread when supported.
5. `lib/video/download.ts` owns temporary download URL cleanup.
6. `tests/` prove actual outputs, not just visual rendering.
7. `app/` orchestrates modules. No video-processing server routes are required for MVP.

## Build priority

Implement a **vertical slice** first: actual upload → trim → optional compress → preview → MP4 export. Then add splitting, ZIP, resilience, and browser compatibility. Never generate placeholder modules just to make the tree look complete.
