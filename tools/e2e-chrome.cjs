// E2E click-through in REAL Chrome via CDP (port 9223).
// Fresh profile per run => empty OPFS => seeds the real 41-Q bank on boot.
// Gates: boot/seed, mock full cycle, drill full cycle + bookmark+note,
// persistence across reload, missed, topics, code. Screenshots in tasks/evidence/.
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
async function nav(route) {
  await cdpSend('Runtime.evaluate', { expression: `window.location.href = ${JSON.stringify(route)}` });
  await waitFor(t => t.length > 0, 30000, 'page to respond after nav');
  await evRaw(HELPER_SRC);
}
// evaluate a tap helper expression, re-injecting helpers first (survives full page loads)
async function tap(expr) {
  await evRaw(HELPER_SRC);
  return evRaw(expr);
}
// like evRaw, but awaits returned promises (for in-page async DB calls via the test seam)
async function evAwait(expression) {
  const r = await cdpSend('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result && typeof r.result.value === 'string') return r.result.value;
  if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.text;
  return '';
}
async function waitFor(predicate, timeoutMs, label) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    last = await bodyText();
    if (predicate(last)) return last;
    await sleep(2000);
  }
  return last;
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

// In-page tap helpers, (re)defined lazily so they survive navigations.
const HELPER_SRC = `(function(){
  if (typeof window.__tap === 'function' && typeof window.__tapExact === 'function' && typeof window.__focusInput === 'function' && typeof window.__blurActive === 'function') return 'have';
  const FULL = (el) => {
    const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', Object.assign(opts, { pointerType: 'touch' })));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', Object.assign(opts, { pointerType: 'touch' })));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  };
  window.__tapExact = (needle) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; const nodes = [];
    while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.trim() === needle) nodes.push(n);
    if (!nodes.length) return 'nomatch-' + needle;
    const el = nodes[0].parentElement;
    FULL(el);
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
    for (const t of chain) { FULL(t); hit.push(t.tagName); }
    return 'tapped ' + hit.join('->');
  };
  // Focus the first input/textarea whose placeholder matches. Typing itself is done
  // from the CDP side via Input.insertText (React-controlled TextInput needs a
  // browser-level insertion; dispatching synthetic 'input' events does NOT reach it).
  window.__focusInput = (placeholderPart) => {
    const inp = document.querySelector('input[placeholder*="' + placeholderPart + '"], textarea[placeholder*="' + placeholderPart + '"]');
    if (!inp) return 'noinput';
    inp.focus();
    return 'focused ' + inp.tagName;
  };
  window.__blurActive = () => {
    const a = document.activeElement;
    if (a && a !== document.body) { a.blur(); return 'blurred ' + a.tagName; }
    return 'nothing-focused';
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

  // 1. Home: boot + seed
  const home1 = await waitFor(t => t.includes('KY Plumber Prep'), 150000, 'home');
  step('home renders (splash hides after DB seed)', home1.includes('KY Plumber Prep'));
  step('home shows 41-question bank (seeding worked)', home1.includes('41 questions studied'));
  if (home1.includes('KY Plumber Prep')) await shot('01-home');

  // 2. Mock exam full cycle
  await nav('/mock');
  await evRaw(HELPER_SRC);
  const mockSetup = await waitFor(t => t.includes('25 questions') && t.includes('Closed-book'), 40000, 'mock setup');
  step('mock: setup screen shows both timed modes', mockSetup.includes('25 questions'));
  let mockOk = false;
  for (let attempt = 0; attempt < 6 && !mockOk; attempt++) {
    const tapRes = await tap(`window.__tap('25 questions', 3)`);
    await sleep(2000);
    const t = await bodyText();
    mockOk = /\b1 \/ 25\b/.test(t) && /\b\d{1,2}:\d{2}\b/.test(t);
    if (!mockOk) console.log(`  mock tap attempt ${attempt}: ${tapRes}`);
  }
  step('mock: start 25-Q exam (1/25 + live countdown visible)', mockOk);
  if (mockOk) await shot('02-mock-exam-live');
  for (const exact of ['A', 'B']) {
    await tap(`window.__tapExact(${JSON.stringify(exact)})`);
    await sleep(2200);
  }
  const mockAdv = await bodyText();
  step('mock: answering advances Q1→Q3 with no feedback shown', /\b3 \/ 25\b/.test(mockAdv));
  await shot('03-mock-q3-no-feedback');

  let resultsText = '';
  let reachedResults = false;
  for (let i = 0; i < 33 && !reachedResults; i++) {
    const pos = (await bodyText()).match(/\b(\d+) \/ 25\b/);
    const subRes = await tap(`window.__tap('Submit exam', 2)`);
    if (subRes.startsWith('tapped')) {
      await sleep(3500); // web: direct submit (RN-web Alert no-op), no dialog
    } else if (pos ? pos[1] !== '25' : true) {
      await tap(`window.__tapExact('A')`);
      await sleep(1100);
    }
    resultsText = await bodyText();
    reachedResults = /\/ 25 correct/.test(resultsText) && /BELOW PASS LINE|PASSING/.test(resultsText);
  }
  step('mock: results phase renders (score, verdict, per-topic breakdown)', reachedResults);
  console.log('  results head: ' + resultsText.slice(0, 110).replace(/\n/g, ' | '));
  if (reachedResults) await shot('04-mock-results');

  // 2b. Locked time-scaling behavior: with the 41-question bank, the 50-Q mode
  //     must draw 41 questions and start a 123:00 countdown (3 min/Q), and the
  //     setup screen states the scaling plainly. (startExam: minutes =
  //     min(mode.minutes, round(drawn * mode.minutes / mode.count)).)
  await nav('/mock');
  const setup2 = await waitFor(t => t.includes('50 questions'), 40000, 'mock setup (50Q)');
  step('mock: setup states the scaled exam (41 Q / 123 min) for the 50-Q mode',
    setup2.includes('41 Q / 123 min'));
  let scaledOk = false;
  for (let attempt = 0; attempt < 6 && !scaledOk; attempt++) {
    const tapRes = await tap(`window.__tap('50 questions', 3)`);
    await sleep(2500);
    const t = await bodyText();
    // A scaled 123-minute countdown reads 122:5x seconds after start — anything
    // 122–123 proves scaling (a full 150-min exam would read 149:xx).
    scaledOk = /\b1 \/ 41\b/.test(t) && /\b12[23]:\d{2}\b/.test(t) && t.includes('0 answered');
    if (!scaledOk) console.log(`  50Q start attempt ${attempt}: ${tapRes}`);
  }
  step('mock: 50-Q mode starts scaled — 41 questions drawn, 123:00 countdown, 0 answered', scaledOk);
  if (scaledOk) await shot('08-mock-50q-123min');

  // 3. Home reflects mock activity
  await nav('/');
  const home2 = await waitFor(t => t.includes('KY Plumber Prep'), 60000, 'home post-mock');
  step('home stats reflect mock attempt (studied > 0, missed count updated)',
    /\b[1-9]\d* \/ 41 questions studied/.test(home2) && /to review/.test(home2));

  // 4. Bookmarks: empty state on fresh profile (before we add any)
  await nav('/bookmarks');
  const bookmarksEmpty = await waitFor(t => t.includes('No bookmarks yet'), 30000, 'bookmarks empty');
  step('bookmarks: renders empty state on fresh profile', bookmarksEmpty.includes('No bookmarks yet'));

  // 5. Drill: full 10-question cycle, with a bookmark + note on Q1's explanation card
  await nav('/drill');
  const drill0 = await waitFor(t => /\b1 \/ 10\b/.test(t), 40000, 'drill 1/10');
  step('drill: deck loads (1/10 progress header)', /\b1 \/ 10\b/.test(drill0));
  await tap(`window.__tapExact('A')`); // answer Q1
  await sleep(2500);
  let d1 = await bodyText();
  step('drill: answering shows result banner + explanation', d1.includes('Correct!') || d1.includes('Wrong'));
  const bmTap = await tap(`window.__tap('Bookmark for later', 1)`);
  await sleep(1800);
  d1 = await bodyText();
  step('drill: bookmark star saves to bookmarks (label flips to Bookmarked)', d1.includes('Bookmarked'));
  if (!d1.includes('Bookmarked')) console.log('  bookmark tap: ' + bmTap + ' | body: ' + d1.slice(0, 160).replace(/\n/g, ' | '));
  await tap(`window.__tapExact('Next Question')`);
  await sleep(1600);
  for (let i = 2; i <= 10; i++) {
    await tap(`window.__tapExact('A')`);
    await sleep(2000);
    if (i === 10) {
      await tap(`window.__tapExact('See Results')`);
      await sleep(3500);
    } else {
      await tap(`window.__tapExact('Next Question')`);
      await sleep(1500);
    }
  }
  const drillResults = await bodyText();
  step('drill: completes 10 Q to Results (score + verdict)',
    /\b\d+ \/ 10\b/.test(drillResults) && (drillResults.includes('Passing Score!') || drillResults.includes('Keep Drilling')));
  console.log('  drill results head: ' + drillResults.slice(0, 100).replace(/\n/g, ' | '));
  await shot('05-drill-results');

  // 5b. Spaced-rep (locked P3): the due queue must LEAD the deck.
  //     Fresh profiles have no due rows (first answer sets next_review = +1d),
  //     so use the documented test seam (lib/database.ts __plumberDb) to
  //     backdate exactly one drilled question's next_review by 7 days, then
  //     re-enter Drill and assert it is served first.
  const dueSettled = await evAwait(`(async () => {
    const db = globalThis.__plumberDb;
    if (!db) return 'no-seam';
    const row = await db.getFirstAsync('SELECT p.question_id, q.prompt, q.topic FROM user_progress p JOIN questions q ON q.id = p.question_id WHERE q.verified = 1 ORDER BY p.question_id ASC LIMIT 1');
    if (!row) return 'no-progress-rows';
    await db.runAsync("UPDATE user_progress SET next_review = datetime('now', '-7 days') WHERE question_id = ?", row.question_id);
    return JSON.stringify({ prompt: row.prompt, topic: row.topic });
  })()`);
  let dueInfo = null;
  try { dueInfo = JSON.parse(dueSettled); } catch (e) {}
  const dueLedDeck = !!(dueInfo && dueInfo.prompt);
  const duePredText = dueInfo ? dueInfo.prompt.slice(0, 40) : dueSettled;
  console.log('  due backdate: ' + (duePredText ? duePredText.replace(/\n/g, ' ') : '(none)'));

  let dueGate = false;
  if (dueInfo) {
    const dueTopicBadge = String(dueInfo.topic).replace(/_/g, ' ').toUpperCase();
    await nav('/drill');
    const dueDrill = await waitFor(t => /\b1 \/ \d+\b/.test(t), 40000, 'due-led drill');
    dueGate = typeof dueInfo.prompt === 'string' && dueDrill.includes(dueInfo.prompt.slice(0, 40))
      && dueDrill.toUpperCase().includes(dueTopicBadge.split(' ')[0]);
  }
  step('due-queue: backdated (7-day-overdue) question is served FIRST in the Drill deck', dueGate);
  await shot('09-due-queue-led');

  // 6. Bookmarks: entry exists, expand, save a note
  await nav('/bookmarks');
  let bmList = await waitFor(t => t.includes('QUESTION') || t.includes('No bookmarks yet'), 30000, 'bookmarks list');
  step('bookmarks: drilled-question bookmark listed', bmList.includes('QUESTION') && !bmList.includes('No bookmarks yet'));
  // climb=2 puts the pressable cardHead last in the tap chain => odd number of
  // press sequences => exactly one toggle (RN-web hit-tests every bubbled press).
  let expandedOk = false;
  for (let attempt = 0; attempt < 3 && !expandedOk; attempt++) {
    const tapRes = await tap(`window.__tap('QUESTION', 2)`);
    await sleep(1800);
    bmList = await bodyText();
    expandedOk = bmList.includes('Remove bookmark') || bmList.includes('Drill this topic');
    if (!expandedOk) console.log('  bookmark expand attempt ' + attempt + ': ' + tapRes + ' | body: ' + bmList.slice(0, 120).replace(/\n/g, ' '));
  }
  step('bookmarks: entry expands (actions + note field appear)', expandedOk);
  // focus the field, type via CDP browser-level insertion (React-controlled
  // TextInput ignores synthetic 'input' events), let it settle, then blur
  const focused = await tap(`window.__focusInput('Add a note')`);
  await sleep(800);
  await cdpSend('Input.insertText', { text: 'e2e persistence check' });
  const typedVal = await evRaw(`(function(){ const f = document.querySelector('textarea[placeholder*="Add a note"], input[placeholder*="Add a note"]'); return f && f.value ? 'dom=' + f.value : 'empty'; })()`);
  const blurred = await tap(`window.__blurActive()`);
  await sleep(2200); // onBlur -> saveNote -> re-render with the 📝 hint
  bmList = await bodyText();
  step('bookmarks: note saved (note hint appears after blur)',
    focused.includes('focused') && typedVal.startsWith('dom=') && blurred.includes('blurred') && bmList.includes('📝'));
  console.log('  note: focus=' + focused + ' | typed=' + typedVal + ' | blur=' + blurred + ' | saved: ' + bmList.includes('📝'));
  await shot('06-bookmarks-note');

  // 7. Persistence across a full app reload (web equivalent of the airplane relaunch)
  await cdpSend('Page.reload');
  // after reload we're on /bookmarks; go home to check the persisted study stats
  await cdpSend('Runtime.evaluate', { expression: `window.location.href = '/'` });
  const home3 = await waitFor(t => t.includes('KY Plumber Prep'), 120000, 'home after reload');
  step('reload: app reboots cleanly (splash hides again)', home3.includes('KY Plumber Prep'));
  step('reload: study stats persisted in SQLite (studied still > 0)', /\b[1-9]\d* \/ 41 questions studied/.test(home3));
  await nav('/bookmarks');
  let bm2 = await waitFor(t => t.includes('QUESTION') || t.includes('No bookmarks yet'), 30000, 'bookmarks after reload');
  step('reload: bookmark + note persisted', !bm2.includes('No bookmarks yet') && bm2.includes('📝'));
  await shot('07-bookmarks-persisted');

  // 8. Missed: via home card
  await nav('/');
  await waitFor(t => t.includes('Missed Questions'), 60000, 'home for missed');
  let missedSettled = false;
  for (let attempt = 0; attempt < 5 && !missedSettled; attempt++) {
    await evRaw(HELPER_SRC);
    const tapRes = await tap(`window.__tap('Missed Questions', 2)`);
    await sleep(2500);
    const t = await bodyText();
    missedSettled = t.includes('No missed questions right now') || /\b1 \/ \d+\b/.test(t);
    if (!missedSettled) console.log(`  missed tap attempt ${attempt}: ${tapRes}`);
  }
  const missed = await bodyText();
  step('missed: reachable from home, settles with reviewed questions', missed.includes('No missed questions right now') || /\b1 \/ \d+\b/.test(missed));
  console.log('  missed landing state:', missed.includes('No missed questions right now') ? 'EMPTY' : 'QUESTION SHOWN');

  // 9. Topics
  await nav('/topics');
  const topics = await waitFor(t => t.includes('Topic Breakdown'), 40000, 'topics');
  step('topics: grid renders with per-topic percentages', topics.includes('Topic Breakdown') && /%/.test(topics));

  // 9b. Topics → tap a topic → topic-FILTERED drill deck (topic param flows through)
  //     The topic slug is law_licensing; the card Text renders "Law Licensing"
  //     (pretty/title case) and the drill badge uppercases it to "LAW LICENSING".
  const topicsTapRes = await tap(`window.__tap('Licensing', 1)`);
  const topicDrill = await waitFor(t => /LAW LICENSING/.test(t) && /\b1 \/ \d+\b/.test(t), 30000, 'topic drill');
  step('topics: tapping a topic opens a topic-filtered drill deck (badge + 1/N progress)',
    /LAW LICENSING/.test(topicDrill) && /\b1 \/ \d+\b/.test(topicDrill));
  console.log('  topic drill: ' + ((topicDrill.match(/\b1 \/ \d+/) || ['no-progress'])[0]) + ' | tap: ' + topicsTapRes);

  // 10. Code reference: list + expand 090
  await nav('/code');
  const codeList = await waitFor(t => t.includes('815KAR20:090'), 40000, 'code list');
  step('code: seeded section 815KAR20:090 listed', codeList.includes('815KAR20:090'));
  const beforeLen = codeList.length;
  let codeExpanded = false;
  for (let attempt = 0; attempt < 3 && !codeExpanded; attempt++) {
    const tapRes = await tap(`window.__tap('815KAR20:090', 2)`);
    await sleep(2000);
    const t = await bodyText();
    codeExpanded = t.length > beforeLen + 40 || /No verified questions reference /.test(t) || /Answer: /.test(t);
    if (!codeExpanded) console.log(`  code tap attempt ${attempt}: ${tapRes}`);
  }
  step('code: section expands (linked questions / empty-linked state appears)', codeExpanded);

  // 10b. Code search: typing filters the list (250ms debounce in code.tsx).
  //     "storm" matches only section 20:130 (title/keyword); 090 + 070 must drop out.
  //     RN-web controlled TextInput needs CDP Input.insertText (lesson 12).
  await evRaw(HELPER_SRC);
  await tap(`window.__focusInput('Search section')`);
  await sleep(600);
  const codeBefore = await bodyText();
  const hadAll = codeBefore.includes('815KAR20:090') && codeBefore.includes('815KAR20:070');
  await cdpSend('Input.insertText', { text: 'storm' });
  await sleep(1500); // debounce + reload
  const codeAfter = await bodyText();
  const afterShows043 = codeAfter.includes('815KAR20:130');
  const afterDropped090 = !codeAfter.includes('815KAR20:090');
  const afterDropped070 = !codeAfter.includes('815KAR20:070');
  step('code: search filters list to matching sections (storm → only 20:130, others drop out)',
    hadAll && afterShows043 && afterDropped090 && afterDropped070);
  console.log('  code search: hadAllList=' + hadAll + ' | after "storm": 043-shown=' + afterShows043 + ', 090-gone=' + afterDropped090 + ', 070-gone=' + afterDropped070);

  console.log('\nE2E result: ' + (failures.length ? failures.length + ' FAILURE(S): ' + failures.join(' | ') : 'ALL STEPS PASSED'));
  console.log('profile kept at ' + profile);
  try { proc.kill('SIGTERM'); } catch {}
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log('E2E crashed:', e.stack || String(e)); process.exit(2); });
