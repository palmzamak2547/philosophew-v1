// Step 2 of 2 (after scripts/thai-words.py): keep the dictionary words a browser splits into pieces, so
// src/core/thai.ts can hold them together: เศร้าหมอง never breaks as เศร้า|หมอง.  -> public/data/thai-words.json
// Each engine has its own Thai dictionary (Chrome's ICU, Firefox's, WebKit's), so a word any of them splits is kept:
// Firefox breaks ผีเสื้อ as ผี|เสื้อ where Chrome does not.
import { readFileSync, writeFileSync } from 'node:fs';
import * as pw from 'playwright';

const words = JSON.parse(readFileSync('work/thai-candidates.json', 'utf8'));
// two to five pieces (more usually means a phrase, not a word); a split right after a nominalising prefix
// (การ|กระทำ) is already held by a rule in src/core/thai.ts
const PREFIX = /^(การ|ความ|ผู้|นัก)$/;
const splits = (pieces) => pieces.length >= 2 && pieces.length <= 5 && !(pieces.length === 2 && PREFIX.test(pieces[0]));
const piecesOf = (list) => { const seg = new Intl.Segmenter('th', { granularity: 'word' }); return list.map((w) => [...seg.segment(w)].map((x) => x.segment)); };

const keep = new Set(), by = {};
const note = (engine, all) => { by[engine] = 0; all.forEach((p, i) => { if (splits(p)) { by[engine]++; keep.add(words[i]); } }); };
note('node', piecesOf(words));
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const b = await pw[engine].launch();
  const page = await b.newPage();
  note(engine, await page.evaluate(`(${piecesOf})(${JSON.stringify(words)})`));
  await b.close();
}
const out = [...keep].sort();
writeFileSync('public/data/thai-words.json', JSON.stringify(out));
console.log(`${words.length} dictionary words; split by ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}; ${out.length} kept -> public/data/thai-words.json (${Buffer.byteLength(JSON.stringify(out))} bytes)`);
