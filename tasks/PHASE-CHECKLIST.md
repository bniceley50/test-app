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
- [x] App boots on **web** (Metro web export green, incl. wa-sqlite .wasm asset) AND in **Expo Go**. *(web: full E2E click-through in real Chrome now — `node tools/e2e-chrome.cjs`, evidence in `tasks/evidence/`; Expo Go + real devices: owner check under P1)*
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
- [x] **Mock Exam** (`app/mock.tsx`): 25/50 Q picker; timer; auto-submit; breakdown; pass/fail. *(built 2026-08-18: picker with locked 3 min/Q pace (25→75m, 50→150m; bank of 41 → 41 Q/123m with a visible note), live countdown that turns red under 5:00, auto-submit with a banner (END-TO-END 2026-08-24: standalone `tools/e2e-autosubmit.cjs` waits out a real 75:00 countdown untouched → "Time expired — exam was auto-submitted." + "0 / 25 correct · 75:00 elapsed", DB row completed at 75.0 min — evidence 12-mock-autosubmit.png; two earlier runs were invalidated by a zombie Chrome holding port 9231, lesson #14), NO feedback during the exam (select→advance, skip=blank, back=revise), per-topic breakdown bars + 80% pass circle, missed-question review with answers + explanations. tsc clean; web + iOS + Android exports all green. Owner phone pass pending.)*
- [x] **Topics** (`app/(tabs)/topics.tsx`): 13-topic heat grid (green>80 / yellow 60–80 / red<60); tap → topic drill. *(built 2026-08-18: 2-up grid of all 13 seeded topics, legend, refresh-to-update, untested = neutral, tap → /drill?topic=slug, error + empty states.)*
- [x] **Code Reference** (`app/(tabs)/code.tsx`): search; expandable summary + text; section → its questions; bookmark. *(built 2026-08-18: 250ms-debounced search over title/summary/keywords, expandable cards with keyword chips + linked questions (prompt/answer/explanation), per-section and per-question bookmark stars → new `bookmarks` table, empty + error states.)*
- [x] Home nav links wired to all of the above. *(Mock card enabled on Home; Topics/Code already in tab bar. Drill answer card also got a bookmark star — P3 item pulled forward.)*

## Phase 3 — Fill the deliberate gaps
- [x] Fill-in-the-blank UI renders + grades (normalized trim/case-insensitive match); only verified enter the pool. *(built 2026-08-18: `lib/normalize.ts` (trim, case-insensitive, whitespace-collapse, numeric fallback "1/2"≡"0.5"); drill + missed render a fill-blank input with "Check answer" and show your/expected answer after; mock treats it as a lock-in under exam conditions; pool unchanged (verified-only, all 41 seeded are mcq today — UI ready for future content). LIVE-PROVEN 2026-08-23 in web E2E: a verified fill_blank ("1/2") is seam-inserted and made due, so Drill's Q1 renders the type-in UI (evidence 11-fill-blank-ui.png), and typing "0.5" grades "Correct!" — the normalized numeric match works on a real answer, not just unit tests (evidence 13-fill-blank-correct.png).)*
- [x] Spaced-rep "due" queue: `next_review <= now` + lower-confidence-first blends to top of Drill + Mock decks. *(built 2026-08-18: `getDeckWithDue(count, topic?)` in lib/database.ts — due items (most overdue, then lowest confidence) lead the deck, filled with random verified non-due; Drill (all + topic) and Mock both consume it. Driven by the existing write-only `next_review` column from `recordAttempt`. LIVE-PROVEN 2026-08-23 in web E2E: a question backdated 7 days via the `__plumberDb` test seam is served FIRST in the Drill deck — evidence 09-due-queue-led.png.)*
- [x] Bookmarks table (`id, kind, question_id, code_section_id, note, created_at`). *(created 2026-08-18 in P2 — `kind` discriminates question vs code-section refs; `note` pre-wired for the Bookmarks screen.)*
- [x] Bookmarks screen: list bookmarked questions + code sections; editable notes; tap-through. *(built 2026-08-18: 4th tab — lists both kinds, expand for full question/section detail, editable note saved on blur, "Drill this topic →" / "Open Code Reference →" tap-through, remove, empty + error states.)*
- [x] Bookmark buttons on drill answer card, code-section detail, and question view. *(drill answer card star + Code Reference per-section and per-question stars, all → `bookmarks` table, 2026-08-18)*

## Phase 4 — Quality & ship
- [x] Unified loading / empty / error states across all screens. *(2026-08-18: Home stats error card; Drill + Missed error + "Try again"; Topics/Code/Bookmarks have error + empty + refresh; Mock has its own load error + setup; all data reads are local SQLite — no network anywhere.)*
- [x] Web end-to-end verification (all screens + a full Mock Exam cycle). *(2026-08-23, extended three times: `node tools/e2e-chrome.cjs` — real Chrome over CDP, fresh profile (exercises first-boot seeding), pointer-event taps, CDP `Input.insertText` for typing (RN-web controlled TextInput ignores synthetic events — lessons #10/#11/#12). 30/30 gates pass: home render + 41-Q seed; mock setup → live exam → answer/advance with no feedback → submit → per-topic results; **mock time scaling verified numerically — 50-Q mode on the 41-Q bank draws 41 Q with a 123-min countdown, setup states "41 Q / 123 min"**; home stats update after mock; bookmarks empty state; full 10-Q Drill to Results; bookmark star from drill answer card; bookmark entry expands; note typed + saved on blur (📝 hint); FRESH RELOAD → app reboots clean and study stats + bookmark + note persist in sqlite; **spaced-rep due-queue live-proven: a 7-day-overdue question (backdated via the `__plumberDb` test seam) is served FIRST in the Drill deck**; Missed via home card; Topics grid; **Topics tap → topic-filtered drill deck (law_licensing → 1/9)**; Code list + 090 expansion; **Code search typing filters list** ("storm" → only 20:130, others drop out); **Code section star → listed on Bookmarks as a CODE SECTION entry** (the non-question kind); **Fill-in-the-blank live-verified via seam-injected verified fill_blank (due, so it leads the deck): the type-in UI renders and typing "0.5" grades CORRECT vs stored "1/2" — the normalized numeric match**. Screenshots `01`–`11` + `13` in tasks/evidence/. Plus `tools/e2e-autosubmit.cjs`: a STANDALONE run that starts a 25-Q/75-min mock and waits the real countdown to zero untouched — proves auto-submit end-to-end (banner + results after ~75 min, evidence `12-mock-autosubmit.png`).)*
- [x] Home stats + streak consistent and correct. *(SQL-driven: sessions/day streak + accuracy average; unchanged by P3 — tsc + bundle green.)*
- [ ] Offline re-test passes after P3 changes (spaced-rep + bookmarks both read SQLite). *(owner — same script as before, now also: bookmark something, add a note, run a mock; airplane relaunch should keep everything.)*
- [ ] Full flow re-verified on BOTH iOS and Android. *(owner — new surface since the last phone pass: Mock, Topics, Code, Bookmarks, fill-blank UI.)*
- [x] `tasks/todo.md` updated to reflect shipped scope; `tasks/lessons.md` updated if anything new learned. *(STATUS section + success-criteria box in todo.md; 8 lessons in lessons.md through P4: wasm assetExt, verified-filter-in-query, dist/ export race, SQLite NULL-unique, Metro watcher race, zombie-CDP-port, startExam re-entrancy.)*
- [x] Production iOS (`.ipa`) / Android (`.aab`) build commands handed off (or built). *(PHONE-ONBOARDING.md §E + todo.md STATUS: `eas build --platform ios|android --profile production` after `eas login`.)*

## Sign-off
- [ ] All screens working: Home, Drill, Missed, Mock, Topics, Code Reference, Bookmarks. *(code + bundle-verified all 3 targets 2026-08-18; awaiting owner's phone pass on the new screens.)*
- [ ] Fully offline on a real phone (airplane mode), iOS + Android. *(P1 pass pre-P3; P3 re-test outstanding with the owner.)*
- [ ] Owner runs one full study cycle on their phone and confirms it "feels done."
