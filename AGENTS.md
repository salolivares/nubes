# Nubes

Electron desktop app for a photo publishing workflow. It converts a set of images to jpg and webp at
128, 640, 1280 and 2880px, tracks them as photosets in a local SQLite database, and uploads them as
albums to S3 with metadata.

macOS is the only supported platform. `forge.config.cts` only has the darwin zip maker. CI's Linux
e2e job (pinned to `ubuntu-24.04`) is there for test coverage, not because Linux is a target. That
is why #129 (sharp crashing on newer Linux) is low priority.

## Working in a worktree

- Run `make setup` (or `pnpm install --frozen-lockfile`) first. A new worktree has no
  `node_modules`.
- Run `make check` (or `pnpm check`) before opening a PR. It runs typecheck, lint, test and
  format:check, the same checks CI runs. `make format` fixes formatting.
- In a linked worktree, dev data (SQLite DB, photosets, saved credentials, logs, mock S3 bucket)
  lives in `.dev-data/`, so two worktrees can run `pnpm start` side by side. `make clean-dev-data`
  clears it. The main checkout keeps using `nubes-dev/` under the OS app data folder. Mock S3 is on
  by default in dev. `NUBES_USER_DATA` overrides the folder and `NUBES_MOCK_S3=1|0` forces the S3
  mode. Packaged builds ignore all three env vars.
- When you launch the app to drive or check the GUI yourself, set `NUBES_BACKGROUND=1` (for example
  `NUBES_BACKGROUND=1 pnpm start`). The window opens without taking focus, with no dock icon and no
  DevTools window, so it doesn't pull the user out of what they are doing. The e2e tests set it too.

## Ways to hurt yourself

Each of these breaks something real. Most fail silently.

- `NUBES_MOCK_S3=0`, or turning mock S3 off in the debug bar, sends uploads to the real bucket. The
  website reads that bucket, so an uploaded album can go live. Only do it when the user asks.
- `NUBES_USER_DATA` pointed at the packaged app's folder (`~/Library/Application Support/Nubes`)
  runs unreleased migrations on the user's real database. Leave it unset or use a scratch folder.
- `make package` copies the build over the installed app in `/Applications`. Never run it, or
  `pnpm package`, unless asked.
- Editing a migration that has already run does nothing to existing databases: Drizzle only applies
  migrations newer than the last one it recorded. Change `src/common/db/schema.ts` and generate a
  new migration instead.
- The DB runs in WAL mode, so recent writes can live in `nubes.db-wal`. A copy of `nubes.db` alone
  can miss them. To restore a backup, quit the app, delete `nubes.db-wal` and `nubes.db-shm`, then
  copy the backup over `nubes.db`. A stale `-wal` left next to a restored file corrupts it.
- Code that reads userData (`Storage`, `Database`, `app.getPath('userData')`) above the
  `resolveDevEnvironment()` block in `src/main/index.ts` reads the wrong folder. Keep that block
  first.
- Electron expects one `protocol.registerSchemesAsPrivileged()` call, before `ready`, listing every
  custom scheme. A second call can drop the first one's privileges. Add new schemes to the one call
  in `src/main/index.ts`.
- Registering IPC handlers or the image worker per window breaks when macOS reopens the window:
  `ipcMain.handle` throws on a second handler, and each call creates another worker supervisor. Register in
  `registerListeners()` (`src/main/listeners/index.ts`), which runs once after `app.whenReady()`.
- A `BrowserWindow` kept in a variable is dead after the window closes. Reply to `event.sender` or
  use `broadcast()` from `src/main/ipc.ts`.
- Using a path from the renderer on disk lets a compromised page read, upload or delete any file.
  Check it with `MediaAccess` (see `src/main/media/guards.ts`), never pass it to
  `allowPickedFiles()`, and build photoset folders from the id (`src/main/photoset-folders.ts`).
- IPC that returns file contents bypasses all of the above. Don't add any. Photos reach the page
  through `nubes-media://` only.
- Older photosets keep flat paths under `photosets/` and can share files. A delete that skips the
  "is another photoset using this file" check removes another photoset's images.
- Node built-ins or Node-only packages in `src/preload/` (or the `src/common/` modules it imports)
  fail the build, because the preload runs sandboxed. Only `require('electron')` is allowed.
- Loading the renderer from `file://`, adding a meta CSP to `index.html`, or comparing
  `URL.origin` for `nubes:` URLs (Node returns `"null"`) quietly opens holes. See the rules below.
- Moving the e2e job to `ubuntu-latest` hangs image processing. See "sharp on Linux".

## Hit every surface

A change isn't done until each of these is updated.

- **New or changed IPC channel:** channel name in `src/common/constants.ts`, Zod schema and types
  in `src/common/types.ts`, the listener in `src/main/listeners/` registered with `handle()` or
  `on()` (a new listener file also goes in `registerListeners()`), the preload file in
  `src/preload/` (and `preload.ts` if it is a new `window` API), and `types/api.d.ts`. Events main
  pushes need the `broadcast()` or `event.sender` call and the renderer subscriber. Dev-only
  channels go in `listeners/debug.ts` and `preload/debug.ts`, both gated to dev, and the debug bar
  (`src/renderer/components/debug-bar.tsx`). A channel that takes file paths also needs a guard in
  `src/main/media/guards.ts`.
- **S3 behavior:** the `IS3Provider` interface in `src/main/drivers/s3/s3-provider.ts` and both
  implementations, `s3.ts` (real) and `mock-s3.ts`. A change to one usually needs the same change
  in the other.
- **DB schema:** `src/common/db/schema.ts`, plus a migration from `pnpm exec drizzle-kit generate`
  in `src/common/db/migrations/`. Row types used outside main go in `src/common/types.ts`. Renamed
  tables also need the raw SQL in the debug reset (`DEBUG_CLEAR_DB` in `listeners/debug.ts`).
- **Renderer data:** the query key and options in `src/renderer/lib/photoset-queries.ts`, and
  invalidation of every key a write changes.
- **Image job messages:** the three schemas in `src/common/types.ts` (`imageWorkerRequestSchema`,
  `imageWorkerEventSchema`, `imageJobEventSchema`), the worker (`drivers/image-worker/runner.ts`),
  the supervisor, and `applyImageJobEvent()` in `src/common/image-jobs.ts`, which main and the
  renderer both use.

## Testing

- A bug fix starts with a test that fails without the fix.
- Test at the lowest layer that shows the bug: a pure function before a listener, a listener before
  e2e.
- No sleeps or retries. Wait for the event or state you need. A timeout is only a deadline that
  fails the test or kills a hung process.
- Main-process and `src/common/` tests run under Electron's Node (`pnpm test:main`), because
  `better-sqlite3` is built for Electron's ABI. Running `vitest` directly on them fails with a
  `NODE_MODULE_VERSION` error. Mock `sharp` in them, since it can crash under Electron on Linux.
  Renderer tests run in jsdom (`pnpm test:renderer`). `pnpm test` runs both.
- `pnpm test:e2e` runs `pnpm build` (Vite bundles into `.vite/`, no packaging), then the Playwright
  Electron tests in `tests/e2e/`. Each test launches the unpackaged app with a temp
  `NUBES_USER_DATA` and mock S3. CI runs them on `ubuntu-24.04` under `xvfb-run`.
- `tests/e2e/fixtures/nubes-0000.db` is a database left at migration `0000`. The launch test boots
  the app on a copy of it, so a migration that breaks old data fails CI. Regenerate it with
  `node scripts/create-e2e-fixture-db.ts` only to change its rows.

## Rules

- Use pnpm only, never npm or yarn.
- Validate IPC arguments with Zod. Register main-process handlers with `handle()` (invoke) or
  `on()` (one-way send) from `src/main/ipc.ts`, which parse the schema and log errors. Lint bans
  `ipcMain` everywhere else, including the default `electron` import, `require()` and `import()`.
- Shared shapes (Zod schemas, inferred types, row types) live in `src/common/types.ts`. Main-process
  listeners and `types/api.d.ts` both import from there. Don't redefine them elsewhere.
- Migrations run at startup. When some are pending on a non-empty DB, startup first snapshots it to
  `nubes.db.bak-<timestamp>` next to it and keeps the newest 3
  (`src/main/drivers/database-maintenance.ts`).
- Startup failures, uncaught exceptions and unhandled rejections go through one handler
  (`src/main/crash-handling.ts`). Before the first window loads, any error shows a dialog and quits.
  After that, only a corrupt database or a `UserFacingError` quits; everything else is logged.
  `UserFacingError` is for fatal errors whose message tells the user what to do. IPC handler errors
  are logged by `handle()` and go back to the caller. A crashed renderer reloads up to 3 times a
  minute, then the user gets a dialog and the app quits (`src/main/mainWindow.ts`).
- `src/renderer/components/ui/` is generated by the shadcn CLI. Use the `shadcn` skill to change it.
- The renderer loads local photos only through `nubes-media://` URLs built with `mediaUrl()` from
  `src/common/media-url.ts`. Main (`src/main/media/`) serves files under the photosets folder plus
  source files passed to `allowPickedFiles()`. It has two callers: the open dialog in main, and
  `IMAGE_PICKER_ALLOW_DROPPED` for drops. Drop paths come only from preload's `addDroppedFiles()`,
  which accepts only real `File` objects and resolves them with `webUtils.getPathForFile`. A
  compromised renderer can still call that channel, so `allowPickedFiles()` validates every path.
- IPC handlers that touch renderer paths (`s3:createAlbum`, `image-processor:resize`,
  `photoset:addImages`, `photoset:delete`, `photoset:removeFiles`, `photoset:showInFolder`) check
  them against the same `MediaAccess` roots. Each checks what it needs (see `guards.ts` and
  `listeners/photoset.ts`), so copy the closest one when adding a handler.
- Each photoset's processed images go in `photosets/<photosetId>/`, built by main from the id in
  `image-processor:resize`.
- Packaged and built runs (including e2e) load the renderer from `nubes://app/index.html`.
  `src/main/app-protocol/` serves only regular files inside the renderer bundle, after resolving
  symlinks, and answers 404 to anything else. Dev loads from the Vite dev server.
- The CSP is `contentSecurityPolicy()` in `src/common/csp.ts`, sent as a response header: by the
  `nubes://app` handler, and in dev by Vite's `server.headers` in `vite.renderer.config.ts`.
  Dev-only relaxations stay behind its `dev` flag.
- `isAppUrl()` in `src/main/ipc.ts` decides which page may call IPC, navigate, or get permissions:
  the dev server origin in dev, `nubes://app` otherwise. Never `file:`.
- The main window runs with `sandbox: true`. The preload builds to one CommonJS file,
  `.vite/build/preload.cjs`, and today uses `contextBridge`, `ipcRenderer` and `webUtils`.
  `pluginSandboxedPreload()` in `vite.preload.config.ts` fails the build unless the output is that
  single CommonJS file and requires nothing but `electron`.
- External links only open for origins in `ALLOWED_EXTERNAL_ORIGINS` in
  `src/main/securityRestrictions.ts`. Others are silently blocked.

## Source layout

`main/`, `preload/` and `renderer/` each build with their own Vite config. `common/` is shared by
all three. Run `ls` for the files; the landmarks are:

- `src/main/index.ts`: app lifecycle, dev userData setup, single-instance lock.
  `src/main/dev-environment.ts` picks the dev userData folder and S3 mode.
- `src/main/listeners/`: IPC handlers. `src/main/drivers/`: the `Database` and `Storage`
  singletons (`Storage` encrypts saved credentials with `safeStorage`), S3 providers, and the image
  worker. `drivers/image-processor.ts` is the second entry in `vite.main.config.ts`: the worker
  process, which runs jobs one at a time through `image-worker/runner.ts`.
- `src/main/media/` and `src/main/app-protocol/`: the `nubes-media://` and `nubes://app` handlers.
- `src/main/window/`: saved window bounds, the right-click menu, and the theme background color.
- `src/preload/`: one file per `window` API, joined in `preload.ts`.
- `src/renderer/`: React UI. Routes in `routes.tsx`, pages in `pages/`, shadcn in `components/ui/`.
- `src/common/`: IPC channel names, `DB_FILENAME` and `PHOTOSETS_DIR` (`constants.ts`), Zod schemas (`types.ts`), Drizzle schema and
  migrations (`db/`).

`types/api.d.ts` declares the `window.*` preload APIs. `types/forge.env.d.ts` declares the Forge
constants (`MAIN_WINDOW_VITE_DEV_SERVER_URL`, `MAIN_WINDOW_VITE_NAME`).

Path aliases: `@/*` is `src/*`, `@client/*` is `src/renderer/*`, `@common` is `src/common`, `@ui/*`
is `src/renderer/components/ui/*`. They are defined in `tsconfig.json` and
repeated in the `resolve.alias` of each Vite and Vitest config. The main and Vitest-main configs only
have `@` and `@common`.

## How the pieces talk

- **Typed IPC.** Preload files wrap `ipcRenderer.invoke()` (plus `on` for image job and storage
  change events) and expose an API on `window`
  (`s3`, `photosets`, `storage`, `themeMode`, `imagePicker`, `imageProcessor`, `cache`, and `debug`
  in dev only). The renderer calls S3 through React Query.
- **Image processing.** `window.imageProcessor.resize()` returns a job with a `jobId`.
  `ImageWorkerSupervisor` (`drivers/image-worker/supervisor.ts`) queues jobs, forks
  `image-processor.js` as a `utilityProcess` on the first request, and sends it one job at a time.
  If the worker exits, the job in flight fails and the next request forks a fresh worker. Every
  message across the process boundary is a Zod `discriminatedUnion` in `src/common/types.ts`, and
  main parses worker messages before broadcasting them as `ImageJobEvent`s. Main and the renderer
  fold those events into an `ImageJob` with the same `applyImageJobEvent()`
  (`src/common/image-jobs.ts`). The renderer subscribes once, in `stores/image-jobs.ts`, and calls
  `getJob(jobId)` to catch up after a remount.
- **Debug.** In dev only, `window.debug` and the renderer's debug bar toggle mock S3 and inspect or
  reset dev data.

## User flow

Routes are in `src/renderer/routes.tsx`. Steps 3 to 6 live under
`/photoset/:photosetId/{picker,upload,s3,summary}`. Each step wraps itself in `WizardStep`
(`src/renderer/components/wizard-step.tsx`), which loads the photoset from the DB and redirects to
`/new` when the id is invalid or unknown, so a window reload keeps the user's place. Only picked
`File`s and in-flight processing state live in the Zustand store. Query keys and query options for
photosets, cache usage, cameras and S3 are in `src/renderer/lib/photoset-queries.ts`. Pages load data
with `useQuery`, and writes invalidate the keys they change.

1. **Home** lists photosets from the DB.
2. **NewUpload** lists S3 buckets, then creates a photoset for the chosen one.
3. **ImagePicker** takes files by drag and drop or the native file dialog.
4. **ImageProcessing** runs the worker and saves the outputs to the photoset.
5. **S3Upload** edits metadata, then uploads the album or saves it as a draft.
6. **S3Summary** shows the result. Drafts reopen from **PhotosetDetail**.

## sharp on Linux

Image processing is broken under Electron on Ubuntu 26.04 (GLib 2.88). It works on Ubuntu 24.04
(GLib 2.80), macOS and Windows. GLib versions in between are untested. Issue #129 has the logs.

- Electron links the system GLib. sharp's prebuilt libvips bundles its own GLib and exports its `g_`
  symbols without binding them to itself, so once both are loaded, some of sharp's GLib calls go to
  the system copy and the rest stay on the bundled one. The clash is there on 24.04 too. It only
  happens not to break.
- Under `ELECTRON_RUN_AS_NODE=1` on 26.04, sharp segfaults in `g_object_unref` on the first image.
  In the app's image worker, the first sharp call never returns instead: the job sits at 0%, the
  worker never exits, and `app.close()` hangs.
- The thumbnail handler in `src/main/media/index.ts` also uses sharp, in the main process. The drop
  test's thumbnail loaded fine there on 26.04, for reasons not yet known. A fix has to cover both
  callers.
- Plain `node` is fine, because it doesn't load the system GLib.
- sharp 0.35.5's libvips still exports its bundled `g_` symbols, so upgrading doesn't remove the
  clash. It wasn't run on 26.04.
- Loading sharp's binding with `RTLD_DEEPBIND` doesn't work. Electron replaces `malloc` and `free`,
  and the flag makes sharp skip them, so the app crashes on startup.
- Fixes still open: sharp's WebAssembly build (`@img/sharp-wasm32`) on Linux, or a sharp built
  against the system libvips.

## Packaging native modules

- **better-sqlite3** is bundled by `vite-plugin-native` in `vite.main.config.ts`.
- **sharp** loads platform packages with a dynamic `require()` that can't be traced, so it is
  externalized in `vite.base.config.ts` and copied by the `packageAfterCopy` hook in
  `forge.config.cts`, along with `@img`, `detect-libc` and `semver`.

Both rely on `asar.unpack: '**/*.{node,dll,dylib,so}'`.

## UI stack

React 19 and Tailwind CSS 4. Versions to watch for, since APIs differ from the latest:

- shadcn/ui is built on `@base-ui/react`, not Radix. Use the `render` prop, not `asChild`.
- React Query is v5: `isPending` on mutations, `gcTime` not `cacheTime`, object-only hook signatures.
  On queries, `isPending` is also true while `enabled: false`, so gate spinners on `isLoading`.
  Wrap preload calls in arrow functions for `queryFn`/`mutationFn`, so Query's context object
  never crosses `contextBridge`. Zod is v4.
- React Router 6 with a hash router, so routes live in the fragment and `nubes://app` only ever
  serves `index.html` and its assets.
- Dark mode is the custom `src/renderer/components/theme-provider.tsx`, synced with Electron's
  `nativeTheme` through `window.themeMode`. There is no `next-themes`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses the single-context layout. See `docs/agents/domain.md`.
