// Invisible characters in source (no-break space, word joiner, zero-width space, bidi marks, C1 controls) become
// visible escapes: \u00a0 reads the same to the engine and cannot be mistaken for a plain space by a person.
//   node scripts/escape-invisibles.mjs [--check]     (--check: list them and fail, change nothing)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const INVISIBLE = /[\u00a0\u2060\u200b\u200c\u200d\u200e\u200f\ufeff\u0080-\u009f]/g;
const check = process.argv.includes('--check');
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|mjs|js|css)$/.test(f)) files.push(p); } };
walk('src'); walk('scripts');
let n = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const hits = s.match(INVISIBLE);
  if (!hits) continue;
  n += hits.length;
  if (check) { console.log(`${f}: ${hits.length}`); continue; }
  writeFileSync(f, s.replace(INVISIBLE, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
  console.log(`${f}: ${hits.length} escaped`);
}
console.log(n ? `${n} invisible characters ${check ? 'found' : 'escaped'}` : 'no invisible characters');
if (check && n) process.exit(1);
