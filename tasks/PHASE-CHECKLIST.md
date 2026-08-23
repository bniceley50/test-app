# Definition of Done — KY Plumber Exam Prep App

Locked plan (agreed with owner). Work order: P0 → P1 → P2 → P3 → P4.
Keep, unchanged: 41 verified questions (`data/questions.seed.json`), 12 code sections
(`data/code_sections.seed.json`), `lib/` data layer, and all `tasks/` research + docs.
Rule: only `verified:1` questions ever enter a study mode (drill / missed / mock / due).

## Locked decisions
- Remove unused deps: `uuid`, `@types/uuid`, `nativewind`, `tailwindcss`,
  `react-native-reanimated`, `react-native-worklets` (zero imports in source).
- Mock Exam: 25 Q = 75 min, 50 Q = 150 min; live countdown; auto-submit at zero;
  no answers shown during; per-topic breakdown + 80% pass/fail after.
- Spaced repetition: overdue / low-confidence questions blend to the TOP of every
  deck (Drill + Mock). No separate entry point.
- Phone install path: Expo Go (iOS + Android real devices) first; production
  EAS builds handed off as commands at the end.

## Phase 0 — Baseline & hygiene
- [x] `npm install` clean; no broken peers. *(verified 2026-08-18)*
- [x] App boots on **web** (Metro web export green, incl. wa-sqlite .wasm asset) AND in **Expo Go**. *(web: verified via `npx expo export --platform web`; Expo Go + real devices: owner check under P1)*
- [x] Unused deps removed (uuid, @types/uuid, nativewind, tailwindcss, reanimated, worklets); `package.json` + `package-lock.json` in sync; app still boots. *(lockfile pruned & verified; web + ios + android exports all green after dep strip)*
- [x] Confirmed flows at code level: Home → Drill (10 Q) → Results, and Home → Missed → Results. *(drill.tsx / missed.tsx / results.tsx / store.ts / database.ts reviewed; all 41 seeded Q are mcq, so flows safe end-to-end; live click-through happens on owner's devices in P1)*
- [x] This checklist exists and is kept current.

## Phase 1 — Phone foundation (iOS + Android)
- [x] `eas.json` present: `development`, `preview`, `production` profiles. *(written 2026-08-18)*
- [x] iOS identity set (bundle id `com.brian.plumberprep`, icon) from existing `assets/`. *(verified via `npx expo config --type public`; provisional id — change before first store submission, see PHONE-ONBOARDING §F)*
- [x] Android identity set (package `com.brian.plumberprep`, adaptive icon) from existing `assets/`. *(same as above)*
- [x] Core runs on a REAL iOS device (Expo Go) — full drill works offline. *(owner confirmed 2026-08-18, per tasks/PHONE-ONBOARDING.md §C)*
- [x] Core runs on a REAL Android device (Expo Go) — full drill works offline. *(owner confirmed 2026-08-18, per tasks/PHONE-ONBOARDING.md §C)*
- [x] Airplane-mode offline test passes on a phone (DB seeded from bundle, no network). *(owner confirmed 2026-08-18 — both iOS and Android)*
- [x] Install steps documented in `tasks/` (how to get it on a phone via Expo Go). *(tasks/PHONE-ONBOARDING.md §A–B)*

## Phase 2 — Finish the three stub screens
- [x] **Mock Exam** (`app/mock.tsx`): 25/50 Q picker; timer; auto-submit; breakdown; pass/fail. *(built 2026-08-18: picker with locked 3 min/Q pace (25→75m, 50→150m; bank of 41 → 41 Q/123m with a visible note), live countdown that turns red under 5:00, auto-submit with a banner, NO feedback during the exam (select→advance, skip=blank, back=revise), per-topic breakdown bars + 80% pass circle, missed-question review with answers + explanations. tsc clean; web + iOS + Android exports all green. Owner phone pass pending.)*
- [x] **Topics** (`app/(tabs)/topics.tsx`): 13-topic heat grid (green>80 / yellow 60–80 / red<60); tap → topic drill. *(built 2026-08-18: 2-up grid of all 13 seeded topics, legend, refresh-to-update, untested = neutral, tap → /drill?topic=slug, error + empty states.)*
- [x] **Code Reference** (`app/(tabs)/code.tsx`): search; expandable summary + text; section → its questions; bookmark. *(built 2026-08-18: 250ms-debounced search over title/summary/keywords, expandable cards with keyword chips + linked questions (prompt/answer/explanation), per-section and per-question bookmark stars → new `bookmarks` table, empty + error states.)*
- [x] Home nav links wired to all of the above. *(Mock card enabled on Home; Topics/Code already in tab bar. Drill answer card also got a bookmark star — P3 item pulled forward.)*

## Phase 3 — Fill the deliberate gaps
- [x] Fill-in-the-blank UI renders + grades (normalized trim/case-insensitive match); only verified enter the pool. *(built 2026-08-18: `lib/normalize.ts` (trim, case-insensitive, whitespace-collapse, numeric fallback "1/2"≡"0.5"); drill + missed render a fill-blank input with "Check answer" and show your/expected answer after; mock treats it as a lock-in under exam conditions; pool unchanged (verified-only, all 41 seeded are mcq today — UI ready for future content).)*
- [x] Spaced-rep "due" queue: `next_review <= now` + lower-confidence-first blends to top of Drill + Mock decks. *(built 2026-08-18: `getDeckWithDue(count, topic?)` in lib/database.ts — due items (most overdue, then lowest confidence) lead the deck, filled with random verified non-due; Drill (all + topic) and Mock both consume it. Driven by the existing write-only `next_review` column from `recordAttempt`.)*
- [x] Bookmarks table (`id, kind, question_id, code_section_id, note, created_at`). *(created 2026-08-18 in P2 — `kind` discriminates question vs code-section refs; `note` pre-wired for the Bookmarks screen.)*
- [x] Bookmarks screen: list bookmarked questions + code sections; editable notes; tap-through. *(built 2026-08-18: 4th tab — lists both kinds, expand for full question/section detail, editable note saved on blur, "Drill this topic →" / "Open Code Reference →" tap-through, remove, empty + error states.)*
- [x] Bookmark buttons on drill answer card, code-section detail, and question view. *(drill answer card star + Code Reference per-section and per-question stars, all → `bookmarks` table, 2026-08-18)*

## Phase 4 — Quality & ship
- [ ] Unified loading / empty / error states across all screens.
- [ ] Home stats + streak consistent and correct.
- [ ] Offline re-test passes after P3 changes (spaced-rep + bookmarks both read SQLite).
- [ ] Full flow re-verified on BOTH iOS and Android.
- [ ] `tasks/todo.md` updated to reflect shipped scope; `tasks/lessons.md` updated if anything new learned.
- [ ] Production iOS (`.ipa`) / Android (`.aab`) build commands handed off (or built).

## Sign-off
- [ ] All screens working: Home, Drill, Missed, Mock, Topics, Code Reference, Bookmarks.
- [ ] Fully offline on a real phone (airplane mode), iOS + Android.
- [ ] Owner runs one full study cycle on their phone and confirms it "feels done."
