// Step 2 of 2 (after scripts/thai-words.py): keep the dictionary words a browser splits into pieces, alone or where they
// stand in a line, so src/core/thai.ts can hold them together: เศร้าหมอง never breaks as เศร้า|หมอง, nor กวี as เป็นก|วี.
// -> public/data/thai-words.json
// Each engine has its own Thai dictionary (Chrome's ICU, Firefox's, WebKit's), so a word any of them splits is kept:
// Firefox breaks ผีเสื้อ as ผี|เสื้อ where Chrome does not.
import { readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import * as pw from 'playwright';
import { rolldown } from 'rolldown';

register('./ts-hooks.mjs', import.meta.url); // the app imports without extensions
const { words, chunks } = JSON.parse(readFileSync('work/thai-candidates.json', 'utf8'));
// two to five pieces (more usually means a phrase, not a word); a split right after a nominalising prefix
// (การ|กระทำ) is already held by a rule in src/core/thai.ts
const PREFIX = /^(การ|ความ|ผู้|นัก)$/;
const splits = (pieces) => pieces.length >= 2 && pieces.length <= 5 && !(pieces.length === 2 && PREFIX.test(pieces[0]));
const piecesOf = (list) => { const seg = new Intl.Segmenter('th', { granularity: 'word' }); return list.map((w) => [...seg.segment(w)].map((x) => x.segment)); };

// In a line: the app's own typesetter (names held, its rules applied, no word list yet) sets each chunk, and a dictionary
// word it would still break inside is kept (เป็นก|วี, จา|กอะ|ไร, รู้|สึก). Three letters at least: the list is held
// wherever a word occurs, and a two-letter one would also match across two words (the นท of คน|ทำ).
const lib = (await (await rolldown({ input: 'src/core/thai.ts', logLevel: 'silent' })).generate({ format: 'iife', name: 'TH' })).output[0].code;
const { HELD } = await import('../src/content/names.ts');
const authors = JSON.parse(readFileSync('public/data/authors.json', 'utf8'));
const names = Object.values(authors).flatMap((a) => a.th.split(/\s+/));
const cutInside = ({ chunks, names, held }) => {
  TH.protect(names); TH.protect(held, true);
  const out = [];
  for (const [chunk, toks] of chunks) {
    const cuts = new Set();
    let at = 0;
    for (const w of TH.wordsOf(chunk).slice(0, -1)) cuts.add((at += w.replaceAll('\u2060', '').length));
    at = 0;
    for (const [w, known] of toks) {
      if (known && w.length >= 3 && /^[ก-๛]+$/.test(w)) for (let k = at + 1; k < at + w.length; k++) if (cuts.has(k)) { out.push(w); break; }
      at += w.length;
    }
  }
  return out;
};

const keep = new Set(), by = {};
const note = (engine, all) => { by[engine] = 0; all.forEach((p, i) => { if (splits(p)) { by[engine]++; keep.add(words[i]); } }); };
const inLines = (engine, list) => { by[`${engine} in lines`] = new Set(list).size; list.forEach((w) => keep.add(w)); };
note('node', piecesOf(words));
globalThis.TH = await import('../src/core/thai.ts');
inLines('node', cutInside({ chunks, names, held: HELD }));
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const b = await pw[engine].launch();
  const page = await b.newPage();
  note(engine, await page.evaluate(`(${piecesOf})(${JSON.stringify(words)})`));
  await page.addScriptTag({ content: lib });
  inLines(engine, await page.evaluate(cutInside, { chunks, names, held: HELD }));
  await b.close();
}
const out = [...keep].sort();
writeFileSync('public/data/thai-words.json', JSON.stringify(out));
console.log(`${words.length} dictionary words; split by ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}; ${out.length} kept -> public/data/thai-words.json (${Buffer.byteLength(JSON.stringify(out))} bytes)`);
