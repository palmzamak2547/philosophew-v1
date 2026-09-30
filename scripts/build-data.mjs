// Merge roster + portraits + curated school files (+ seed) into public/data, and refuse bad data.
// node scripts/build-data.mjs            -> writes public/data/*
// node scripts/build-data.mjs --check    -> validate only
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const P = (...p) => path.join(ROOT, ...p);
const read = (p, d) => (fs.existsSync(P(p)) ? JSON.parse(fs.readFileSync(P(p), 'utf8')) : d);
const checkOnly = process.argv.includes('--check');

const SCHOOLS = ['stoic', 'existential', 'eastern', 'absurd', 'socratic'];
const VERIFY = new Set(['primary', 'sourced', 'attributed']);
const TAGS = new Set('control emotion anger fear death time present change nature mind self ego freedom choice responsibility meaning suffering happiness desire love friendship solitude virtue courage action work failure hope absurd humor rebellion society truth doubt reason knowledge language simplicity'.split(' '));
const MOODS = new Set('stress lost overwhelmed tired confused heartbroken anxious angry bored stuck'.split(' '));
const MIDDOT = /\xB7/;

const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

const roster = read('data/roster.json').authors;
const byId = new Map(roster.map((a) => [a.id, a]));
const portraits = read('data/portraits.json', {});
const seed = read('data/seed.json', { quotes: [] });
const curated = Object.fromEntries(SCHOOLS.map((s) => [s, read(`data/curated/${s}.json`, null)]));

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const qid = (q) => crypto.createHash('sha1').update(q.author + '|' + norm(q.en)).digest('base64url').slice(0, 8);

// ---- authors ----
const authors = {};
for (const a of roster) {
  const cur = SCHOOLS.map((s) => curated[s]?.authors?.[a.id]).find(Boolean) || {};
  const pt = portraits[a.id] || {};
  authors[a.id] = {
    id: a.id,
    en: a.en,
    th: cur.th || a.th,
    schools: a.schools,
    born: pt.born ?? null,
    died: pt.died ?? null,
    circa: !!pt.circa,
    era: cur.era_th || null,
    bio: cur.bio_th || null,
    bioEn: cur.bio_en || null,
    works: cur.works || [],
    wiki: { en: pt.wiki_en || null, th: pt.wiki_th || null },
    portrait: pt.portrait
      ? { file: pt.portrait.file, thumb: pt.portrait.thumb || pt.portrait.file, kind: pt.portrait.kind, artist: pt.portrait.artist?.trim().replace(/\.$/, '') || null, /* no full stop: the credit goes on with the licence */ license: pt.portrait.license || null, source: pt.portrait.source_page || null }
      : null,
  };
  for (const k of ['th', 'bio', 'era']) if (authors[a.id][k] && MIDDOT.test(authors[a.id][k])) err(`author ${a.id}.${k} contains a middle dot`);
}

// ---- quotes ----
const out = Object.fromEntries(SCHOOLS.map((s) => [s, []]));
const seen = new Map(); // id -> school
function add(q, school, origin) {
  const where = `${origin} ${q.author}: "${(q.en || '').slice(0, 40)}"`;
  if (!byId.has(q.author)) return err(`${where} unknown author`);
  // the app reads a thinker's lines from their schools' files only (src/core/data.ts quotesBy)
  if (!byId.get(q.author).schools.includes(school)) err(`${where} is in ${school}, which is not one of the author's schools in the roster`);
  if (!q.en || !q.th) return err(`${where} missing en/th`);
  if (MIDDOT.test(q.th) || MIDDOT.test(q.en)) err(`${where} contains a middle dot`);
  if (/\\u[0-9a-f]{4}/i.test(q.th)) err(`${where} contains a literal \\u escape`);
  if (!VERIFY.has(q.verify)) err(`${where} bad verify "${q.verify}"`);
  if (!q.source?.work) err(`${where} missing source.work`);
  if (q.en.length > 400) warn(`${where} long (${q.en.length} chars)`);
  const tags = (q.tags || []).filter((t) => TAGS.has(t));
  if ((q.tags || []).length !== tags.length) warn(`${where} dropped unknown tags ${q.tags.filter((t) => !TAGS.has(t))}`);
  const mood = (q.mood || []).filter((m) => MOODS.has(m));
  const id = qid(q);
  if (seen.has(id)) {
    if (seen.get(id) !== school) err(`${where} duplicated across ${seen.get(id)} and ${school}`);
    return; // first one wins (curated before seed)
  }
  seen.set(id, school);
  out[school].push({
    id,
    author: q.author,
    school,
    th: q.th.trim(),
    en: q.en.trim(),
    orig: q.orig?.text ? { lang: q.orig.lang, text: q.orig.text } : null,
    source: { work: q.source?.work || null, locator: q.source?.locator || null, translator: q.source?.translator || null, url: q.source?.url || null },
    verify: q.verify,
    tags,
    mood,
  });
}
for (const s of SCHOOLS) for (const q of curated[s]?.quotes || []) add(q, s, `curated/${s}`);
for (const q of seed.quotes) if (!curated[q.school]) add(q, q.school, 'seed'); // seed only fills schools not yet curated

const prompts = Object.fromEntries(SCHOOLS.map((s) => [s, { th: (curated[s]?.prompts_th || []).filter((p) => !MIDDOT.test(p)), en: curated[s]?.prompts_en || [] }]));
const myths = SCHOOLS.flatMap((s) => (curated[s]?.misattributed || []).map((m) => ({ ...m, school: s })));

const counts = Object.fromEntries(SCHOOLS.map((s) => [s, out[s].length]));
const usedAuthors = new Set(SCHOOLS.flatMap((s) => out[s].map((q) => q.author)));

if (warns.length) console.log(`warnings (${warns.length}):\n  ` + warns.slice(0, 40).join('\n  '));
if (errors.length) {
  console.error(`\nerrors (${errors.length}):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log('quotes per school', counts, 'authors with quotes', usedAuthors.size);
if (checkOnly) process.exit(0);

fs.mkdirSync(P('public/data/quotes'), { recursive: true });
const write = (p, v) => fs.writeFileSync(P(p), JSON.stringify(v));
for (const s of SCHOOLS) write(`public/data/quotes/${s}.json`, out[s]);
write('public/data/authors.json', authors);
write('public/data/prompts.json', prompts);
write('public/data/myths.json', myths);
// the thinkers each machine holds lines of, in roster order: what a room counts and what /me shelves under it
const rooms = Object.fromEntries(SCHOOLS.map((s) => [s, roster.map((a) => a.id).filter((id) => out[s].some((q) => q.author === id))]));
write('public/data/meta.json', { generated: new Date().toISOString(), counts, total: Object.values(counts).reduce((a, b) => a + b, 0), rooms });
console.log('wrote public/data');
