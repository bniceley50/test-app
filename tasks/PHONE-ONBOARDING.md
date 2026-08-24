# Getting the app on a real phone (Expo Go) + offline test

Goal of Phase 1: the **existing core** (Home → Drill / Missed → Results) runs on a
real iPhone and a real Android phone, fully **offline**, via Expo Go. No new
screens are being tested yet — feature screens land in P2 *after* you confirm
this works on both devices.

## Prereqs
- Node 20+ on this PC (already satisfied — `npx expo` is working).
- Expo Go installed:
  - iOS: **App Store → "Expo Go"** (free).
  - Android: **Play Store → "Expo Go"** (free; APK from expo.dev if none in store).
- This PC and **both phones on the same Wi‑Fi network** (see LAN notes below).
- From `D:\test-app`: `npm install` already done (verified).

## A. Start the dev server
```powershell
cd D:\test-app
npx expo start
```
- Pick **i** (iPhone) or **a** (Android) in the menu, or just leave it — a QR
  code + URL appear in the terminal.
- Scan the QR:
  - iPhone: open **Camera** app, point at the QR → banner → open in Expo Go.
  - Android: open **Expo Go** → **Scan QR code**, or just tap the QR in the
    Play/App preview if it offers it.
- Expo Go compiles the bundle on first launch (needs internet for that one
  fetch). After it's loaded once, the app's data (questions, progress) lives in
  on-device SQLite — no network needed for anything.

## B. LAN / QR caveats (Windows + corporate networks are where this bites)
- The phone **must** be able to reach `http://<this-PC>:8081`. If the scan does
  nothing or hangs in a spinner:
  1. Check the URL printed in the terminal (e.g. `http://192.168.x.x:8081`) and
     open it manually in the phone's browser — that URL is loadable in Expo Go
     via **Expo Go → type/paste URL** (Android) or re-scan.
  2. Same Wi‑Fi is mandatory; VPNs on the phone that route outside your LAN,
     or corporate Wi‑Fi with client isolation, will block it.
  3. If Wi‑Fi can't be made to work, fallback (uses internet, fine for dev):
     ```powershell
     npx expo start --tunnel
     ```
     (first run may ask to allow a `@expo/ngrok` dependency — yes.)
- Windows firewall: when `npx expo` starts, allow access on private/public
  networks if it prompts.
- iOS caveat: Expo Go on iOS uses a JS engine + native modules shipped with
  Expo Go — `expo-sqlite` works out of the box, nothing extra to do.

## C. Airplane‑mode offline test (P1 gate — core flow)
Do this on **each** phone (iOS first, then Android):

1. **Warm it up online:** connect via the QR, wait for the app to fully load,
   run one Drill (10 Q) to end → Results. Confirm it seeded and saved progress.
2. Turn the phone into **Airplane mode** (all radios off).
3. **Fully kill** the app:
   - iOS: swipe away from App Switcher.
   - Android: Recents → swipe the app away.
4. Reopen Expo Go and relaunch the app. **Expected:** it loads from cache,
   no spinner, no network errors.
5. Run the full flow:
   - Home → **Drill** (10 Q). Answer at least one **wrong** on purpose.
   - Results: score, time, correct/missed all shown; **Drill Again** works.
   - Home → **Missed Questions**: the question(s) you got wrong are in the list;
     answer it correctly → it clears.
   - Home stats (sessions / streak / topics) reflect your activity.
6. **Restart the app once more** (kill + relaunch in airplane mode).
   **Expected:** all of your progress is still there (SQLite on device).

Pass criteria for P1: steps 4–6 work with **zero** network access, on **both**
phones, and nothing feels broken (no blank screens, no hanging spinners,
no red error boxes).

## C*. Your web click-through (do this first — ~10 min, no install)
The web build is the same app, same SQLite, same screens. Browser to
**http://localhost:8081** (dev server) — or the exported build on port 8090
via `node tools/static-web.cjs` (both proven 2026-08-24, round 22, after the
web OPFS fix). Gate: same behavior as the phone test, no phone involved.

> **Round 22 note — where this used to hurt and what to look for.** A hard
> full-page navigation (typing a URL directly, opening a link from another
> tab, or refreshing) used to occasionally dead-end on the web: the previous
> page held the database file locks until Chromium's garbage collector
> finished, and the new page reported a DB error with no recovery. That is
> fixed — when a page leaves, the app now releases its database handles
> immediately, so the incoming page boots clean. Worst case you may see the
> splash for up to ~12 s longer than usual; a tab-error card (if one ever
> appears) has **Load again**. One suggested extra check while you're here:
> from Home, open **http://localhost:8081/code** in a *new* browser tab and
> hard-refresh that tab twice — both should show the code list, not an error
> card.

1. **Home** loads (no spinner stuck), shows your 41-question bank + streak
   stats.
2. **Drill** — start a 10-Q run, answer, get one wrong on purpose; the
   answer card shows result + explanation; a **bookmark star** is there.
3. **Missed** — the wrong question you just missed is in the list;
   answering it correctly clears it.
4. **Mock Exam (tab or Home card)** — start **25 questions**. Answer 3–4,
   get one wrong, no feedback shown while answering. Use **Submit exam** on
   the last question. Results: score vs the **80%** line, per-topic bars,
   missed-review. (Skip the 75-min wait this time — auto-submit is
   machine-proven; if you *do* want to wait, leave it alone.)
5. **Topics tab** — 13-topic grid; colors reflect your scores; tap one →
   topic drill.
6. **Code tab** — search "090", expand a section, see its linked questions,
   star a section (and a question).
7. **Bookmarks tab** — the 2 starred items are listed; expand one, type a
   note, leave the field (it saves). **Reload the page** → the note persists
   (it's in SQLite, not memory).
8. Refresh any screen once more — nothing blank, no red error cards. If an
   error card *does* appear it carries a **Load again** button (every tab has
   one since the 2026-08-24 static-export probe); tap it once and report the
   original if it returns.

If that all feels right, phone §C2 should feel identical (same code).

## C2. P4 offline re-test (new screens, after the P3/P4 build)
Repeat on **both** phones (iOS first). Everything you do in steps 1–5 should
survive the airplane relaunch in step 7 — that's the gate.

1. **Connect** via QR; let the bundle load.
2. **Topics tab:** heat grid shows all 13 topics (grey "Untested" is normal on
   a fresh install). Tap one → topic drill → answer a couple, get one wrong.
   Color should update as you go.
3. **Code tab:** search "090" → expand a section → see its linked questions →
   tap the ☆ on a section **and** on a question.
4. **Home → Mock Exam:** start the **25 Q / 75 min** mode. Answer 3–4 (get at
   least one wrong — the exam shows ZERO feedback mid-exam), then use
   **Submit exam** on the last question. Results: score circle vs the **80%**
   line, per-topic bars, and a missed-review list. Then **Drill my misses**.
5. **Bookmarks tab:** your two bookmarks are there. Expand the question one,
   type a note (e.g. "re-check 20:090 trap table"), leave the field.
6. **Airplane mode ON** (all radios off) → **fully kill** the app
   (iOS: swipe away; Android: Recents → swipe away).
7. **Relaunch.** No spinner-hang. Check **each** tab:
   - Home — stats/streak intact from the pre-airplane session.
   - Drill — the questions you missed are likely at the TOP of the deck
     (spaced-rep due-queue), and the questions you got right come back later
     (their `next_review` moved out).
   - Mock — finish one more 25-Q exam with zero network — timer, auto-submit
     behavior (wait near zero), and breakdown all work.
   - Bookmarks — your note survives the relaunch (it's in SQLite, not memory).
   - Topics — colors still reflect your scores.
   - Code — search + expand still instant; bookmark stars still filled.
8. **Restart once more in airplane.** Everything from step 7 persists.

P4 pass: steps 6–7 clean on **both** phones with zero network, and no red
error cards anywhere on first touch of each screen.

## D. Known-expected behavior (not bugs)
- First-ever bundle fetch needs internet (that's Expo Go's design).
- `expo export --platform web` output in `dist/` is the web story; phones run
  the dev bundle from the `npx expo start` server.
- No push, no accounts, no backend — by design.

## E. What happens next (after your "green" confirmation)
- P2: Mock Exam (25 Q/75 min, 50 Q/150 min, auto‑submit, topic breakdown),
  Topics heat‑grid, Code Reference (search + bookmarks).
- P3: fill‑in‑the‑blank UI, spaced‑repetition due‑queue blended to deck tops,
  Bookmarks screen with editable notes for questions and code sections.
- P4: unified states, offline re‑test, and the production build handoff:
  ```powershell
  npm i -g eas-cli
  eas login
  eas build --platform ios   --profile production   # .ipa
  eas build --platform android --profile production # .aab/.apk
  ```

## F. Identity note (before first store submission)
Provisional, set today for EAS identity stability:
- iOS `bundleIdentifier` / Android `package`: **`com.brian.plumberprep`**
- App name/slug: **`test-app`**
Both are cheap to change now and annoying to change after a store submission.
If you want different names (e.g. `PlumberPrepKY`, `com.testapp...`), say the
word **before** any P4 store build — not after.
