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
- [ ] Core runs on a REAL iOS device (Expo Go) — full drill works offline. *(owner: tasks/PHONE-ONBOARDING.md §C)*
- [ ] Core runs on a REAL Android device (Expo Go) — full drill works offline. *(owner: tasks/PHONE-ONBOARDING.md §C)*
- [ ] Airplane-mode offline test passes on a phone (DB seeded from bundle, no network). *(owner: tasks/PHONE-ONBOARDING.md §C, steps 1–6)*
- [x] Install steps documented in `tasks/` (how to get it on a phone via Expo Go). *(tasks/PHONE-ONBOARDING.md §A–B)*

## Phase 2 — Finish the three stub screens
- [ ] **Mock Exam** (`app/mock.tsx`): 25/50 Q picker; timer; auto-submit; breakdown; pass/fail.
- [ ] **Topics** (`app/(tabs)/topics.tsx`): 13-topic heat grid (green>80 / yellow 60–80 / red<60); tap → topic drill.
- [ ] **Code Reference** (`app/(tabs)/code.tsx`): search; expandable summary + text; section → its questions; bookmark.
- [ ] Home nav links wired to all of the above.

## Phase 3 — Fill the deliberate gaps
- [ ] Fill-in-the-blank UI renders + grades (normalized trim/case-insensitive match); only verified enter the pool.
- [ ] Spaced-rep "due" queue: `next_review <= now` + lower-confidence-first blends to top of Drill + Mock decks.
- [ ] Bookmarks table (`id, question_id, code_section_id, note, created_at`).
- [ ] Bookmarks screen: list bookmarked questions + code sections; editable notes; tap-through.
- [ ] Bookmark buttons on drill answer card, code-section detail, and question view.

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
