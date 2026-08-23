/**
 * Data-layer smoke test — runs the EXACT schema + deck queries from
 * lib/database.ts against the real seed JSON using Node's built-in SQLite
 * (node:sqlite), so the P2/P3 logic is verified without a phone.
 *
 * Usage: node tools/db-smoke.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { answerMatches } from '../lib/normalize.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, 'tools', 'smoke-plumber.db');

let failures = 0;
function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

// --- Reopen a clean DB with the same schema lib/database.ts creates ---
for (const suffix of ['', '-wal', '-shm']) {
  const p = dbPath + suffix;
  if (existsSync(p)) unlinkSync(p);
}
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY, prompt TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'mcq',
    choices TEXT NOT NULL DEFAULT '[]', answer TEXT NOT NULL,
    explanation TEXT NOT NULL DEFAULT '', foreman_explanation TEXT NOT NULL DEFAULT '',
    code_section TEXT NOT NULL DEFAULT '', topic TEXT NOT NULL DEFAULT '',
    difficulty INTEGER NOT NULL DEFAULT 2, tags TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT '', verified INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS question_attempts (
    id TEXT PRIMARY KEY, question_id TEXT NOT NULL, selected_answer TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0, response_time_ms INTEGER NOT NULL DEFAULT 0,
    session_id TEXT NOT NULL, attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );
  CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY, mode TEXT NOT NULL, topic_filter TEXT,
    question_count INTEGER NOT NULL DEFAULT 0, correct_count INTEGER NOT NULL DEFAULT 0,
    total_time_ms INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS user_progress (
    question_id TEXT PRIMARY KEY, times_seen INTEGER NOT NULL DEFAULT 0,
    times_correct INTEGER NOT NULL DEFAULT 0, accuracy REAL NOT NULL DEFAULT 0,
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    next_review TEXT NOT NULL DEFAULT (datetime('now')),
    confidence_level INTEGER NOT NULL DEFAULT 0, bookmarked INTEGER NOT NULL DEFAULT 0,
    missed_active INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );
  CREATE TABLE IF NOT EXISTS code_sections (
    id TEXT PRIMARY KEY, section TEXT NOT NULL, title TEXT NOT NULL,
    short_summary TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, question_id TEXT NOT NULL DEFAULT '',
    code_section_id TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(kind, question_id, code_section_id)
  );
  CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_kind ON bookmarks(kind);
`);

// --- Seed with the REAL data ---
const questions = JSON.parse(readFileSync(join(root, 'data', 'questions.seed.json'), 'utf8'));
const codeSections = JSON.parse(readFileSync(join(root, 'data', 'code_sections.seed.json'), 'utf8'));

const insQ = db.prepare(`INSERT OR IGNORE INTO questions
  (id, prompt, type, choices, answer, explanation, foreman_explanation, code_section, topic, difficulty, tags, source, verified)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const q of questions) {
  insQ.run(q.id, q.prompt, q.type, JSON.stringify(q.choices), q.answer, q.explanation,
    q.foreman_explanation || '', q.code_section, q.topic, q.difficulty,
    JSON.stringify(q.tags || []), q.source, q.verified ? 1 : 0);
}
const insC = db.prepare('INSERT OR IGNORE INTO code_sections (id, section, title, short_summary, keywords) VALUES (?, ?, ?, ?, ?)');
for (const s of codeSections) {
  insC.run(s.id, s.section, s.title, s.short_summary, JSON.stringify(s.keywords || []));
}
check('seed: 41 verified questions in DB',
  db.prepare('SELECT COUNT(*) as n FROM questions WHERE verified = 1').get().n === 41);
check('seed: 12 code sections in DB',
  db.prepare('SELECT COUNT(*) as n FROM code_sections').get().n === 12);

// --- Query replicas from lib/database.ts ---
function getDeckWithDue(count, topic) {
  const topicClause = topic ? 'AND q.topic = ?' : '';
  const dueParams = topic ? [topic, count] : [count];
  const dueRows = db.prepare(`
    SELECT q.* FROM questions q
    INNER JOIN user_progress p ON q.id = p.question_id
    WHERE q.verified = 1 ${topicClause} AND p.next_review <= datetime('now')
    ORDER BY p.next_review ASC, p.times_correct ASC, p.accuracy ASC
    LIMIT ?`).all(...dueParams);
  const due = dueRows;
  const restExcl = due.map(q => q.id);
  const notIn = restExcl.length ? `AND id NOT IN (${restExcl.map(() => '?').join(',')})` : '';
  const restParams = [...restExcl, ...(topic ? [topic] : []), Math.max(0, count - due.length)];
  const restRows = db.prepare(`
    SELECT * FROM questions
    WHERE verified = 1 ${notIn} ${topic ? 'AND topic = ?' : ''}
    ORDER BY RANDOM() LIMIT ?`).all(...restParams);
  return [...due, ...restRows];
}

function recordAttempt(qid, selected, isCorrect, sessionId) {
  db.prepare(`INSERT INTO question_attempts
    (id, question_id, selected_answer, is_correct, response_time_ms, session_id, attempted_at)
    VALUES (?, ?, ?, ?, 1000, ?, datetime('now'))`)
    .run('att-' + qid + '-' + Math.random().toString(36).slice(2), qid, selected, isCorrect ? 1 : 0, sessionId);
  const isCorrectInt = isCorrect ? 1 : 0;
  db.prepare(`
    INSERT INTO user_progress (question_id, times_seen, times_correct, accuracy, last_seen, next_review, confidence_level, bookmarked, missed_active)
    VALUES (?, 1, ?, ?, datetime('now'), datetime('now', '+1 day'), 0, 0, ?)
    ON CONFLICT(question_id) DO UPDATE SET
      times_seen = times_seen + 1,
      times_correct = times_correct + ?,
      accuracy = CAST((times_correct + ?) AS REAL) / (times_seen + 1),
      last_seen = datetime('now'),
      next_review = CASE
        WHEN ? = 1 THEN datetime('now', '+' || MIN(CAST(POWER(2, times_correct) AS INTEGER), 30) || ' days')
        ELSE datetime('now', '+1 day')
      END,
      missed_active = CASE WHEN ? = 0 THEN 1 ELSE missed_active END`)
    .run(qid, isCorrectInt, isCorrect ? 1.0 : 0.0, isCorrect ? 0 : 1, isCorrectInt, isCorrectInt, isCorrectInt, isCorrectInt);
}

// --- A. Fresh bank: due deck is just 10 random verified, no dupes ---
{
  const deck = getDeckWithDue(10, null);
  check('deck(fresh): returns 10 unique questions', deck.length === 10
    && new Set(deck.map(q => q.id)).size === 10);
}

// --- B. Topic deck: only venting, capped at available ---
{
  const available = db.prepare(`SELECT COUNT(*) as n FROM questions WHERE topic = 'venting' AND verified = 1`).get().n;
  const deck = getDeckWithDue(10, 'venting');
  check(`deck(topic=venting): all venting, ${deck.length}/${available} available`,
    deck.length > 0 && deck.every(q => q.topic === 'venting') && deck.length <= available);
}

// --- C. recordAttempt writes spaced-rep + missed flags ---
{
  const q = db.prepare(`SELECT id, answer FROM questions WHERE verified = 1 AND type='mcq' LIMIT 4`).all();
  const [c1, c2, w1, w2] = q;
  const sid = 's-smoke';
  db.prepare(`INSERT INTO study_sessions (id, mode, topic_filter, question_count, correct_count, total_time_ms, started_at)
              VALUES (?, 'smoke', NULL, 4, 0, 0, datetime('now'))`).run(sid);
  recordAttempt(c1.id, c1.answer, true, sid);   // correct twice
  recordAttempt(c1.id, c1.answer, true, sid);
  recordAttempt(c2.id, c2.answer, true, sid);   // correct once
  recordAttempt(w1.id, 'wrong-X', false, sid);  // wrong -> missed_active
  recordAttempt(w2.id, 'wrong-Y', false, sid);

  const c1row = db.prepare('SELECT times_correct, next_review, missed_active FROM user_progress WHERE question_id = ?').get(c1.id);
  check('progress: c1 times_correct=2, no missed flag',
    c1row.times_correct === 2 && c1row.missed_active === 0);
  const w1row = db.prepare('SELECT missed_active, accuracy FROM user_progress WHERE question_id = ?').get(w1.id);
  // first-ever wrong answer on a fresh row: insert stores 0/1 -> accuracy 0, missed_active 1
  check('progress: wrong answer sets missed_active=1, accuracy 0 (0 of 1)',
    w1row.missed_active === 1 && w1row.accuracy === 0);
  // all next_reviews are future (+1d / +4d) -> nothing due yet today
  const dueToday = db.prepare(`SELECT COUNT(*) as n FROM user_progress WHERE next_review <= datetime('now')`).get().n;
  check('spaced-rep: fresh attempts are NOT due today', dueToday === 0);

  // Simulate "yesterday's" misses becoming due today
  db.prepare(`UPDATE user_progress SET next_review = datetime('now', '-1 day') WHERE question_id IN (?, ?)`).run(w1.id, w2.id);
  const deck = getDeckWithDue(10, null);
  const dueIds = deck.slice(0, 2).map(q2 => q2.id).sort();
  check('due-queue: the 2 overdue questions lead the deck',
    JSON.stringify(dueIds) === JSON.stringify([w1.id, w2.id].sort()));
  const unique = new Set(deck.map(q2 => q2.id)).size === deck.length && deck.length === 10;
  check('due-queue: no duplicate questions, full deck length', unique);
}

// --- D. Bookmarks table behavior (NULL-safe via '' sentinels) ---
{
  const q = db.prepare(`SELECT id FROM questions LIMIT 1`).get();
  const s = db.prepare(`SELECT id FROM code_sections LIMIT 1`).get();
  // toggle on
  let exists = db.prepare(`SELECT COUNT(*) as n FROM bookmarks WHERE kind='question' AND question_id=? AND code_section_id=''`).get(q.id).n;
  if (!exists) db.prepare(`INSERT INTO bookmarks (id, kind, question_id, code_section_id, note) VALUES (?,?,?,?,'')`)
    .run('bm1', 'question', q.id, '');
  exists = db.prepare(`SELECT COUNT(*) as n FROM bookmarks WHERE kind='question' AND question_id=? AND code_section_id=''`).get(q.id).n;
  check('bookmarks: question toggle adds row', exists === 1);
  db.prepare(`DELETE FROM bookmarks WHERE id='bm1'`).run();
  check('bookmarks: question toggle removes row',
    db.prepare(`SELECT COUNT(*) as n FROM bookmarks WHERE kind='question' AND question_id=?`).get(q.id).n === 0);
  db.prepare(`INSERT INTO bookmarks (id, kind, question_id, code_section_id, note) VALUES ('bm2','code_section','','','x')`)
    .run();
  db.prepare(`INSERT INTO bookmarks (id, kind, question_id, code_section_id, note) VALUES ('bm3','code_section','',?,'')`).run(s.id);
  const dups = db.prepare(`SELECT COUNT(*) as n FROM bookmarks WHERE kind='code_section' AND code_section_id=?`).get(s.id).n;
  check('bookmarks: duplicate section bookmark prevented by UNIQUE', dups === 1);
  db.prepare(`UPDATE bookmarks SET note='re-check' WHERE id='bm3'`).run();
  check('bookmarks: setBookmarkNote persists',
    db.prepare(`SELECT note FROM bookmarks WHERE id='bm3'`).get().note === 're-check');
  db.prepare(`DELETE FROM bookmarks WHERE id IN ('bm2','bm3')`).run();
}

// --- E. Counts + search ---
{
  const counts = db.prepare(`SELECT code_section, COUNT(*) as n FROM questions
    WHERE verified = 1 AND code_section != '' GROUP BY code_section`).all();
  check('counts: 815KAR20:090 has 12 linked questions',
    counts.find(c => c.code_section === '815KAR20:090')?.n === 12);
  const found = db.prepare(`SELECT COUNT(*) as n FROM code_sections WHERE section LIKE '%090%' OR title LIKE '%090%' OR short_summary LIKE '%090%' OR keywords LIKE '%090%'`).get().n;
  check('search: "090" matches at least one section', found >= 1);
  const qs = db.prepare(`SELECT COUNT(*) as n FROM questions WHERE code_section='815KAR20:090'`).get().n;
  check('section->questions: 12 rows for 815KAR20:090', qs === 12);
}

// --- F. Normalize matching ---
{
  check('normalize: "1/2" matches "0.5"', answerMatches('1/2', '0.5'));
  check('normalize: case + whitespace normalized', answerMatches('Half inch', '  half   INCH '));
  check('normalize: wrong value rejected', !answerMatches('1/2', '3/4'));
  check('normalize: blank rejected', !answerMatches('1/2', '  '));
  check('normalize: unit mismatch is NOT auto-equal', !answerMatches('1/2 inch', '0.5'));
  check('normalize: (alt) notation accepted', answerMatches('1/2 (4) in', '1/2 in'));
}

// --- G. Heat-grid SQL sanity: every one of the 13 seeded topics appears ---
{
  const topics = db.prepare('SELECT DISTINCT topic FROM questions WHERE verified=1 ORDER BY topic').all().map(r => r.topic);
  check('heat-grid: 13 distinct seeded topics', topics.length === 13);
}

console.log(failures === 0 ? '\nALL SMOKE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
