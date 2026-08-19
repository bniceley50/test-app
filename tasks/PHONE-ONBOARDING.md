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

## C. Airplane‑mode offline test (the P1 gate)
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
