// Dump a locked OPFS (wa-sqlite) directory's SQLite: copy main + WAL + SHM
// to a temp triplet (x, x-wal, x-shm) and query with node:sqlite. The three
// files in the OPFS dir are named 000000000/000000001/000000002 (sizes in
// the KBs). Whatever the exact roles, SQLite only recovers WAL when the
// -wal file exists, so copying all three as a named triplet is safe.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const dir = process.argv[2];
const files = fs.readdirSync(dir, { withFileTypes: true })
  .filter(e => e.isFile())
  .map(e => ({ p: path.join(dir, e.name), size: fs.statSync(path.join(dir, e.name)).size }));
if (!files.length) { console.log('no files in ' + dir); process.exit(1); }
files.sort((a, b) => b.size - a.size);
console.log('dir files: ' + files.map(f => path.basename(f.p) + '=' + f.size + 'b').join(', '));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'opfsq-'));
const tmp = path.join(out, 'x');
// largest = main db; assume siblings are -wal and -shm (SQLite's own contract
// for a checkpointed db is a lone main file, which is also fine).
fs.copyFileSync(files[0].p, tmp);
if (files.length > 1) fs.copyFileSync(files[1].p, tmp + '-wal');
if (files.length > 2) fs.copyFileSync(files[2].p, tmp + '-shm');
const head = fs.readFileSync(tmp).subarray(0, 16);
console.log('header: ' + JSON.stringify(head.toString('latin1')));
if (head.toString('latin1').slice(0, 15) !== 'SQLite format 3\0') {
  console.log('NOT a sqlite db at ' + files[0].p);
  process.exit(1);
}
const db = new DatabaseSync(tmp, { readOnly: true });
for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) console.log('table: ' + t.name);
const ss = db.prepare("SELECT id, mode, question_count, correct_count, total_time_ms, started_at, completed_at FROM study_sessions ORDER BY started_at").all();
console.log('study_sessions (' + ss.length + '):');
for (const s of ss) {
  const t = s.total_time_ms / 60000;
  console.log('  ' + s.mode + ' q=' + s.question_count + ' correct=' + s.correct_count +
    ' time=' + Math.floor(t) + 'm' + Math.round((t % 1) * 60) + 's' +
    ' started=' + s.started_at + ' completed=' + (s.completed_at || 'NULL') + ' id=' + s.id);
}
const tot = db.prepare("SELECT count(*) n, sum(is_correct) c FROM question_attempts").get();
console.log('question_attempts: total=' + tot.n + ' correct=' + tot.c);
const bySess = db.prepare("SELECT s.mode, s.question_count, s.completed_at, (SELECT count(*) FROM question_attempts a WHERE a.session_id=s.id) att, (SELECT sum(a.is_correct) FROM question_attempts a WHERE a.session_id=s.id) corr FROM study_sessions s ORDER BY s.started_at").all();
for (const r of bySess) console.log('  session ' + r.mode + ' q=' + r.question_count + ' completed=' + r.completed_at + ' attempts_in_session=' + r.att + ' correct=' + r.corr);
const blanks = db.prepare("SELECT count(*) n FROM question_attempts WHERE selected_answer=''").get();
console.log('blank (unanswered) attempts: ' + blanks.n);
try { db.close(); } catch {}
fs.rmSync(out, { recursive: true, force: true });
