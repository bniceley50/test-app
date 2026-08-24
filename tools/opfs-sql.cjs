// Find "SQLite format 3\0" inside the wa-sqlite OPFS flat file, report offset,
// and copy from there to a temp .db so node:sqlite can open it.
const fs = require('fs');
const path = require('path');
const p = process.argv[2];
const buf = fs.readFileSync(p);
const magic = Buffer.from('SQLite format 3\0');
let off = buf.indexOf(magic);
console.log('sqlite magic at offset: ' + off + ' (file ' + buf.length + 'b)');
let tries = 0;
while (off !== -1 && tries < 3) {
  const out = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sq-'));
  const dbf = path.join(out, 'x.db');
  fs.writeFileSync(dbf, buf.subarray(off));
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbf, { readOnly: true });
    const ss = db.prepare("SELECT mode, question_count, correct_count, total_time_ms, started_at, completed_at FROM study_sessions ORDER BY started_at").all();
    console.log('\nstudy_sessions (' + ss.length + '):');
    for (const s of ss) {
      const t = s.total_time_ms / 60000;
      console.log('  ' + s.mode + ' q=' + s.question_count + ' correct=' + s.correct_count +
        ' time=' + t.toFixed(1) + 'm started=' + s.started_at + ' done=' + (s.completed_at || 'NULL'));
    }
    const tot = db.prepare("SELECT count(*) n, sum(is_correct) c FROM question_attempts").get();
    console.log('attempts total=' + tot.n + ' correct=' + tot.c);
    const blank = db.prepare("SELECT count(*) n FROM question_attempts WHERE selected_answer=''").get();
    console.log('blank (unanswered) attempts = ' + blank.n);
    db.close();
    fs.rmSync(out, { recursive: true, force: true });
    process.exit(0);
  } catch (e) { console.log('  open/query err at off ' + off + ': ' + e.message); }
  off = buf.indexOf(magic, off + 16);
  tries++;
}
if (off === -1) console.log('no sqlite magic found');
