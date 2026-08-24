/**
 * Live-render smoke: open the RUNNING dev server (http://localhost:8081) in a
 * fresh Chrome over CDP and confirm the REAL app boots — home renders after
 * DB seed, and two tab routes render their own content. Evidence screenshots
 * document the exact server state the owner will click through.
 *
 * Usage: node tools/live-web-check.cjs   (CDP port 9242, never reused)
 * Exits 0 only if every assertion passes.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9242;
const BASE = 'http://localhost:8081';
const EV = path.join(__dirname, '..', 'tasks', 'evidence');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let ws;
let seq = { n: 0 };
async function cdpSend(method, params) {
  return new Promise((resolve) => {
    const id = seq.n++;
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) { ws.removeEventListener('message', onMsg); resolve(msg); }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function bodyText() {
  const r = await cdpSend('Runtime.evaluate', {
    expression: '(document.body && document.body.innerText) || ""',
    returnByValue: true,
  });
  return r.result && typeof r.result.value === 'string' ? r.result.value : '';
}
async function evAwait(expression) {
  const r = await cdpSend('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result && typeof r.result.value === 'string') return r.result.value;
  if (r.exceptionDetails) return 'ERR ' + JSON.stringify(r.exceptionDetails).slice(0, 200);
  return '';
}
async function waitForText(re, timeoutMs, label) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    last = await bodyText();
    if (re.test(last)) return last;
    await sleep(2000);
  }
  return last;
}
async function shot(name) {
  try {
    const r = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(EV, name), Buffer.from(r.data, 'base64'));
    console.log('  screenshot: ' + name);
  } catch (e) { console.log('  screenshot ' + name + ' failed: ' + e); }
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-live-'));
  console.log('PROFILE ' + profile);
  const proc = spawn(CHROME, [
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,900',
    'http://localhost:8081/',
  ], { stdio: 'ignore', detached: true });
  proc.unref();
  let ok = true;

  // connect to OUR target only (fresh port + fresh profile)
  let tries = 0;
  while (!ws && tries < 40) {
    await sleep(250);
    tries++;
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const tgt = list.find(t => t.type === 'page');
      if (tgt) ws = new WebSocket(tgt.webSocketDebuggerUrl);
      await sleep(300);
    } catch {}
  }
  if (!ws) { console.log('LIVE CHECK FAIL: no CDP target'); proc.kill('SIGTERM'); process.exit(1); }
  try {
    await cdpSend('Page.enable');
    await cdpSend('Runtime.enable');
    await sleep(3000);

    // --- home: real app must boot (splash hides after seed) ---
    const home = await waitForText(/Drill/i, 25000, 'home');
    const hasBank = /41/.test(home);
    // DB-seam bootstrap proof on the live server
    const seed = await evAwait(`(async () => {
      const db = globalThis.__plumberDb && (await globalThis.__plumberDb());
      if (!db || !db.getAllAsync) return 'no-seam';
      const r = await db.getAllAsync('SELECT COUNT(*) AS c FROM questions');
      return r && r[0] ? 'q=' + r[0].c : 'no-rows';
    })()`);
    const homeOk = hasBank && /^q=41$/.test(seed);
    ok = ok && homeOk;
    console.log((homeOk ? 'PASS' : 'FAIL') + ' home live on :8081 — bank ' + (hasBank ? 'shown' : 'NOT shown') + ', seed ' + seed);
    await shot('14-live-home-8081.png');

    // --- routes must render their own content on the live server ---
    const probes = [
      ['/code', /815KAR20/, '15-live-code-8081.png'],
      ['/bookmarks', /No bookmarks yet|bookmark/i, '16-live-bookmarks-8081.png'],
    ];
    for (const [route, re, file] of probes) {
      await cdpSend('Page.navigate', { url: BASE + route });
      const t = await waitForText(re, 20000, route);
      const hit = re.test(t);
      ok = ok && hit;
      console.log((hit ? 'PASS' : 'FAIL') + ' ' + route + ' rendered: ' + (hit ? 'content matched' : JSON.stringify(t.slice(0, 150))));
      await shot(file);
    }
  } catch (e) {
    ok = false;
    console.log('LIVE CHECK ERROR: ' + (e && e.stack || String(e)));
  } finally {
    try { proc.kill('SIGTERM'); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  console.log(ok ? 'LIVE CHECK: OK — server on :8081 serves a live, seeded app' : 'LIVE CHECK: FAIL');
  process.exit(ok ? 0 : 1);
}
main();
