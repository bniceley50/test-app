/** Cold-landing + hard-reload matrix for /code on a given base.
 *  Usage: node tools/_diag-cold-reload.cjs <baseUrl>   e.g. http://localhost:8090
 *  Phases (same base+route each time):
 *    A  fresh profile, chrome launched DIRECTLY on /code  (cold landing, empty OPFS)
 *    B  fresh chrome process, SAME profile (DB already exists in OPFS),
 *       launched directly on /code again (cold landing over an existing DB)
 *    C  Page.reload on the resulting /code document
 *    D  Page.reload a second time
 *  Every phase must show content marker + seam q=41 cs=12 and add no page errors.
 *  Screenshots to tasks/evidence/ 20/221/22/23*-…8090.png.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const BASE = (process.argv[2] || 'http://localhost:8090').replace(/\/$/, '');
const FS = BASE.includes('8090') ? '8090' : '8081';
const EV = path.join(__dirname, '..', 'tasks', 'evidence');
const OUT = path.join(__dirname, '_diag-out.txt');
fs.writeFileSync(OUT, '');
const log = (s) => { fs.appendFileSync(OUT, s + '\n'); console.log(s); };

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP = 9245;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const CONTENT_RE = /815KAR20/;
const SEAM_OK = 'q=41 cs=12';

let ws = null, seq = { n: 0 };
const pending = new Map();
let pageErrors = 0;
function send(method, params) {
  return new Promise((resolve) => {
    const id = seq.n++;
    const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ __timeout: true }); } }, 20000);
    pending.set(id, (v) => { clearTimeout(t); resolve(v); });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
function attach(list) {
  const target = list.find(t => t.type === 'page');
  if (!target) throw new Error('no page target');
  return new Promise((resolve, reject) => {
    const w = new WebSocket(target.webSocketDebuggerUrl);
    const t = setTimeout(() => reject(new Error('ws open timeout')), 5000);
    w.addEventListener('open', () => { clearTimeout(t); resolve(w); });
  }).then((w) => {
    ws = w;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result || {}); return; }
      if (msg.method === 'Runtime.exceptionThrown') pageErrors++;
      if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    });
  });
}

async function waitForReady(proc, tag, timeoutMs) {
  const hard = setTimeout(() => { log(`  [${tag}] TIMEOUT after ${timeoutMs}ms`); if (proc) { killProc(proc); } process.exit(1); }, timeoutMs);
  let ok = false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(1500);
    try {
      const res = await fetch('http://127.0.0.1:' + CDP + '/json/list');
      const list = await res.json();
      const target = list.find(t => t.type === 'page');
      if (target) await attach(list);
      if (!ws || ws.readyState > 1) continue;
    } catch (e) { log('  [' + tag + '] attach retry: ' + e.message); ws = null; }
    if (!ws) continue;
    await send('Runtime.enable').catch(() => {});
    const body = await send('Runtime.evaluate', { expression: 'document.body ? document.body.textContent : ""', returnByValue: true });
    const text = body.result ? String(body.result.value || '') : '';
    const seam = await send('Runtime.evaluate', {
      expression: 'Promise.resolve().then(function(){var db=globalThis.__plumberDb; if(!db||!db.getAllAsync) return Promise.resolve("no-seam"); return db.getAllAsync("SELECT (SELECT COUNT(*) FROM questions) q,(SELECT COUNT(*) FROM code_sections) cs FROM (SELECT 1) LIMIT 1").then(function(r){return "q="+r[0].q+" cs="+r[0].cs;},function(e){return "dbthrew";});})',
      awaitPromise: true,
    });
    const seamValue = seam.result ? String(seam.result.value || 'noresult') : 'noresult';
    if (CONTENT_RE.test(text) && seamValue === SEAM_OK) {
      clearTimeout(hard);
      return { ok: true, seam: seamValue };
    }
  }
  clearTimeout(hard);
  return { ok: false, seam: 'unknown' };
}

function killProc(proc) {
  try { proc.kill('SIGTERM'); } catch {}
}
let currentProc = null;
async function stopChrome() {
  killProc(currentProc);
  await sleep(800);
}

const CONTENT_TAG = { 0: 'COLD-LANDING-FRESH', 1: 'COLD-LANDING-EXISTING-DB', 2: 'HARD-RELOAD-1', 3: 'HARD-RELOAD-2' };
const SHOTS = { 0: '20-cold-landing-' + FS, 1: '21-cold-existing-db-' + FS, 2: '22-hard-reload-1-' + FS, 3: '23-hard-reload-2-' + FS };

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-diag-'));
  const results = [];
  let proc = null;
  for (let phase = 0; phase < 4; phase++) {
    const tag = CONTENT_TAG[phase];
    log('=== ' + tag + ' ===');
    pageErrors = 0;
    if (phase < 2) ws = null;
    if (phase === 2 || phase === 3) {
      // fresh full-document reload of the existing /code doc
      const pre = pageErrors;
      await send('Page.reload', { ignoreCache: true });
      const r = await waitForReady(null, tag, 40000);
      const ok = r.ok && pageErrors === pre;
      results.push([tag, ok, r.seam, pageErrors]);
      log(`  content+seam: ${r.ok ? 'OK' : 'FAIL'} | seam=${r.seam} | pageErrors=${pageErrors - pre}`);
      if (!ok) { log('RESULT: FAIL at ' + tag); writeReport(results); process.exit(1); }
      await shot(SHOTS[phase] + '.png');
      continue;
    }
    if (phase === 1) await stopChrome();
    proc = spawn(CHROME, [
      '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile,
      '--no-first-run', '--no-default-browser-check', '--window-size=1280,900',
      BASE + '/code',
    ], { stdio: 'ignore', detached: true });
    proc.unref();
    currentProc = proc;
    const r = await waitForReady(proc, tag, 40000);
    const ok = r.ok && pageErrors === 0;
    results.push([tag, ok, r.seam, pageErrors]);
    log(`  content+seam: ${r.ok ? 'OK' : 'FAIL'} | seam=${r.seam} | pageErrors=${pageErrors}`);
    if (!ok) { killProc(proc); log('RESULT: FAIL at ' + tag); writeReport(results); process.exit(1); }
    await shot(SHOTS[phase] + '.png');
  }
  killProc(proc);
  writeReport(results);
  log('RESULT: ALL 4 PHASES OK');
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { log('FATAL ' + String(e && e.stack || e)); process.exit(1); });

async function shot(name) {
  try {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r && r.data) fs.writeFileSync(path.join(EV, name), Buffer.from(r.data, 'base64'));
    log('  screenshot: ' + name);
  } catch (e) { log('  shot failed: ' + e.message); }
}
function writeReport(results) {
  log('--- report ---');
  results.forEach(([tag, ok, seam, errs]) => log(`${ok ? 'PASS' : 'FAIL'}  ${tag}  seam=${seam} pageErrors=${errs}`));
}
