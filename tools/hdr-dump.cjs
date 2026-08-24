// Print ASCII + first 16 bytes of each file in the OPFS dir, using share read.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
for (const name of fs.readdirSync(dir).sort()) {
  const p = path.join(dir, name);
  let fd;
  try { fd = fs.openSync(p, 'r'); } catch (e) { console.log(name + ': ' + e.code); continue; }
  const st = fs.fstatSync(fd);
  const b = Buffer.alloc(Math.min(16, st.size));
  fs.readSync(fd, b, 0, b.length, 0);
  fs.closeSync(fd);
  let ascii = '';
  for (const x of b) ascii += (x >= 32 && x < 127) ? String.fromCharCode(x) : '.';
  console.log(name + ' ' + st.size + 'b :: "' + ascii + '"');
}
