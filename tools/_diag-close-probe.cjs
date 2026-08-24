/** Probe: does db.closeAsync() (the pagehide path) actually release pool handles?
 *  Usage: node tools/_diag-close-probe.cjs <baseUrl>      e.g. ... http://localhost:8090
 *  - full page load of home (doc1, healthy boot)
 *  - eval: closeAsync() via the __plumberDb seam (awaitPromise)
 *  - wait, then dump: plumber-sqlite console markers, seam liveness after close
 *  Writes to tools/_diag-out.txt
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const BASE = process.argv[2] || 'http://localhost:8090';
const OUT = path.join(__dirname, '_diag-out.txt');
fs.writeFileSync(OUT, '');
const log = (s) => { fs.appendFileSync(OUT, s + '\n'); };

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP = 9244;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const hardTimer = setTimeout(() => { log('=== HARD-TIMEOUT dump'); process.exit(3); }, 60000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-diag-'));
  const proc = spawn(CHROME, [
    '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,900',
    BASE + '/',
  ], { stdio: 'ignore', detached: true });
  proc.unref();

  let ws = null, seq = { n: 0 };
  const pending = new Map();
  const consoleMsgs = [];
  function send(method, params) {
    return new Promise((resolve) => {
      const id = seq.n++;
      const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ __timeout: true }); } }, 25000);
      pending.set(id, (v) => { clearTimeout(t); resolve(v); });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  let target = null;
  for (let i = 0; i < 70 && !target; i++) {
    await sleep(300);
    try {
      const res = await fetch('http://127.0.0.1:' + CDP + '/json/list');
      const list = await res.json();
      target = list.find(t => t.type === 'page');
    } catch {}
  }
  if (!target) { log('NO TARGET'); process.exit(1); }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => { if (ws.readyState >= 1) return r(); ws.addEventListener('open', () => r(), { once: true }); setTimeout(r, 3000); });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result || {}); return; }
    if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.consoleAPICIalled') {
      const line = (msg.params.args || []).map(a => (a.value !== undefined ? a.value : (a.description || a.unserializableValue || ''))).join(' ');
      consoleMsgs.push(String(line).slice(0, 300));
    }
    if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });
  await send('Page.enable').catch(() => {});
  await send('Runtime.enable').catch(() => {});

  // wait for boot: seam live + q=41
  let bootSeam = 'no-seam';
  for (let i = 0; i < 25; i++) {
    await sleep(2000);
    const r = await send('Runtime.evaluate', {
      expression: 'Promise.resolve().then(function(){var db=globalThis.__plumberDb; if(!db||!db.getAllAsync) return Promise.resolve("no-seam"); return db.getAllAsync("SELECT (SELECT COUNT(*) FROM questions) q FROM (SELECT 1) LIMIT 1").then(function(r){return "q="+r[0].q;},function(e){return "dbthrew:"+e.message;});})',
      awaitPromise: true,
    });
    bootSeam = r.result ? String(r.result.value || '') : 'noresult';
    if (bootSeam.startsWith('q=')) break;
  }
  log('boot seam: ' + bootSeam);

  // THE PROBE: close via seam (what the pagehide handler does)
  const close = await send('Runtime.evaluate', {
    expression: 'globalThis.__plumberDb ? globalThis.__plumberDb.closeAsync().then(function(){return "closed-ok";},function(e){return "close-err:"+(e&&e.message);}) : "no-seam"',
    awaitPromise: true,
  });
  log('close via seam: ' + JSON.stringify(close.result ? close.result.value : close));

  await sleep(4000);

  // after close, a query should fail with worker-level "Database not found" (proof close reached worker)
  const after = await send('Runtime.evaluate', {
    expression: 'globalThis.__plumberDb ? globalThis.__plumberDb.getAllAsync("SELECT 1 LIMIT 1").then(function(){return "still-works?";},function(e){return "seam-err:"+(e&&e.message);}) : "no-seam"',
    awaitPromise: true,
  });
  log('post-close seam query: ' + JSON.stringify(after.result ? after.result.value : after));

  const markers = consoleMsgs.filter(l => l.includes('plumber-sqlite') || l.includes('Database ready') || l.includes('init'));
  log('RELEVANT CONSOLE (' + markers.length + '):');
  markers.forEach(l => log('  | ' + l));
  clearTimeout(hardTimer);
  try { proc.kill('SIGTERM'); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { log('FATAL ' + String(e && e.stack || e)); process.exit(1); });
