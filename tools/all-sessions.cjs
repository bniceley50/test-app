// Query every chrome-auto-* / chrome-cdp* profile's OPFS blob for mock
// sessions, to find the one that actually completed 75 min with a banner.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const tmp = os.tmpdir();
const dirs = fs.readdirSync(tmp, { withFileTypes: true })
  .filter(e => e.isDirectory() && /^(chrome-auto-|chrome-cdp|chrome-e2e|chrome-probe)/.test(e.name))
  .map(e => path.join(tmp, e.name));
// locate the OPFS blob (starts with "/plumber_prep_v3") in each
function findBlob(profile) {
  const root = path.join(profile, 'Default', 'File System');
  if (!fs.existsSync(root)) return null;
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try {
          const b = fs.readFileSync(p);
          if (b.length > 1000 && b.toString('latin1', 0, 18).startsWith('/plumber_prep_v3')) out.push(p);
        } catch {}
      }
    }
  })(root);
  return out[0] || null;
}
function queryBlob(blob) {
  const buf = fs.readFileSync(blob);
  const magic = Buffer.from('SQLite format 3\0');
  const off = buf.indexOf(magic);
  if (off === -1) return 'no magic';
  const out = fs.mkdtempSync(path.join(tmp, 'q-'));
  const dbf = path.join(out, 'x.db');
  fs.writeFileSync(dbf, buf.subarray(off));
  try {
    const db = new DatabaseSync(dbf, { readOnly: true });
    const ss = db.prepare("SELECT mode, question_count, correct_count, total_time_ms/60000 m, started_at, completed_at FROM study_sessions ORDER BY started_at").all();
    const att = db.prepare("SELECT count(*) n FROM question_attempts").get();
    const blank = db.prepare("SELECT count(*) n FROM question_attempts WHERE selected_answer=''").get();
    db.close();
    return { sessions: ss, attempts: att.n, blank: blank.n };
  } catch (e) { return 'err ' + e.message; } finally { fs.rmSync(out, { recursive: true, force: true }); }
}
for (const prof of dirs) {
  const blob = findBlob(prof);
  if (!blob) continue;
  const r = queryBlob(blob);
  console.log('=== ' + path.basename(prof));
  if (typeof r === 'string') { console.log('  ' + r); continue; }
  console.log('  attempts=' + r.attempts + ' blank=' + r.blank + ' sessions=' + r.sessions.length);
  for (const s of r.sessions) console.log('    ' + s.mode + ' q=' + s.question_count + ' correct=' + s.correct_count +
    ' time=' + (s.m * 1).toFixed(1) + 'min started=' + s.started_at + ' completed=' + s.completed_at);
}
