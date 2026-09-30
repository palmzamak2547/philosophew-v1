// node scripts/check-lamp.mjs -> fails loudly if the lamp's day rules regress (oil, rekindle, milestones).
import assert from 'node:assert/strict';
import { register } from 'node:module';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
register('./ts-hooks.mjs', import.meta.url); // the app imports without extensions
const { lightLamp, shiftDay, pickResurface } = await import('../src/core/game.ts');

const fresh = () => ({ day: '', streak: 0, best: 0, reflectToday: 0, sharedToday: 0, flames: 0, xp: 0, milestones: [], oil: 0, lit: 0, litDays: [], rekindle: null });
const D = (n) => shiftDay('2026-10-01', n);

assert.equal(shiftDay('2026-03-01', -1), '2026-02-28', 'calendar math');

// seven days in a row: a drop of oil on the 7th lamp, streak milestones at 3 and 7
let s = fresh();
const got = [];
for (let i = 0; i < 7; i++) got.push(lightLamp(s, D(i)));
assert.equal(s.streak, 7);
assert.equal(s.lit, 7);
assert.equal(s.oil, 1, 'oil on the 7th lamp');
assert.deepEqual(got.filter((r) => r.milestone).map((r) => r.milestone.n), [3, 7]);
assert.equal(lightLamp(s, D(6)), null, 'same day twice does nothing');

// miss one day with oil: the run continues and the missed day is marked
const r1 = lightLamp(s, D(8));
assert.equal(r1.oilUsed, 1);
assert.equal(r1.broken, false);
assert.equal(s.streak, 8);
assert.equal(s.oil, 0);
assert.ok(s.litDays.includes(D(7) + '*'), 'oil day marked');

// miss one day without oil: the lamp restarts, a rekindle is offered for today only
const r2 = lightLamp(s, D(10));
assert.equal(r2.broken, true);
assert.equal(r2.rekindleFrom, 8);
assert.equal(s.streak, 1);
assert.deepEqual(s.rekindle, { prev: 8, day: D(10) });

// away for a week: welcome back, no rekindle, the total never shrinks
const litBefore = s.lit;
const r3 = lightLamp(s, D(18));
assert.equal(r3.away, 7);
assert.equal(r3.rekindleFrom, 0);
assert.equal(s.rekindle, null, 'an old offer expires');
assert.equal(s.lit, litBefore + 1);

// the 10th lamp ever is celebrated even though the run is short
s = fresh();
let tenth = null;
for (let i = 0; i < 10; i++) { const r = lightLamp(s, D(i * 3)); if (i === 9) tenth = r; }
assert.deepEqual(tenth.milestone, { kind: 'lit', n: 10 });

// the notebook brings back a line kept exactly 7 days ago before anything older
const now = Date.UTC(2026, 9, 10, 12);
const n = (daysAgo, text = '', shownAt) => ({ quoteId: 'q' + daysAgo, text, savedAt: now - daysAgo * 86400000, shownAt });
assert.equal(pickResurface([n(3, 'a'), n(7), n(40, 'b')], now).ago, 7, 'exact anniversaries first');
assert.equal(pickResurface([n(3, 'a'), n(40, 'b', now - 86400000)], now).note.quoteId, 'q3', 'skips one shown yesterday');
assert.equal(pickResurface([n(0, 'today')], now), null, 'nothing old enough');

console.log('lamp and notebook: all checks passed');

// a backup or a save can never brick the app: clean() keeps what is valid and defaults the rest
const { clean, readBackup } = await import('../src/core/store.ts');
const broken = clean({ v: 1, xp: 10, notes: null, seen: null, settings: null, litDays: 'x', oil: 9, rite: 3 });
assert.deepEqual([broken.notes, broken.seen, broken.litDays, broken.oil, broken.rite, broken.xp], [{}, {}, [], 2, null, 10], 'nulls and junk become defaults');
assert.equal(typeof broken.settings.sound, 'boolean', 'settings rebuilt');
const good = { ...clean({}), xp: 900, day: '2026-09-28', streak: 5, best: 7, lit: 20, litDays: ['2026-09-27', '2026-09-28*'], oil: 1,
  notes: { q1: { quoteId: 'q1', school: 'stoic', author: 'epictetus', text: 'hi', savedAt: 1, updatedAt: 2, finish: 'gold', rewarded: true } },
  seen: { q1: 2 }, finish: { q1: 'gold' }, rite: { day: '2026-09-28', read: true, keep: false, done: false } };
assert.deepEqual(clean(JSON.parse(JSON.stringify(good))), good, 'a valid state survives unchanged');
assert.equal(Object.keys(clean({ notes: { a: { quoteId: 'a', school: 'nope', author: 'x' } } }).notes).length, 0, 'a note from no school is dropped');
assert.throws(() => readBackup('{"v":2,"xp":1}'), /bad-file/, 'another version is refused');
assert.throws(() => readBackup('not json'), /bad-file/, 'not a backup');
console.log('saves and backups: all checks passed');

// display typography: typewriter marks become typeset ones
const { smart } = await import('../src/core/typo.ts');
assert.equal(smart(`What saith thy conscience?—"Thou shalt become what thou art."`), 'What saith thy conscience?—“Thou shalt become what thou art.”', 'double quotes open after a dash');
assert.equal(smart(`The wrestler's art, don't wish it back...`), 'The wrestler’s art, don’t wish it back…', 'apostrophes and ellipsis');
assert.equal(smart(`He said 'wait' -- then left`), 'He said ‘wait’ — then left', 'single quotes and a dash');
assert.equal(smart('the dam\u0092s \u0093name\u0094 ﬂying'), 'the dam’s “name” flying', 'cp1252 controls and ligatures repaired');
assert.equal(smart('ข้อความไทย "ในเครื่องหมาย"'), 'ข้อความไทย “ในเครื่องหมาย”', 'Thai text too');
console.log('typography: all checks passed');
assert.equal(smart('gamā dhammā'), 'gamā dhammā', 'combining marks composed (NFC)');
console.log('composition: all checks passed');

// line breaks: initials keep their name, a label keeps its number (no-break spaces written into the text)
const { setThai } = await import('../src/core/thai.ts');
assert.equal(setThai('trans. W. D. Ross'), 'trans. W.\u00a0D.\u00a0Ross', 'initials stay with the surname');
assert.equal(setThai('G. W. F. Hegel'), 'G.\u00a0W.\u00a0F.\u00a0Hegel', 'a run of initials');
assert.equal(setThai('Best: 14'), 'Best:\u00a014', 'a label keeps its number');
assert.equal(setThai('Plato. And then'), 'Plato. And then', 'a sentence end is not an initial');
console.log('line breaks: all checks passed');
assert.equal(setThai('Simone de Beauvoir'), 'Simone de\u00a0Beauvoir', 'a particle stays with the surname');
assert.equal(setThai('ซีมอน เดอ โบวัวร์').replace(/\u2060/g, ''), 'ซีมอน เดอ\u00a0โบวัวร์', 'a Thai particle too');
const { phrases } = await import('../src/core/thai.ts');
const text = (hs) => hs.map(String).join('').replace(/<[^>]+>|\u2060/g, '');
assert.equal(text(phrases('clarity is a courtesy owed to the terminology.')), 'clarity is a courtesy owed to the\u00a0terminology.', 'the last word keeps its neighbour');
assert.equal(text(phrases('Jean-Paul Sartre')), 'Jean-Paul Sartre', 'two words can still part');
assert.equal(text(phrases('Diogenes of Sinope')), 'Diogenes of\u00a0Sinope', 'of + name');
console.log('particles and last words: all checks passed');

// where an engine ignores word joiners, only the joined words are held, never the loose text around them
const { runs } = await import('../src/core/thai.ts');
const J = '\u2060';
for (const v of [`เมื่อต้องการ${J}เอง`, `ก่อน ของ${J}ตัว${J}เอง แล้ว`, 'ไม่มีตัวเชื่อม']) {
  const r = runs(v);
  assert.equal(r.map(([x]) => x).join(''), v, 'runs cover the text exactly');
  assert.ok(r.every(([x, held]) => held === x.includes(J)), 'held runs are exactly the joined ones');
  assert.ok(r.filter(([, held]) => held).every(([x]) => !/s/.test(x) && x.replace(new RegExp(J, 'g'), '').length <= 12), 'a held run is only the joined words');
}
console.log('joined runs: all checks passed');

// a block's last word keeps its neighbour (Latin, short words, three words or more)
const { widont } = await import('../src/core/thai.ts');
assert.equal(widont('Read on your device only. Nothing is sent anywhere.'), 'Read on your device only. Nothing is sent\u00a0anywhere.', 'the last word is not left alone');
assert.equal(widont('The philosophy of a steady mind'), 'The philosophy of a steady\u00a0mind', 'short pair joined');
assert.equal(widont('three short words'), 'three short\u00a0words', 'three words are enough');
assert.equal(widont('Philosophers met'), 'Philosophers met', 'two words can still part');
assert.equal(widont('an extraordinarily incomprehensible'), 'an extraordinarily incomprehensible', 'a long pair can still part');
assert.equal(widont('อยากได้ประโยคของตัวเองบ้างไหม ไปหมุนตู้นี้'), 'อยากได้ประโยคของตัวเองบ้างไหม ไปหมุนตู้\u2060นี้', 'a short Thai last word stays with the word before it');
console.log('last words: all checks passed');
assert.equal(widont('What will you do differently tomorrow?'), 'What will you do differently\u00a0tomorrow?', 'a pair up to 22 letters');
assert.equal(widont('“ความรักทำให้เราเข้าใจกัน”').replace(/\u2060(?=กัน)/, '|'), '“ความรักทำให้เราเข้าใจ|กัน”', 'a short Thai last word keeps its neighbour');
assert.equal(widont('แล้วเราจะไปด้วยกันตลอดไป'), widont(widont('แล้วเราจะไปด้วยกันตลอดไป')), 'setting twice changes nothing');
console.log('Thai last words: all checks passed');
assert.equal(setThai('1883 ถึง 1955').replace(/\u2060/g, ''), '1883\u00a0ถึง\u00a01955', 'a lifespan never breaks');
assert.equal(setThai('Level: 8').replace(/\u2060/g, ''), 'Level:\u00a08', 'unchanged label rule');
console.log('numbers with Thai words: all checks passed');
assert.ok(setThai('จุดแล้ว 23 ดวง').replace(/\u2060/g, '').startsWith('จุดแล้ว 23'), 'any word before a number may still break');
console.log('number words: all checks passed');
assert.ok(runs('we reach the\u00a0conclusions\u2060.').filter(([, h]) => h).map(([x]) => x).join('|').includes('the\u00a0conclusions'), 'a no-break space joins its neighbours into the held run');
console.log('no-break ties: all checks passed');

// a line's reflection earns its 25 XP once, ever: removing the line and keeping it again never earns it twice
{
  const { saveNote, removeNote } = await import('../src/core/game.ts');
  const { store } = await import('../src/core/store.ts');
  store.reset();
  const q = { id: 'q-reflect', school: 'stoic', author: 'seneca', th: '', en: '', tags: [] };
  const words = 'a reflection long enough to count as one, written with care';
  saveNote(q, words, 'paper');
  const once = store.s.xp;
  assert.ok(once >= 25, 'the first reflection earns');
  removeNote(q.id);
  saveNote(q, words, 'paper');
  assert.equal(store.s.xp, once, 'kept again after removing it: nothing more');
  store.reset();
}
console.log('reflections earn once: all checks passed');
