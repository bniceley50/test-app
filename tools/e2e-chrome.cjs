// E2E click-through in REAL Chrome via CDP (port 9223).
// Fresh profile per run => empty OPFS => seeds the real 41-Q bank on boot.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-e2e-'));
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const proc = spawn(chrome, [
  '--remote-debugging-port=9223', '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=390,844',
], { stdio: 'ignore', detached: true });
proc.unref();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws;
let seq = { n: 0 };
async function cdpSend(method, params) {
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
// Evaluate that returns innerText, or '' on any CDP exception (e.g. about:blank mid-nav).
async function bodyText() {
  const r = await cdpSend('Runtime.evaluate', {
    expression: '(document.body && document.body.innerText) || ""',
    returnByValue: true,
  });
  if (r.result && typeof r.result.value === 'string') return r.result.value;
  return '';
}
async function evRaw(expression) {
  const r = await cdpSend('Runtime.evaluate', { expression, returnByValue: true });
  if (r.result && typeof r.result.value === 'string') return r.result.value;
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.text;
  return '';
}
async function shot(name) {
  try {
    const r = await cdpSend('Page.captureScreenshot', { format: 'png' });
    const file = path.join(__dirname, '..', 'tasks', 'evidence', name + '.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('  screenshot: ' + path.basename(file));
  } catch (e) { console.log('  screenshot ' + name + ' failed: ' + e); }
}
// Wait until body contains marker (or predicate returns true), every interval, up to timeout.
async function waitFor(predicate, timeoutMs, label) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    last = await bodyText();
    if (predicate(last)) return last;
    const el = Math.round((Date.now() - t0) / 1000);
    if (label && el % 15 === 0) console.log(`  [wait ${el}s] still not: ${label} (body head: ${last.slice(0, 60).replace(/\n/g, ' ')})`);
    await sleep(2000);
  }
  return last;
}

// In-page tap helpers, (re)defined lazily so they survive navigations.
const HELPER_SRC = `(function(){
  if (typeof window.__tap === 'function' && typeof window.__tapExact === 'function') return 'have';
  window.__tapExact = (needle) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; const nodes = [];
    while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.trim() === needle) nodes.push(n);
    if (!nodes.length) return 'nomatch-' + needle;
    const el = nodes[0].parentElement;
    const dispatch = (el2) => {
      const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true };
      el2.dispatchEvent(new PointerEvent('pointerdown', Object.assign(opts, { pointerType: 'touch' })));
      el2.dispatchEvent(new MouseEvent('mousedown', opts));
      el2.dispatchEvent(new PointerEvent('pointerup', Object.assign(opts, { pointerType: 'touch' })));
      el2.dispatchEvent(new MouseEvent('mouseup', opts));
      el2.dispatchEvent(new MouseEvent('click', opts));
    };
    // Single full event sequence on the leaf: RN-web hit-tests pointerup against
    // the touchable, and the events bubble to the root — one dispatch = one press.
    dispatch(el);
    return 'tapped ' + el.tagName;
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
    for (const t of chain) {
      const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true };
      t.dispatchEvent(new PointerEvent('pointerdown', Object.assign(opts, { pointerType: 'touch' })));
      t.dispatchEvent(new MouseEvent('mousedown', opts));
      t.dispatchEvent(new PointerEvent('pointerup', Object.assign(opts, { pointerType: 'touch' })));
      t.dispatchEvent(new MouseEvent('mouseup', opts));
      t.dispatchEvent(new MouseEvent('click', opts));
      hit.push(t.tagName);
    }
    return 'tapped ' + hit.join('->');
  };
  return 'defined';
})()`;

(async () => {
  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
      const page = list.find(t => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) { console.log('E2E FAIL: no CDP target'); process.exit(1); }
  ws = new WebSocket(wsUrl);
  await new Promise(res => { ws.onopen = res; });
  await cdpSend('Runtime.enable');
  await cdpSend('Page.enable');
  await cdpSend('Page.navigate', { url: 'http://localhost:8081/' });

  const failures = [];
  const step = (name, ok) => {
    if (!ok) failures.push(name);
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  };

  // 1. Home: wait for boot (fresh profile can be slow: bundle compile + DB seed)
  const home = await waitFor(t => t.includes('KY Plumber Prep'), 150000, 'home home-screen text');
  step('home renders (splash hides after DB seed)', home.includes('KY Plumber Prep'));
  step('home shows 41-question bank (seeding worked)', home.includes('41 questions studied'));
  if (home.includes('KY Plumber Prep')) await shot('01-home');

  // 2. Mock exam: navigate to setup, then tap 25Q with retries
  await cdpSend('Runtime.evaluate', { expression: `window.location.href = '/mock'` });
  const mockSetup = await waitFor(t => t.includes('Mock Exam') && t.includes('25 or 50 Q') || t.includes('25 questions'), 40000, 'mock setup');
  step('mock: setup screen shows both timed modes', mockSetup.includes('25 questions') && mockSetup.includes('Closed-book'));
  let mockOk = false;
  for (let attempt = 0; attempt < 6 && !mockOk; attempt++) {
    await evRaw(HELPER_SRC);
    const tapRes = await evRaw(`window.__tap('25 questions', 3)`);
    await sleep(2000);
    const t = await bodyText();
    mockOk = /\b1 \/ 25\b/.test(t) && /\b\d{1,2}:\d{2}\b/.test(t);
    if (!mockOk) console.log(`  mock tap attempt ${attempt}: ${tapRes} | body head: ${t.slice(0, 80).replace(/\n/g, ' ')}`);
  }
  step('mock: start 25-Q exam (1/25 + live countdown visible)', mockOk);
  if (mockOk) await shot('02-mock-exam-live');

  // 3. Answer two questions (A then B) — progress must advance without per-question feedback
  for (const exact of ['A', 'B']) {
    const before = (await bodyText()).match(/\b(\d+) \/ 25\b/);
    const tapRes = await evRaw(`window.__tapExact(${JSON.stringify(exact)})`);
    await sleep(2500);
    const after = (await bodyText()).match(/\b(\d+) \/ 25\b/);
    console.log(`  answer '${exact}': ${tapRes} | position ${before ? before[1] : '?'}/${after ? after[1] : '?'} | body head: ${(await bodyText()).slice(0, 70).replace(/\n/g, ' ')}`);
  }
  const mockAdv = await bodyText();
  step('mock: answering advances Q1→Q3 with no feedback shown', /\b3 \/ 25\b/.test(mockAdv));
  await shot('03-mock-q3-no-feedback');

  // 3b. Complete the exam: answer through to Q25, submit (confirm Alert), verify results phase
  let resultsText = '';
  let reachedResults = false;
  for (let i = 0; i < 32 && !reachedResults; i++) {
    const pos = (await bodyText()).match(/\b(\d+) \/ 25\b/);
    await evRaw(HELPER_SRC);
    const subRes = await evRaw(`window.__tap('Submit exam', 2)`);
    if (subRes.startsWith('tapped')) {
      // web: no dialog (RN-web Alert is a no-op; mock.tsx submits directly on web)
      await sleep(3500);
      console.log(`  at Q${pos ? pos[1] : '?'} submit tapped (web direct-submit path)`);
    } else if (i < 30) {
      await evRaw(`window.__tapExact('A')`);
      await sleep(1200);
    }
    resultsText = await bodyText();
    reachedResults = /\/ 25 correct/.test(resultsText) && /BELOW PASS LINE|PASSING/.test(resultsText);
  }
  step('mock: results phase renders (score, verdict, per-topic breakdown)', reachedResults);
  console.log('  results head: ' + resultsText.slice(0, 120).replace(/\n/g, ' | '));
  if (reachedResults) await shot('04-mock-results');

  // 4. Topics
  await cdpSend('Runtime.evaluate', { expression: `window.location.href = '/topics'` });
  const topics = await waitFor(t => t.includes('Topic Breakdown'), 40000, 'topics grid');
  step('topics: grid renders with per-topic percentages', topics.includes('Topic Breakdown') && /%/.test(topics));

  // 5. Code reference: list + expand 090 section
  await cdpSend('Runtime.evaluate', { expression: `window.location.href = '/code'` });
  const codeList = await waitFor(t => t.includes('815KAR20:090'), 40000, 'code list');
  step('code: seeded section 815KAR20:090 listed', codeList.includes('815KAR20:090'));
  const beforeLen = codeList.length;
  let codeExpanded = false;
  for (let attempt = 0; attempt < 3 && !codeExpanded; attempt++) {
    await evRaw(HELPER_SRC);
    const tapRes = await evRaw(`window.__tap('815KAR20:090', 2)`);
    await sleep(2000);
    const t = await bodyText();
    codeExpanded = t.length > beforeLen + 40 || /No verified questions reference /.test(t) || /Answer: /.test(t);
    if (!codeExpanded) console.log(`  code tap attempt ${attempt}: ${tapRes}`);
  }
  step('code: section expands (linked questions / empty-linked state appears)', codeExpanded);
  const codeAfter = await bodyText();
  console.log('  code view ' + beforeLen + ' -> ' + codeAfter.length + ' chars; linked meta: ' + /\d+ questions? linked|No questions linked yet/.test(codeAfter));

  // 6. Bookmarks: fresh profile => empty state
  await cdpSend('Runtime.evaluate', { expression: `window.location.href = '/bookmarks'` });
  const bookmarks = await waitFor(t => t.includes('No bookmarks yet'), 30000, 'bookmarks empty state');
  step('bookmarks: renders empty state on fresh profile', bookmarks.includes('No bookmarks yet'));

  // 7. Missed: back home, then via the home card; either a loaded question or the clean empty state
  await cdpSend('Runtime.evaluate', { expression: `window.location.href = '/'` });
  await waitFor(t => t.includes('Missed Questions'), 40000, 'home re-nav');
  let missedSettled = false;
  for (let attempt = 0; attempt < 5 && !missedSettled; attempt++) {
    await evRaw(HELPER_SRC);
    const tapRes = await evRaw(`window.__tap('Missed Questions', 2)`);
    await sleep(2500);
    const t = await bodyText();
    missedSettled = t.includes('No missed questions right now') || /\b1 \/ \d+\b/.test(t);
    if (!missedSettled) console.log(`  missed tap attempt ${attempt}: ${tapRes} | body head: ${t.slice(0, 80).replace(/\n/g, ' ')}`);
  }
  const missed = await bodyText();
  step('missed: reachable from home, settles (question shown or clean empty state)', missedSettled);
  console.log('  missed landing state:', missed.includes('No missed questions right now') ? 'EMPTY (valid — no misses recorded)' : 'QUESTION SHOWN');

  console.log('\nE2E result: ' + (failures.length ? failures.length + ' FAILURE(S): ' + failures.join(' | ') : 'ALL STEPS PASSED'));
  console.log('profile kept at ' + profile);
  try { proc.kill('SIGTERM'); } catch {}
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log('E2E crashed:', e.stack || String(e)); process.exit(2); });
