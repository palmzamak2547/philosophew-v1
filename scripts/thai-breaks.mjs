// A report, not a check: every place the app's typesetter lets a Thai line or gloss break beside a piece no dictionary
// knows, in each browser (c chromium, f firefox, w webkit). A name split there (โก|โดต์) belongs in src/content/names.ts.
// Most rows are fine: a break after a whole name (กามู|เขียน), or one the dictionary is missing (ไม่มี|ใคร).
//   python scripts/thai-words.py (writes work/thai-dict.json) && node scripts/thai-words.mjs && node scripts/thai-breaks.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import * as pw from 'playwright';
import { rolldown } from 'rolldown';

register('./ts-hooks.mjs', import.meta.url); // the app imports without extensions
const { HELD } = await import('../src/content/names.ts');
const lib = (await (await rolldown({ input: 'src/core/thai.ts', logLevel: 'silent' })).generate({ format: 'iife', name: 'TH' })).output[0].code;
const dict = JSON.parse(readFileSync('work/thai-dict.json', 'utf8'));
const words = JSON.parse(readFileSync('public/data/thai-words.json', 'utf8'));
const names = Object.values(JSON.parse(readFileSync('public/data/authors.json', 'utf8'))).flatMap((a) => a.th.split(/\s+/));
const texts = [];
for (const f of readdirSync('public/data/quotes'))
  for (const q of JSON.parse(readFileSync(`public/data/quotes/${f}`, 'utf8'))) for (const t of [q.th, q.gloss?.th]) if (t) texts.push([q.id, t]);

const census = ({ texts, names, held, words, dict }) => {
  TH.protect(names); TH.protect(held, true); TH.protectWords(words);
  const D = new Set(dict), J = '\u2060', out = {};
  for (const [id, text] of texts) for (const chunk of text.split(/\s+/)) {
    const ws = TH.wordsOf(chunk);
    for (let i = 0; i < ws.length - 1; i++) {
      const l = ws[i].split(J).pop(), r = ws[i + 1].split(J)[0];
      if (!/[ก-๛]$/.test(l) || !/^[ก-๛]/.test(r) || (D.has(l) && D.has(r))) continue;
      out[ws.slice(Math.max(0, i - 1), i + 1).join('').replaceAll(J, '') + '|' + ws.slice(i + 1, i + 3).join('').replaceAll(J, '')] = id;
    }
  }
  return out;
};
const all = {};
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const b = await pw[engine].launch();
  const page = await b.newPage();
  await page.addScriptTag({ content: lib });
  for (const [ctx, id] of Object.entries(await page.evaluate(census, { texts, names, held: HELD, words, dict }))) (all[ctx] ||= { id, e: [] }).e.push(engine[0]);
  await b.close();
}
const rows = Object.entries(all).map(([ctx, { id, e }]) => `${e.join('')}\t${id}\t${ctx}`).sort();
console.log(rows.join('\n'));
console.error(`${rows.length} breaks beside a piece no dictionary knows, in ${texts.length} lines and glosses`);
