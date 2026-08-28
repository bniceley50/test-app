/**
 * Re-apply the test-app patches to the WEB build of expo-sqlite after any
 * `npm|pnpm|yarn install` (hooked via package.json postinstall).
 *
 *   vendor/expo-sqlite-web/worker.ts                 -> node_modules/expo-sqlite/web/worker.ts
 *   vendor/expo-sqlite-web/wa-sqlite/AccessHandlePoolVFS.js -> node_modules/expo-sqlite/web/...
 *
 * WHAT THE PATCHES FIX (web-only; native untouched):
 *
 * expo-sqlite's web backend stores every SQLite file in a POOL of 6 random OPFS
 * files, each opened with a `FileSystemSyncAccessHandle` held for the whole
 * worker's life. Chromium allows exactly ONE open sync handle (or writable
 * stream) per file. After a hard full-page navigation (deep link, reload, link
 * out and back) the PREVIOUS document — garbage, but not yet reclaimed — still
 * holds those handles, so the NEW document's VFS pool create fails with
 * NoModificationAllowedError. Unpatched, that failure strands the worker's
 * one-shot `maybeInitAsync` with `_vfs == null` while `_sqlite3` is set, and
 * every later open in the new document reports "Invalid VFS state" — the UI
 * dead-ends on the web while phones are fine.
 *
 *   1. worker.maybeInitAsync: create+register each VFS independently so a
 *      partial failure is retried on the NEXT open instead of sticking.
 *      (AccessHandlePoolVFS keeps its throw-on-blocked data-integrity behavior:
 *      the blocked file may hold the actual DB, so retrying after release is
 *      safer than skipping it.)
 *   2. worker.closeDatabase: when no databases remain, release the pool's sync
 *      handles deterministically (app calls this on pagehide) so navigation
 *      away from the page frees the files for the incoming document WITHOUT
 *      waiting for Chrome to GC the old one.
 *
 * The app-side backoff in lib/database.ts boot (web only, ~11.6s worst case
 * under the root splash) covers the race window; the pagehide close in
 * app/_layout.tsx normally lets the first or second attempt win on the
 * incoming page.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const vendor = path.join(ROOT, 'vendor', 'expo-sqlite-web');
const target = path.join(ROOT, 'node_modules', 'expo-sqlite', 'web');

const pairs = [
  ['wa-sqlite/AccessHandlePoolVFS.js', 'wa-sqlite/AccessHandlePoolVFS.js'],
  ['worker.ts', 'worker.ts'],
];

for (const [from, to] of pairs) {
  const src = path.join(vendor, from);
  const dst = path.join(target, to);
  if (!fs.existsSync(src)) {
    console.warn(`[apply-expo-sqlite-patch] missing source ${src} — is vendor/ intact?`);
    process.exitCode = 1;
    continue;
  }
  if (!fs.existsSync(path.dirname(dst))) {
    console.warn(`[apply-expo-sqlite-patch] missing install dir ${path.dirname(dst)} — run npm install first`);
    process.exitCode = 1;
    continue;
  }
  fs.copyFileSync(src, dst);
  console.log(`[apply-expo-sqlite-patch] patched node_modules/expo-sqlite/web/${to}`);
}
