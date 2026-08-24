// Auto-submit gate v4: start a REAL 25-Q / 75-min mock exam and wait out the
// actual countdown to zero — nothing touched. Proves the P2 locked behavior
// "auto-submit at zero" end-to-end (timer tick -> submitExam(true) -> banner)
// AND that the auto-submit wrote a completed study_sessions row in the run's
// own OPFS profile (banner without its DB row = the 2026-08-24 phantom,
// which came from a zombie Chrome holding the CDP port).
// ~78 min total. Fresh profile (empty OPFS -> first-boot seeding).
//
// v4 (2026-08-24): fresh CDP port 9233 (9231 got claimed by a killed run's
// detached Chrome and was driving a "pass" over the wrong tab), per-poll
// target-id liveness check, own-profile DB self-report as a hard pass
// requirement, and every console line teed into tools/autosub-run.log so a
// truncated job-output window can't hide the finish path.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-auto-'));
const PORT = 9233;
console.log('PROFILE ' + path.basename(profile));
const proc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=390,844',
  // keep timers honest + tab foreground-rendered, even if the window is not focused
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
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
const sleepMs = 15000;
const MAX_MINUTES = 86;
(async () => {
  // also append every line to a log file so partial job-output windows can't
  // hide the finish path
  const logLine = (s) => { try { fs.appendFileSync(path.join(__dirname, 'autosub-run.log'), s + '\n'); } catch {} };
  const _log = console.log;
  console.log = (...a) => { const s = a.join(' '); _log(s); logLine(s); };
  let wsUrl = null;
  let targetId = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = l.find(t => t.type === 'page');
      if (p) { wsUrl = p.webSocketDebuggerUrl; targetId = p.id; }
    } catch {}
    if (!wsUrl) await sleep(300);
  }
  if (!wsUrl) { console.log('AUTOSUB FAIL: no CDP target'); process.exit(1); }
  ws = new WebSocket(wsUrl);
  await new Promise(r => { ws.onopen = r; });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  const t0 = Date.now();
  const stamp = () => '[' + String(Math.round((Date.now() - t0) / 60000)) + 'm]';
  // 1) boot home (fresh profile: OPFS first-boot seeding takes a few seconds)
  await cdp('Page.navigate', { url: 'http://localhost:8081/' });
  let homeOk = false;
  for (let i = 0; i < 60 && !homeOk; i++) {
    const t = await bodyText();
    homeOk = t.includes('KY Plumber Prep');
    if (!homeOk) await sleep(3000);
  }
  if (!homeOk) { console.log('AUTOSUB FAIL: home did not render in 3 min'); process.exit(1); }
  console.log(stamp() + ' home up. my chrome pid=' + proc.pid);

  // 2) go to /mock ONCE and wait, in place, for the 25-Q card to render
  await evRaw(`window.location.href = '/mock'`);
  await sleep(6000);
  let cardSeen = false;
  for (let i = 0; i < 40 && !cardSeen; i++) {
    const t = await bodyText();
    if (t.includes('25 questions')) { cardSeen = true; break; }
    if (/\b1 \/ 25\b/.test(t)) { console.log(stamp() + ' exam already started?!'); break; }
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
    if (!started) console.log(stamp() + ' start attempt ' + attempt + ': ' + tapRes + ' | ' + t.slice(0, 80).replace(/\n/g, ' | '));
  }
  if (!started) { console.log('AUTOSUB FAIL: exam did not start'); process.exit(1); }
  const q1Seed = (await bodyText()).slice(0, 120);
  console.log(stamp() + ' exam started: 1/25, 75-min countdown, Q1: ' + q1Seed.replace(/\n/g, ' | ').slice(0, 90));

  // 3) wait with full observability: log every countdown-minute change + URL
  //    drift + tab disappearance, so a v1-style surprise is impossible.
  let final = '';
  let lastCd = '';
  const deadline = Date.now() + MAX_MINUTES * 60000;
  let polls = 0;
  while (Date.now() < deadline) {
    polls++;
    let urlNow = '';
    let tabAlive = true;
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = list.find(x => x.id === targetId);
      if (!p) tabAlive = false; else urlNow = p.url;
    } catch { tabAlive = false; urlNow = 'cdp-unreachable'; }
    final = await bodyText();
    const m = final.match(/\b(\d{1,2}:\d{2})\b/);
    const cd = tabAlive && m ? m[1] : ('tab-' + (tabAlive ? 'no-countdown' : urlNow));
    if (cd !== lastCd || urlNow.indexOf('/mock') === -1) {
      console.log(stamp() + ' url=' + urlNow + ' | countdown=' + cd + ' | head=' + final.split('\n')[0].slice(0, 55).replace(/\n/g, ' '));
      lastCd = cd;
      if (!tabAlive && urlNow !== 'cdp-unreachable') { console.log(stamp() + ' !! CDP TARGET DISAPPEARED'); break; }
    }
    if (/Time expired/.test(final) && /\/ 25 correct/.test(final)) break;
    await sleep(sleepMs);
  }
  const ok = /Time expired/.test(final) && /\/ 25 correct/.test(final);
  const score = final.match(/(\d+) \/ (\d+) correct/);
  const elapsed = final.match(/(\d+ min \d+ sec|(\d{1,3}):(\d{2}) (?:\d+ of .* · )?elapsed|\d{1,3}:\d{2} elapsed)/);
  console.log(stamp() + ' final head: ' + final.slice(0, 220).replace(/\n/g, ' | '));
  if (ok) {
    console.log(stamp() + ' score: ' + (score ? score[1] + '/' + score[2] + ' correct' : 'n/a') + (elapsed ? ' · elapsed ' + elapsed[0] : ''));
    try {
      const r = await cdp('Page.captureScreenshot', { format: 'png' });
      const file = path.join(__dirname, '..', 'tasks', 'evidence', '12-mock-autosubmit.png');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log('screenshot: 12-mock-autosubmit.png');
    } catch (e) { console.log('screenshot failed: ' + e); }
  }
  const totalMin = Math.round((Date.now() - t0) / 60000);
  const dbReport = [];
  let dbOk = false;
  // DB self-report: find our own OPFS blob and dump the run's mock sessions +
  // attempts so the profile is ground truth. Hard requirement: exactly ONE
  // mock_exam session started during this run, completed, with elapsed time
  // in the expected ~75-min window (auto-submit fires at endTsRef).
  try {
    const os2 = require('os');
    const path2 = require('path');
    const root = path2.join(profile, 'Default', 'File System');
    let blob = null;
    (function walk(d) {
      if (!fs.existsSync(d) || blob) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path2.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (fs.statSync(p).size > 1000 && fs.readFileSync(p).toString('latin1', 0, 18).startsWith('/plumber_prep_v3')) blob = p;
      }
    })(root);
    if (blob) {
      const { DatabaseSync } = require('node:sqlite');
      const buf = fs.readFileSync(blob);
      const off = buf.indexOf(Buffer.from('SQLite format 3\0'));
      if (off < 0) { dbReport.push('  no SQLite magic in blob'); }
      const tdir = fs.mkdtempSync(path2.join(os2.tmpdir(), 'q-'));
      const dbf = path2.join(tdir, 'x.db');
      fs.writeFileSync(dbf, buf.subarray(off));
      const db = new DatabaseSync(dbf, { readOnly: true });
      const all = db.prepare("SELECT mode, question_count, correct_count, total_time_ms, started_at, completed_at FROM study_sessions ORDER BY started_at").all();
      const rows = all.filter(s => !s.started_at || Date.parse(s.started_at) >= t0 - 5 * 60000);
      const mocks = rows.filter(s => s.mode === 'mock_exam');
      let att = 'n/a';
      try { att = JSON.stringify(db.prepare("SELECT count(*) n, sum(is_correct) c FROM question_attempts WHERE session_id IN (SELECT id FROM study_sessions WHERE started_at > datetime('now','-3 hours'))").get()); } catch (e2) { att = 'err ' + e2.message; }
      dbOk = mocks.length === 1
        && mocks[0].completed_at != null
        && (mocks[0].total_time_ms || 0) >= 44 * 60000
        && (mocks[0].total_time_ms || 0) <= 80 * 60000;
      console.log('DB self-report: mock_sessions_in_run=' + mocks.length + ' dbOk=' + dbOk + ' | attempts(this run): ' + att);
      for (const s of rows) dbReport.push('  session: ' + s.mode + ' q=' + s.question_count + ' correct=' + s.correct_count
        + ' time=' + ((s.total_time_ms || 0) / 60000).toFixed(1) + 'min completed=' + s.completed_at);
      if (rows.length === 0) dbReport.push('  note: no study_sessions rows newer than run start in this profile');
      db.close();
      fs.rmSync(tdir, { recursive: true, force: true });
    } else {
      console.log('DB self-report: no OPFS blob found for this profile');
      dbReport.push('  (no OPFS blob — cannot verify session)');
    }
  } catch (e) { console.log('DB self-report err: ' + (e && e.message)); }
  const finalOk = ok && dbOk;
  console.log((finalOk ? 'AUTOSUB PASS' : 'AUTOSUB FAIL') + ' — run ' + totalMin + ' min, ' + polls + ' polls, profile ' + path.basename(profile));
  for (const line of dbReport) console.log(line);
  if (ok && !dbOk) console.log('  (banner on screen but DB does not back it up — see session rows above)');
  try { proc.kill('SIGTERM'); } catch {}
  process.exit(finalOk ? 0 : 1);
})().catch(e => { console.log('AUTOSUB crashed:', e.stack || String(e)); process.exit(2); });
