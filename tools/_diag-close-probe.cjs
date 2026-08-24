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

  // Close using the APP-level closeDatabase (same path as pagehide), then
  // re-boot in the SAME document (tab-switch path) and verify data survives
  // the VFS re-acquisition.
  const close = await send('Runtime.evaluate', {
    expression: 'globalThis.__plumberClose ? globalThis.__plumberClose().then(function(){return "closed-ok";},function(e){return "close-err:"+(e&&e.message);}) : "no-close-ctx"',
    awaitPromise: true,
  });
  log('close via app ctx: ' + JSON.stringify(close.result ? close.result.value : close));

  await sleep(2500);

  // after close, a query on the old seam handle fails "Database not found"
  // (the worker released the handle it was tracking).
  const after = await send('Runtime.evaluate', {
    expression: 'globalThis.__plumberDb ? globalThis.__plumberDb.getAllAsync("SELECT 1 LIMIT 1").then(function(){return "still-works?";},function(e){return "seam-err:"+(e&&e.message);}) : "no-seam"',
    awaitPromise: true,
  });
  log('post-close old-handle query: ' + JSON.stringify(after.result ? after.result.value : after));

  // RE-BOOT the same document via the app boot path. This is the tab-switch
  // case: the worker VFS was closed with #directoryHandle set + maps cleared,
  // so the next open must re-create the VFS and re-acquire all six handles.
  const reboot = await send('Runtime.evaluate', {
    expression: 'Promise.resolve().then(function(){ if(!globalThis.__plumberBoot) return Promise.resolve("no-boot-ctx"); return globalThis.__plumberBoot().then(function(d){ return d.getAllAsync("SELECT (SELECT COUNT(*) FROM questions) q,(SELECT COUNT(*) FROM code_sections) cs FROM (SELECT 1) LIMIT 1").then(function(r){return "rebooted q="+r[0].q+" cs="+r[0].cs;},function(e){return "reboot-query-err:"+(e&&e.message);}); },function(e){return "reboot-err:"+(e&&e.message);}); })',
    awaitPromise: true,
  });
  log('same-document re-boot: ' + JSON.stringify(reboot.result ? reboot.result.value : reboot));

  await sleep(1500);

  const markers = consoleMsgs.filter(l => l.includes('plumber-sqlite') || l.includes('Database ready') || l.includes('init') || l.includes('cannot create file'));
  log('RELEVANT CONSOLE (' + markers.length + '):');
  markers.forEach(l => log('  | ' + l));
  log('FULL CONSOLE (' + consoleMsgs.length + '):');
  consoleMsgs.forEach((l, i) => log('  [' + i + '] ' + l));
  clearTimeout(hardTimer);
  try { proc.kill('SIGTERM'); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { log('FATAL ' + String(e && e.stack || e)); process.exit(1); });
