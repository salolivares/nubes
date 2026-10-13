# Nubes Architecture

Electron desktop app for photo publishing workflows. Converts a set
of images to multiple formats/sizes (jpg + webp at 128, 640, 1280,
2880px) and uploads them as albums to S3 with metadata.

## Process Model & Source Layout

Electron apps run multiple OS processes with different capabilities.
Each `src/` directory maps to one, and each gets its own Vite build
config because they have fundamentally different targets (Node.js vs
browser, different module formats, different externals).

```
src/
├── main/          # Electron main process (Node.js)
│   ├── index.ts          # App lifecycle, single-instance lock
│   ├── mainWindow.ts     # BrowserWindow creation, dev/prod loading
│   ├── securityRestrictions.ts  # Navigation/permission allowlists
│   ├── drivers/
│   │   ├── storage.ts        # Singleton: electron-store + safeStorage encryption
│   │   ├── s3.ts             # Singleton: AWS S3 client, album CRUD
│   │   └── image-processor.ts # Worker: sharp-based batch image conversion
│   └── listeners/
│       ├── index.ts          # Registers all IPC listeners on window
│       ├── s3.ts             # S3 IPC handlers with Zod validation
│       ├── storage.ts        # Raw IPC for secure/plain storage
│       ├── theme.ts          # Raw IPC for native theme control
│       └── image-processor.ts # Spawns utilityProcess worker, MessageChannel bridge
│
├── preload/       # Preload scripts (contextBridge)
│   ├── preload.ts          # Exposes APIs to renderer via contextBridge
│   ├── storage.ts          # window.storage API
│   ├── theme.ts            # window.themeMode API
│   ├── s3.ts               # window.s3 API
│   └── image-processor.ts  # window.imageProcessor API
│
├── renderer/      # React frontend (browser context)
│   ├── main.tsx / App.tsx  # Entry, provider setup (React Query, theme)
│   ├── routes.tsx          # Hash router: wizard flow through bucket/images/upload
│   ├── stores/images.ts    # Zustand store for image upload state
│   ├── hooks/              # useProcessingImages, useProcessedImages
│   ├── pages/              # Home, ImagePicker, ImageProcessing, S3Upload, S3Summary
│   └── components/         # BaseLayout, AlbumForm, shadcn/ui primitives
│
└── common/        # Shared between main + renderer
    ├── constants.ts        # IPC channel names
    └── types.ts            # Zod schemas + TS types (ProcessedImage, Album, etc.)
```

## Vite Configs

| Config                    | Target                | Why separate?                              |
| ------------------------- | --------------------- | ------------------------------------------ |
| `vite.base.config.ts`     | Shared utilities      | Externals list, build helpers, HMR plugins |
| `vite.main.config.ts`     | Main process + worker | Node.js target, builds image-processor too |
| `vite.preload.config.ts`  | Preload scripts       | Must be single chunk, no code splitting    |
| `vite.renderer.config.ts` | React UI              | Browser target, React plugin, dev server   |

Electron Forge's `VitePlugin` orchestrates all of these via
`forge.config.cts`. It injects dev server URLs as compile-time
constants (`MAIN_WINDOW_VITE_DEV_SERVER_URL`, `MAIN_WINDOW_VITE_NAME`).

### Native Module Packaging

Two strategies coexist because sharp's dynamic `require()` loop over
platform-specific `@img/sharp-*` packages can't be statically traced:

- **better-sqlite3** — handled by `vite-plugin-native` in
  `vite.main.config.ts`. The plugin bundles the `.node` file into
  `.vite/build/node_natives/` automatically.
- **sharp** — externalized in `vite.base.config.ts` and copied via a
  `packageAfterCopy` hook in `forge.config.cts` (along with `@img`,
  `detect-libc`, `semver`).

Both paths rely on `asar.unpack: '**/*.{node,dll,dylib,so}'` so
`dlopen` can read the binaries outside the asar archive.

## Communication Patterns

### 1. Typed IPC (contextBridge)

Used for S3, storage, theme, photosets, and image processing. Preload
scripts wrap `ipcRenderer.invoke()` calls and expose typed APIs on
`window.*`.

```
Renderer                     Preload                    Main
window.s3.listBuckets()
  → ipcRenderer.invoke()    →                         → ipcMain.handle()
                                                        → S3.instance
```

Main-process handlers use `src/main/ipc.ts` for error logging and Zod
validation. The renderer consumes S3 promises through React Query.

### 2. Image Processor (utilityProcess + MessageChannel)

Heavy image work runs in a `utilityProcess` (separate Node.js process,
not a renderer). Communication uses `MessageChannelMain` ports:

```
Renderer                    Main                        Worker (utilityProcess)
window.imageProcessor
  .resize(paths)
  → ipcRenderer.invoke()   → postMessage(port2)       → sharp resize loop
                            ← port1.on('message')      ← port.postMessage(progress)
  ← webContents.send()
```

## User Flow (Wizard)

1. **Home** (`/`) — Lists S3 buckets via `window.s3`, user picks one
2. **ImagePicker** (`/bucket/:name/picker`) — Drag-and-drop via
   react-dropzone, files stored in Zustand
3. **ImageProcessing** (`/bucket/:name/upload`) — Sends paths to
   utilityProcess worker, shows per-image progress bars
4. **S3Upload** (`/bucket/:name/s3`) — Review processed images, edit
   name/camera metadata, fill album form, submit via a React Query mutation
5. **S3Summary** (`/bucket/:name/summary`) — Post-upload (stub)

## Key Singletons (Main Process)

- **Storage** — `electron-store` with `safeStorage` encryption for
  AWS credentials. Falls back to base64 if encryption unavailable.
- **S3** — Auto-reconfigures when credentials change via store
  `onDidChange` listeners. Uploads images in batches of 5.

## UI Stack

- React 18 + React Router 6 (hash router for Electron file:// compat)
- Tailwind CSS 3 + shadcn/ui (Radix primitives)
- react-hook-form + zod for validation
- Zustand for client state (image upload pipeline)
- React Query v4 for asynchronous S3 state
- sonner for toasts, next-themes for dark mode
- lucide-react for icons

## Type Declarations

- `types/forge.env.d.ts` — Forge/Vite magic constants, ViteDevServer
  augmentation
- `types/api.d.ts` — Global ambient interfaces for preload APIs
  (`StorageContext`, `ImageProcessorContext`, `PhotosetContext`, etc.)
  and the `Window` augmentation. Uses `import type` from
  `src/common/types` + `declare global` to keep interfaces ambient.
- `src/common/types.ts` — Single source of truth for shared Zod
  schemas and inferred TS types. Row types (`Photoset`,
  `PhotosetImage`, `PhotosetImageOutput`), IPC arg schemas
  (`photosetCreateArgsSchema`, `imageProcessorResizeArgsSchema`, etc.),
  and image processing types all live here. Main-process listeners and
  `api.d.ts` both consume these — never duplicate shapes elsewhere.

## Path Aliases

```
@/*        → ./src/*
@client/*  → ./src/renderer/*
@common    → ./src/common
@ui/*      → ./src/renderer/components/ui/*
```

Defined in `tsconfig.json` and duplicated in each Vite config's
`resolve.alias`.

## Development Rules

- **Package manager: pnpm** — never use npm or yarn. Use `pnpm install`,
  `pnpm add`, `pnpm run`, etc.
- **Don't package unless asked** — only run `pnpm run package` or
  similar build/packaging commands when explicitly requested.
- When modifying `src/main/drivers/s3/s3.ts` (real S3 driver), always
  check whether `src/main/drivers/s3/mock-s3.ts` needs a matching
  update. They both implement `IS3Provider` and should stay in sync.
- When needing to validate arguments across IPC boundries, use Zod
  for validation
- **Dev/prod data isolation** — `src/main/index.ts` overrides
  `userData` to `nubes-dev/` in dev mode. This `app.setPath()` call
  must stay as the first executable code after imports — nothing that
  reads `app.getPath('userData')` (Storage, Database, etc.) can run
  before it.
