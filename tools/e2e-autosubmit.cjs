// Auto-submit gate: start a REAL 25-Q / 75-min mock exam and wait out the
// actual countdown to zero — nothing touched. Proves the P2 locked behavior
// "auto-submit at zero" end-to-end (timer tick -> submitExam(true) -> banner).
// ~78 min total. Fresh profile (empty OPFS -> first-boot seeding).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-auto-'));
const PORT = 9231;
const proc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=390,844',
], { stdio: 'ignore', detached: true });
proc.unref();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, seq = { n: 0 };
function cdp(method, params) {
  return new Promise((resolve) => {
    const id = seq.n++;
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) { ws.removeEventListener('message', onMsg); resolve(msg.result || {}); }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function bodyText() {
  const r = await cdp('Runtime.evaluate', { expression: '(document.body && document.body.innerText) || ""', returnByValue: true });
  if (r.result && typeof r.result.value === 'string') return r.result.value;
  return '';
}
async function evRaw(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true });
  if (r.result && typeof r.result.value === 'string') return r.result.value;
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.text;
  return '';
}
// same tap helpers as tools/e2e-chrome.cjs (RN-web needs the full per-node
// pointer/mouse event chain; pointerup is what RN-web hit-tests)
const HELP_SRC = `(function(){
  if (typeof window.__tap === 'function') return 'have';
  const FULL = (el) => {
    const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', Object.assign(opts, { pointerType: 'touch' })));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', Object.assign(opts, { pointerType: 'touch' })));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  };
  window.__tap = (needle, climb) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; const nodes = [];
    while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.includes(needle)) nodes.push(n);
    if (!nodes.length) return 'nomatch';
    let el = nodes[0].parentElement;
    const chain = [el];
    for (let i = 0; i < (climb || 0) && el.parentElement; i++) { el = el.parentElement; chain.push(el); }
    const hit = [];
    for (const t of chain) { FULL(t); hit.push(t.tagName); }
    return 'tapped ' + hit.join('->');
  };
  return 'defined';
})()`;
const sleepMs = 20000;
const MAX_MINUTES = 83;
(async () => {
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = (await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()); const p = l.find(t => t.type === 'page'); if (p) wsUrl = p.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(300);
  }
  if (!wsUrl) { console.log('AUTOSUB FAIL: no CDP target'); process.exit(1); }
  ws = new WebSocket(wsUrl);
  await new Promise(r => { ws.onopen = r; });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  const t0 = Date.now();
  // 1) boot home (fresh profile: OPFS first-boot seeding takes a few seconds)
  await cdp('Page.navigate', { url: 'http://localhost:8081/' });
  let homeOk = false;
  for (let i = 0; i < 60 && !homeOk; i++) {
    const t = await bodyText();
    homeOk = t.includes('KY Plumber Prep');
    if (!homeOk) await sleep(3000);
  }
  if (!homeOk) { console.log('AUTOSUB FAIL: home did not render in 3 min'); process.exit(1); }
  console.log('home up (fresh profile, seeded) in ' + Math.round((Date.now() - t0) / 1000) + 's');

  // 2) go to /mock ONCE and wait, in place, for the 25-Q card to render
  await evRaw(`window.location.href = '/mock'`);
  await sleep(6000); // let the card mount (DB queries run on mount)
  let cardSeen = false;
  for (let i = 0; i < 40 && !cardSeen; i++) {
    const t = await bodyText();
    if (t.includes('25 questions')) { cardSeen = true; break; }
    if (/\b1 \/ 25\b/.test(t)) { console.log('exam already started?! ' + t.slice(0, 80)); break; }
    await sleep(3000);
  }
  if (!cardSeen) { console.log('AUTOSUB FAIL: 25-Q card never rendered: ' + (await bodyText()).slice(0, 120).replace(/\n/g, ' | ')); process.exit(1); }
  await evRaw(HELP_SRC);
  let started = false;
  for (let attempt = 0; attempt < 6 && !started; attempt++) {
    const tapRes = await evRaw(`window.__tap('25 questions', 3)`);
    await sleep(2500);
    const t = await bodyText();
    started = /\b1 \/ 25\b/.test(t) && /\b7[45]:\d{2}\b/.test(t);
    if (!started) console.log('start attempt ' + attempt + ': ' + tapRes + ' | ' + t.slice(0, 100).replace(/\n/g, ' | '));
  }
  if (!started) { console.log('AUTOSUB FAIL: exam did not start'); process.exit(1); }
  console.log('exam started: 1/25, 75-min countdown running — waiting it out (no touches)');

  // 3) wait for the countdown to hit zero and auto-submit to land on results.
  //     Countdown state lives in React (not the URL), so a real 75-min expiry
  //     can only happen in this one long-lived page: no reloads allowed.
  let final = '';
  let lastMin = -1;
  const deadline = Date.now() + MAX_MINUTES * 60000;
  while (Date.now() < deadline) {
    final = await bodyText();
    const m = final.match(/\b(\d+):(\d{2})\b/);
    const curMin = m ? Number(m[1]) : -1;
    if (curMin !== lastMin) { lastMin = curMin; if (curMin % 10 === 0 || curMin < 5) console.log('  ... countdown ' + (m ? m[0] : '?')); }
    if (/Time expired/.test(final) && /\/ 25 correct/.test(final)) break;
    await sleep(sleepMs);
  }
  const ok = /Time expired/.test(final) && /\/ 25 correct/.test(final);
  const score = final.match(/(\d+) \/ (\d+) correct/);
  const elapsed = final.match(/(\d+ min \d+ sec|[0-9]{1,3}:\d{2}) elapsed/);
  console.log('final: ' + final.slice(0, 160).replace(/\n/g, ' | '));
  if (ok) {
    console.log('score: ' + (score ? score[1] + '/' + score[2] + ' correct' : 'n/a') + (elapsed ? ' · elapsed ' + elapsed[1] : ''));
    try {
      const r = await cdp('Page.captureScreenshot', { format: 'png' });
      const file = path.join(__dirname, '..', 'tasks', 'evidence', '12-mock-autosubmit.png');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log('screenshot: 12-mock-autosubmit.png');
    } catch (e) { console.log('screenshot failed: ' + e); }
  }
  const totalMin = Math.round((Date.now() - t0) / 60000);
  console.log((ok ? 'AUTOSUB PASS' : 'AUTOSUB FAIL') + ' — auto-submit after real countdown (run ' + totalMin + ' min)');
  try { proc.kill('SIGTERM'); } catch {}
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('AUTOSUB crashed:', e.stack || String(e)); process.exit(2); });
