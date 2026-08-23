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

## Format
Each lesson should include:
- **Category tag**: [auth], [db], [testing], [ui], [infra], [content], [expo], [navigation]
- **Pattern**: What happened
- **Rule**: What to do instead
- **Date**: When learned
