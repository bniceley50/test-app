// Dump the autosub profile's OPFS (wa-sqlite) SQLite to see if the 75-min
// auto-submit exam actually completed in THIS profile's lifetime.
const fs = require('fs');
const path = require('path');
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const base = process.argv[2];
const files = walk(base, []).filter(f => /IndexedDB|Local Storage/i.test(f) || /\.sqlite$/.test(f));
console.log('candidate db-ish files:');
for (const f of files.slice(0, 30)) console.log('  ' + f + '  (' + fs.statSync(f).size + 'b)');
// wa-sqlite stores OPFS per origin, look for files with .wa-sqlite or opfs
const all = walk(base, []).filter(f => /opfs|wa-sqlite|minifsql/i.test(f));
for (const f of all.slice(0, 20)) console.log('OPFS: ' + f + ' (' + fs.statSync(f).size + 'b)');
