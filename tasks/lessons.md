# Lessons Learned

## Active Lessons

### 1. [content] Content before code
- **Pattern**: Started building app screens and UI before verifying the question bank and code reference data existed and was accurate.
- **Rule**: For content-driven apps, the data layer IS the product. Prove seed data is real and verified before writing any UI. No question enters production without a source reference.
- **Date**: 2026-02-28

### 2. [content] Don't mix unverified sources into production
- **Pattern**: Mixed Alabama, IPC, Quizlet, Reddit, and generic plumbing practice content with Kentucky-specific material. This poisons the database.
- **Rule**: Non-Kentucky sources are draft inspiration ONLY. They cannot be labeled as verified Kentucky study material unless explicitly matched to a Kentucky code section.
- **Date**: 2026-02-28

### 3. [infra] Don't push commits before the core asset exists
- **Pattern**: Committed and pushed project scaffolding before the most important asset (validated question bank) was proven to work.
- **Rule**: The first meaningful commit should include the core data schema + minimum viable seed data, not empty scaffolding.
- **Date**: 2026-02-28

### 4. [expo] Metro web needs `wasm` in `resolver.assetExts` for expo-sqlite
- **Pattern**: `npx expo export --platform web` failed with "Unable to resolve module ./wa-sqlite/wa-sqlite.wasm from node_modules/expo-sqlite/web/worker.ts" — native (iOS/Android) exports built fine, so it hid until the web target was tested.
- **Rule**: Any expo package that imports a WASM binary as an asset URL (expo-sqlite's web worker) needs a small `metro.config.js` that pushes `'wasm'` onto the default `config.resolver.assetExts`. Add it the day you add the package; verify with web export, not just native.
- **Date**: 2026-08-18

### 5. [ui] Study modes must filter `verified = 1` at the query, not the UI
- **Pattern**: The seed contract says only verified KY content ships, but the guarantee only means something if every deck-builder query enforces it. A UI-side filter is one refactor away from leaking drafts.
- **Rule**: Put `WHERE verified = 1` in each deck query (`getDrillQuestions`, `getTopicQuestions`, `getDeckWithDue`, `getMockExamQuestions`…); the UI can then be content-agnostic.
- **Date**: 2026-08-18

### 6. [infra] Don't run two `expo export`s against the same `dist/` at once
- **Pattern**: Exporting web and ios/android as two parallel background jobs raced on `dist/`; one died with `EPERM: operation not permitted, rmdir 'dist/_expo/static/js'` even though the bundle compiles fine.
- **Rule**: Export all platforms in ONE command (`npx expo export --platform web --platform ios --platform android`) or serialize them; treat a mid-write `EPERM rmdir` as a race, not a code error.
- **Date**: 2026-08-18

### 7. [db] SQLite UNIQUE treats NULLs as distinct — use `''` sentinels for optional refs
- **Pattern**: A `bookmarks` row stores either a question OR a code-section ref. With `UNIQUE(kind, question_id, code_section_id)` and nullable columns, SQLite's "NULL is distinct" rule let duplicate rows slip through.
- **Rule**: For nullable multi-value unique keys, make the columns `NOT NULL` with an empty-string sentinel for the unused column (and drop the FKs, since `''` would violate them), then enforce the "one ref must be set" rule app-side.
- **Date**: 2026-08-18

### 8. [testing] Reproduce the app DB in a smoke script so logic is testable without a phone
- **Pattern**: Deck-building, spaced-rep, and bookmark logic only ran "in the field" (phone), so bugs (code search missing the `section` column, normalize() paren handling, stale timer closure) could sit undetected or get caught only by the owner.
- **Rule**: Keep `tools/db-smoke.mjs` (Node `node:sqlite` + the real seed JSON, replicating `initializeDatabase`'s schema and the deck/bookmark queries). Every DB/normalize change gets re-run against it (`node tools/db-smoke.mjs`) before anything ships to a phone; it currently covers seeding, due-queue ordering, progress upserts, bookmark uniqueness, section counts/search, and normalize() matching.
- **Date**: 2026-08-18

### 9. [expo] Typed-routes can break latent template components after the route set changes
- **Pattern**: The template `components/ExternalLink.tsx` typed `href` as plain `string`; it compiled while the route set was small, but once the app grew to 13 routes, typedRoutes regenerated `.expo/types/router.d.ts` and `string` no longer fit the `Link` href union — tsc only caught it after the route set changed, not when the file was "written".
- **Rule**: After adding/removing routes, always run a full `npx tsc --noEmit`; when a template helper needs a plain-string href, keep the `href: string` API and cast once at the `<Link>` boundary instead of fighting the union.
- **Date**: 2026-08-18

### 10. [web] RN-web Alert.alert is a silent no-op — gate it per platform
- **Pattern**: Mock Exam's "Submit exam" on web did nothing: `react-native-web` implements `Alert.alert` as an empty static method, so tapping the button on the last question silently swallowed the submit (the exam phase persisted indefinitely). E2E (tools/e2e-chrome.cjs) proved it only after the app reached "25/25, Submit exam" and never left.
- **Rule**: Never rely on `Alert` for web. In `mock.tsx` the handler is now `if (Platform.OS === 'web') { submitExam(false); return; }` before the native `Alert.alert(...)`. Note the trap I nearly shipped: referencing `Platform` without importing it throws only at tap-time (`ReferenceError` inside `onPress`), invisible until a real tap.
- **Date**: 2026-08-23

### 11. [testing] Headless Chrome (--dump-dom) is a unreliable web-hang detector — use real Chrome over CDP
- **Pattern**: The web app "failed to boot" in every headless probe: virtual-time dumps and real-time dumps both showed an empty `#root`, yet a real Chrome window rendered Home in seconds. Root cause of the false positives: (a) `--virtual-time-budget` fast-forwards timers while OPFS File-System-Access promises don't resolve in time, and (b) a virtual-time page dump can outlive the React commit. The worker, wasm asset, and OPFS were all fine (proven with isolated probe pages: fetch 200, wasm instantiate OK, OPFS create OK in real Chrome).
- **Rule**: Verify web with `tools/e2e-chrome.cjs` — real Chrome (non-headless) driven over CDP (`--remote-debugging-port=9223`), fresh `--user-data-dir` per run (empty OPFS → exercises first-boot seeding), pointer-event taps (RN-web hit-tests `pointerup` against the touchable), and a `waitFor(predicate, timeout)` loop on `document.body.innerText`. Screenshots land in `tasks/evidence/`. Reserve headless `--dump-dom` for "does the server answer 200" checks, not "did React mount".
- **Date**: 2026-08-23

### 12. [testing] React-controlled RN-web TextInput ignores synthetic `input` events — type via CDP `Input.insertText`
- **Pattern**: Typing into the bookmark note field from a CDP script "failed": setting `el.value` with the native setter + dispatching `input`/`InputEvent` updated the DOM value and the event even reached React's root listener, yet `onChangeText` never fired and the value reverted on re-render. RN-web's controlled TextInput only commits text through the browser's real insertion path.
- **Rule**: In `tools/e2e-chrome.cjs`, `__focusInput()` focuses the field and CDP `Input.insertText` does the typing (what a real user is, for React). Same family of trap as lesson 11: the probe that "types" must be as real as the user it emulates.
- **Date**: 2026-08-23

### 13. [infra] Metro's file watcher dies when a hidden edit-temp dir vanishes mid-scan (Windows)
- **Pattern**: The web dev server (pwsh background job) crashed outright with `Error: ENOENT/EPERM: watch 'D:\test-app\…\.PHASE-CHECKLIST.md.<pid>.<guid>.tmpdir'` from `metro-file-map/src/watchers/FallbackWatcher`. Every file edit the harness performs creates a hidden `.NAME.<pid>.<uuid>.tmpdir` next to the file; Metro's fallback walker races the dir-creation, fails to `watch()` it after it's renamed away, and the whole Metro process throws (uncaught), silently killing `expo start`. Symptoms: app was fine mid-E2E, then every later `waitFor` times out at ECONNREFUSED.
- **Rule**: If the web server job (or any long `expo start`) dies with an uncaught `FSWatcher` error after files were created/edited, don't chase app code — restart the server and treat it as a watcher race. Keep dev-server jobs separate from edit-heavy phases when possible; the E2E run itself is the smoke test that the server is alive.
- **Date**: 2026-08-23

## Format
Each lesson should include:
- **Category tag**: [auth], [db], [testing], [ui], [infra], [content], [expo], [navigation]
- **Pattern**: What happened
- **Rule**: What to do instead
- **Date**: When learned
