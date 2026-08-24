/** Cold full-document load of a route on a given base, dump console + errors.
 *  Usage: node tools/_diag-code.cjs <baseUrl> <route>   e.g. ... http://localhost:8090 /code
 *  Writes lines to tools/_diag-out.txt and prints nothing.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const BASE = process.argv[2] || 'http://localhost:8090';
const ROUTE = process.argv[3] || '/code';
const OUT = path.join(__dirname, '_diag-out.txt');
fs.writeFileSync(OUT, '');
const log = (s) => { fs.appendFileSync(OUT, s + '\n'); };

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP = 9244;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const hardTimer = setTimeout(() => { log('=== HARD-TIMEOUT dump'); process.exit(3); }, 90000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-diag-'));
  const proc = spawn(CHROME, [
    '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,900',
    BASE + ROUTE,
  ], { stdio: 'ignore', detached: true });
  proc.unref();

  let ws = null, seq = { n: 0 };
  const pending = new Map();
  const consoleMsgs = [], pageErrors = [];
  function send(method, params) {
    return new Promise((resolve) => {
      const id = seq.n++;
      const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ __timeout: true }); } }, 20000);
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
  log('target: ' + target.url);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => { if (ws.readyState >= 1) return r(); ws.addEventListener('open', () => r(), { once: true }); setTimeout(r, 3000); });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result || {}); return; }
    if (msg.method === 'Runtime.consoleAPICIalled' || msg.method === 'Runtime.consoleAPICalled') {
      const line = (msg.params.args || []).map(a => (a.value !== undefined ? a.value : (a.description || a.unserializableValue || (a.exceptionDetails ? 'EXC' : '')))).join(' ');
      consoleMsgs.push(String(line).slice(0, 350));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails || {};
      pageErrors.push(String((d.exception && d.exception.description) || d.text || JSON.stringify(d)).slice(0, 450));
    }
    if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });
  await send('Page.enable').catch(() => {});
  await send('Runtime.enable').catch(() => {});
  await send('Console.enable').catch(() => {});
  // Replicate the warm-probe path: full nav to home, wait for it, then navigate to ROUTE.
  await send('Page.navigate', { url: BASE + '/' });
  log('navigated to home; waiting for Drill...');
  let homeText = '';
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const r = await send('Runtime.evaluate', { expression: 'document.body ? document.body.textContent : ""', returnByValue: true });
    homeText = r.result ? String(r.result.value || '') : '';
    if (/Drill/i.test(homeText)) break;
  }
  log('home ready: ' + /Drill/.test(homeText) + ' (' + homeText.slice(0, 80) + ')');
  await send('Page.navigate', { url: BASE + ROUTE });
  log('navigated to ' + ROUTE + '; waiting...');
  await sleep(22000);

  const body = await send('Runtime.evaluate', { expression: 'document.body ? document.body.textContent.slice(0,140) : ""', returnByValue: true });
  log('BODY: ' + JSON.stringify(body.result ? body.result.value : ('noresult:' + JSON.stringify(body).slice(0,120))));
  const seam = await send('Runtime.evaluate', {
    expression: 'Promise.resolve().then(function(){var db=globalThis.__plumberDb; if(!db||!db.getAllAsync) return Promise.resolve("no-seam"); return db.getAllAsync("SELECT (SELECT COUNT(*) FROM questions) q,(SELECT COUNT(*) FROM code_sections) cs FROM (SELECT 1) LIMIT 1").then(function(r){return "q="+r[0].q+" cs="+r[0].cs;},function(e){return "dbthrew:"+(e&&e.message);});})',
    awaitPromise: true,
  });
  log('SEAM: ' + JSON.stringify(seam.result ? seam.result.value : JSON.stringify(seam).slice(0,160)));
  log('CONSOLE (' + consoleMsgs.length + '):');
  consoleMsgs.slice(-50).forEach(l => log('  | ' + l));
  log('PAGEDERRS (' + pageErrors.length + '):');
  pageErrors.forEach(e => log('  ! ' + e));
  clearTimeout(hardTimer);
  try { proc.kill('SIGTERM'); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { log('FATAL ' + String(e && e.stack || e)); process.exit(1); });
