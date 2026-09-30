// After `vite build`: every page a reader or a search engine can land on gets HTML of its own, readable before (and
// without) any JavaScript: the front door, the five rooms (/s/<school>), the library, about, the Agora, each quote
// (/q/<id>) and each thinker (/p/<id>). Each carries its own title, description, canonical, Open Graph and Twitter
// tags and structured data; the text is what the app shows on that page, and the app replaces it on boot. Plus
// sitemap.xml and robots.txt. Vercel's clean URLs serve /s/stoic from s/stoic.html; everything else falls back to
// index.html (the front door), whose app shows the private pages and says "not found" (with a noindex) itself.
// Check the result with `node scripts/check-seo.mjs` (add --browser for the no-JS and boot checks).
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';

// The app's own words: titles, schools, dates, verify labels. Its language comes from saved state, so pin Thai: the
// output must not depend on the build machine's locale or time zone (a Vercel builder would guess English).
globalThis.localStorage = { getItem: (k) => (k === 'pw.state.v1' ? JSON.stringify({ settings: { lang: 'th' } }) : null), setItem() {}, removeItem() {} };
register('./ts-hooks.mjs', import.meta.url);
const { SCHOOLS, SCHOOL, MOODS, latinGap, toneVars } = await import('../src/content/schools.ts');
const { titles } = await import('../src/content/seo.ts');
const { personTitle, quoteTitle } = await import('../src/content/seo-pages.ts');
const { lifespan } = await import('../src/core/time.ts');
const { smart } = await import('../src/core/typo.ts');
const { verifyLabel } = await import('../src/core/data.ts');
// work, locator and translator exactly as the card writes them (no-break spaces keep "Book 2, 1" and "p. 177" whole)
const { sourceLine } = await import('../src/ui/card.ts');
const PRIVACY = await import('../src/content/privacy.ts');

const root = path.resolve(import.meta.dirname, '..');
const dist = (...p) => path.join(root, 'dist', ...p);
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const SITE = 'https://philosophew.lol';
const ORG = `${SITE}/#organization`;
const WEBSITE = `${SITE}/#website`;
const EMAIL = 'philosophew@yahoo.com';
// The project's own accounts: search engines read them as "this site is also these accounts" (Organization.sameAs). The
// About page links the same two (src/ui/about.ts SOCIAL): add a new account in both.
const SOCIAL = ['https://www.instagram.com/philoso.phew/', 'https://www.tiktok.com/@philoso.phew'];

const authors = read('public/data/authors.json');
const people = read('data/portraits.json'); // Wikidata id and Wikipedia pages per thinker
const myths = read('public/data/myths.json');
const index = read('public/data/library/index.json');
const meta = read('public/data/meta.json');
const quotes = SCHOOLS.flatMap((s) => read(`public/data/quotes/${s.id}.json`));
const byAuthor = (id) => quotes.filter((q) => q.author === id);
const inLibrary = (id) => (index.authors[id]?.count || 0) + byAuthor(id).length; // what the library shows per thinker
const libraryTotal = index.total + quotes.length;
const sourceCount = index.sources.filter((s) => s.rows_kept > 0).length;
const withPortrait = Object.values(authors).filter((a) => a.portrait?.file);

// ---------- text helpers ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => n.toLocaleString('en-US');
// a Thai name keeps each of its parts on one line, as the app does (transliterations are in no dictionary); layout only,
// so the text a crawler reads is unchanged
const nm = (s) => esc(s).split(' ').map((w) => `<span class="pre-n">${w}</span>`).join(' ');
const letters = new Intl.Segmenter('th', { granularity: 'grapheme' });
/** Length as a reader counts it: a Thai consonant with its vowel and tone marks is one letter. */
const graphemes = (s) => [...letters.segment(s)].length;
/** Whole phrases up to `max` letters (a phrase ends at a space in Thai), marked when cut. */
function fit(s, max) {
  if (graphemes(s) <= max) return s;
  let out = '';
  for (const part of s.split(' ')) {
    const next = out ? `${out} ${part}` : part;
    if (graphemes(next) + 1 > max) break;
    out = next;
  }
  return `${out || [...letters.segment(s)].slice(0, max - 1).map((x) => x.segment).join('')}…`;
}
const years = (a) => lifespan(a.born, a.died, a.circa);
const short = (s) => SCHOOL[s].short.th;
// A thinker's portrait may go into structured data and the image sitemap only under a licence that asks for no more
// than credit: public domain, CC0 or CC BY. Never share-alike (a copy shown elsewhere would carry the licence with it).
// a papyrus stands in where no likeness survives (Musonius Rufus): it is not the person's image
const openImage = (a) => !!a.portrait?.file && a.portrait.kind !== 'symbol' && a.portrait.kind !== 'papyrus' && /^(public domain|cc0|cc by \d)/i.test(a.portrait.license || '');
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

// ---------- the page shell ----------
// The built index.html with its search tags taken out (each page writes its own), with and without the hall's
// preloads (vite.config.ts hallPreload): the front door and the rooms load the 3D hall, a flat page opens without it.
const built = fs.readFileSync(dist('index.html'), 'utf8')
  .replace(/<!--pre-->[\s\S]*?<!--\/pre-->/, '') // a second run over the same build
  .replace(/\s*<title>[^<]*<\/title>/, '')
  .replace(/\s*<meta (?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, '')
  .replace(/\s*<link rel="canonical"[^>]*>/g, '')
  .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
  .replace(/\s*<style id="pre-css">[\s\S]*?<\/style>/g, '');
if (!/<meta name="viewport"[^>]*>/.test(built) || !built.includes('<div id="app"></div>')) throw new Error('prerender: index.html lost its viewport tag or its empty #app');
const shellHall = built;
const shellFlat = built.replace(/<link rel="modulepreload"[^>]*data-hall>\s*/g, '');

// For readers without JavaScript (and crawlers that never run it). With scripts on, the app replaces it at once, so it
// never paints first (over the lamp's dark paint it would flash) unless the app has not arrived after 4 seconds.
// System fonts, no images: nothing here costs the first paint anything.
const CSS = [
  '.pre{max-width:44rem;margin:0 auto;padding:1.25rem 1.25rem 4rem;font:1.0625rem/1.75 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;color:var(--ink);background:var(--paper)}',
  '.pre a{color:inherit;text-underline-offset:.18em}',
  '.pre h1{font-size:1.85rem;line-height:1.3;margin:1.25rem 0 .75rem}',
  '.pre h2{font-size:1.25rem;line-height:1.4;margin:2.25rem 0 .6rem}',
  '.pre h3{font-size:1.05rem;line-height:1.5;margin:1.25rem 0 .2rem}',
  '.pre p,.pre ul,.pre ol,.pre dl,.pre table,.pre blockquote,.pre figure{margin:0 0 1rem}',
  '.pre ul,.pre ol{padding-left:1.25rem}',
  '.pre li{margin:.35rem 0}',
  '.pre blockquote{font-size:1.25rem;line-height:1.6}',
  '.pre td,.pre th{padding:.2rem 1rem .2rem 0;text-align:left;vertical-align:top}',
  '.pre-bar{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;font-size:.95rem}',
  '.pre-crumbs{font-size:.9rem;margin-top:.75rem}',
  '.pre-m{color:var(--ink-3)}',
  '.pre-n{white-space:nowrap}',
  '@media (scripting:enabled){.pre{position:absolute;top:0;left:0;width:1px;height:1px;margin:0;padding:0;overflow:hidden;visibility:hidden;animation:pre-late 0s 4s forwards}}',
  '@keyframes pre-late{to{position:static;width:auto;height:auto;margin:0 auto;padding:1.25rem 1.25rem 4rem;overflow:visible;visibility:visible}}',
].join('');

const bar = `<nav class="pre-bar" aria-label="เมนูหลัก"><a href="/"><b>philosophew</b></a><a href="/library">หอสมุด</a><a href="/agora">อะกอรา</a><a href="/about">เกี่ยวกับเรา</a><a href="/privacy">ความเป็นส่วนตัว</a></nav>`;
/** The trail shown on the page and given to search engines: [name, path] pairs, the page itself last (no path). */
const crumbsHtml = (trail) => `<nav class="pre-crumbs" aria-label="เส้นทาง">${trail.map(([name, p], i) => (i < trail.length - 1 ? `<a href="${p}">${nm(name)}</a>` : `<span aria-current="page">${nm(name)}</span>`)).join(' › ')}</nav>`;
const crumbsLd = (url, trail) => ({
  '@type': 'BreadcrumbList',
  '@id': `${url}#breadcrumb`,
  itemListElement: trail.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(i < trail.length - 1 ? { item: SITE + p } : {}) })),
});
const HOME = ['Philosophew', '/'];
const LIBRARY = ['หอสมุด', '/library'];

const OG_ALT = 'philosophew สุ่มคำคมปรัชญา แล้วหายใจออก ห้าตู้ ห้าสำนักคิด คำพูดจริงพร้อมที่มา'; // the words on /og.png
const ogFor = (s) => ({ image: `/og/${s.id}.png`, imageAlt: `${s.name.th} ${s.tagline.th} ${s.machine.name.th}` });

// A room, a thinker or a quote paints in its school's colours from the first frame: the same tokens and attributes
// src/ui/shell.ts setTone sets (and the browser's bar in its paper), written into the page itself. Without them a shared
// link painted the device's theme until the app had fetched its data (3.6 s on a slow phone), then switched.
const toned = (html, s) => (!s ? html : html
  .replace('<html lang="th">', `<html lang="th" data-school="${s.id}" data-dark="${s.dark ? 1 : 0}" style="${toneVars(s)}">`)
  .replace(/(<meta name="theme-color" content=")[^"]*(")/g, `$1${s.palette.bg}$2`));

const written = []; // [path, file, images for the sitemap]
function page({ path: p, file, title, desc, image = '/og.png', imageAlt = OG_ALT, graph, body, hall = false, images = [], tone = null }) {
  const url = SITE + p;
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${url}">`,
    '<meta name="robots" content="max-image-preview:large">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Philosophew">',
    '<meta property="og:locale" content="th_TH">',
    '<meta property="og:locale:alternate" content="en_US">',
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:image" content="${SITE}${image}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(imageAlt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${SITE}${image}">`,
    `<meta name="twitter:image:alt" content="${esc(imageAlt)}">`,
    `<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': graph })}</script>`,
    `<style id="pre-css">${CSS}</style>`,
  ].join('\n');
  const html = toned(hall ? shellHall : shellFlat, tone)
    .replace(/(<meta name="viewport"[^>]*>)/, (m) => `${m}\n${head}`)
    .replace('<div id="app"></div>', () => `<div id="app"><!--pre--><div class="pre">${bar}${body}</div><!--/pre--></div>`);
  fs.mkdirSync(path.dirname(dist(file)), { recursive: true });
  fs.writeFileSync(dist(file), html);
  written.push([p, file, [image, ...images]]);
}

// ---------- quotes (/q/<id>) ----------
const thaiOriginal = (q) => q.orig?.lang === 'th';
function quoteDesc(q, a) {
  const tail = ` ${a.th} (${a.en}) จาก ${smart(q.source.work)}`;
  const note = thaiOriginal(q) ? ' พร้อมคำแปลภาษาอังกฤษและแหล่งที่มา' : ' แปลไทย พร้อมภาษาอังกฤษและแหล่งที่มา';
  const line = smart(q.th);
  const room = 160 - graphemes(tail) - 2; // the quotation marks
  const quote = `“${graphemes(line) > room ? fit(line, room) : line}”`;
  return graphemes(quote + tail + note) <= 160 ? quote + tail + note : quote + tail;
}
const qItem = (q, withName) => `<li><a href="/q/${q.id}">“${esc(smart(q.th))}”</a>${withName ? ` <span class="pre-m">${nm(authors[q.author].th)}</span>` : ''}</li>`;

for (const q of quotes) {
  const a = authors[q.author];
  const s = SCHOOL[q.school];
  const url = `${SITE}/q/${q.id}`;
  const person = `${SITE}/p/${a.id}`;
  const trail = [HOME, LIBRARY, [a.th, `/p/${a.id}`], [`ประโยคของ${a.th}`]];
  const more = quotes.filter((x) => x.author === q.author && x.id !== q.id).slice(0, 6);
  const english = { '@type': 'Quotation', text: smart(q.en), inLanguage: 'en', creator: { '@id': `${person}#person` } };
  const body = `${crumbsHtml(trail)}<main>
<h1>ประโยคของ${nm(a.th)}</h1>
<p class="pre-m">${esc(short(q.school))}</p>
<figure><blockquote lang="th"><p>“${esc(smart(q.th))}”</p></blockquote><p lang="en"><i>${esc(smart(q.en))}</i></p>
<figcaption><a href="/p/${a.id}">${nm(a.th)}</a> ${esc(a.en)} <span class="pre-m">${esc(years(a))}</span><br>${esc(sourceLine(q))} <span class="pre-m">(${esc(verifyLabel(q.verify).th)})</span>${q.source.url ? ` <a href="${esc(q.source.url)}" rel="noopener">ที่มา</a>` : ''}</figcaption></figure>
<p><a href="/s/${s.id}">${esc(s.machine.name.th)} อยากได้ประโยคของตัวเองบ้างไหม ไปหมุนตู้นี้เลย</a></p>
${more.length ? `<h2>ประโยคอื่นของ${nm(a.th)}</h2><ul>${more.map((x) => qItem(x, false)).join('')}</ul>` : ''}
<p><a href="/p/${a.id}">รู้จักนักปรัชญาคนนี้</a></p>
</main>`;
  page({
    path: `/q/${q.id}`, file: `q/${q.id}.html`, tone: s,
    title: quoteTitle(smart(q.th), a.th),
    desc: quoteDesc(q, a),
    // the line's own picture when scripts/og-quotes.mjs has drawn it (a chat shows the quote, not the school's card)
    ...(fs.existsSync(path.join(root, 'public/og/q', `${q.id}.jpg`)) ? { image: `/og/q/${q.id}.jpg`, imageAlt: `${smart(q.th)} ${a.th}` } : ogFor(s)),
    graph: [
      {
        '@type': 'Quotation', '@id': `${url}#quote`, url,
        text: smart(q.th), inLanguage: 'th',
        creator: { '@type': 'Person', '@id': `${person}#person`, name: a.th, alternateName: a.en, url: person },
        // the Thai is translated from the English line (the Thai masters' own words are the original, the other way round)
        ...(thaiOriginal(q) ? { workTranslation: english } : { translationOfWork: english }),
        isBasedOn: { '@type': 'CreativeWork', name: smart(q.source.work), ...(q.source.url ? { url: q.source.url } : {}) },
        isPartOf: { '@id': WEBSITE },
      },
      crumbsLd(url, trail),
    ],
    body,
  });
}

// ---------- thinkers (/p/<id>) ----------
for (const a of Object.values(authors)) {
  const url = `${SITE}/p/${a.id}`;
  const w = people[a.id] || {};
  const s = SCHOOL[a.schools[0]];
  const mine = byAuthor(a.id);
  const lib = index.authors[a.id]?.count || 0;
  const wiki = a.wiki.th || a.wiki.en;
  const theirMyths = myths.filter((m) => m.author === a.id);
  const trail = [HOME, LIBRARY, [a.th]];
  // years only where they are known: a CE year that is not an estimate (ISO 8601 years; BCE and "about" dates stay in the text)
  const known = (y) => (y != null && y > 0 && !a.circa ? String(y).padStart(4, '0') : undefined);
  const img = openImage(a) ? {
    '@type': 'ImageObject',
    url: SITE + a.portrait.file,
    contentUrl: SITE + a.portrait.file,
    license: w.portrait?.license_url || a.portrait.source,
    acquireLicensePage: a.portrait.source,
    creditText: [a.portrait.artist, /archive\.org/.test(a.portrait.source || '') ? 'Internet Archive' : 'Wikimedia Commons'].filter(Boolean).join(', '),
  } : undefined;
  const body = `${crumbsHtml(trail)}<main>
<p class="pre-m">${esc(a.schools.map(short).join(' และ '))}</p>
<h1>${nm(a.th)}</h1>
<p>${esc(a.en)} <span class="pre-m">${esc(years(a))}</span></p>
${a.bio ? `<p>${esc(a.bio)}</p>` : ''}
${a.works.length ? `<p><b>งานสำคัญ</b> ${esc(a.works.join(a.works.some((w) => w.includes(',')) ? '; ' : ', '))}</p>` : ''}
<p><a href="/s/${s.id}">สุ่มจากตู้${latinGap(s.short.th)}${esc(s.short.th)}</a>${wiki ? ` <a href="${esc(wiki)}" rel="noopener">Wikipedia</a>` : ''}</p>
${mine.length ? `<h2>คำคมคัดสรร <span class="pre-m">${mine.length}</span></h2><p class="pre-m">${mine.every(thaiOriginal) ? 'ถ้อยคำภาษาไทยของท่านเอง ตรวจที่มาแล้ว' : 'แปลไทยและตรวจที่มาแล้ว'} ทั้งหมดนี้คือประโยคที่ออกมาจากตู้</p><ul>${mine.map((q) => qItem(q, false)).join('')}</ul>` : ''}
<h2>ในหอสมุด <span class="pre-m">${fmt(lib)}</span></h2><p class="pre-m">ประโยคภาษาอังกฤษจากชุดข้อมูลสาธารณะ ทุกประโยคบอกไว้ว่ามีแหล่งอ้างอิง หรือแค่เล่าต่อกันมา</p>
${theirMyths.length ? `<h2>ไม่ได้พูด แต่คนชอบแชร์</h2><p class="pre-m">ประโยคดังที่มักถูกอ้างว่าเป็นของท่าน แต่ตรวจแล้วมาจากที่อื่น</p><ul>${theirMyths.map((m) => `<li>“${esc(smart(m.th || m.en))}”<br><span class="pre-m">${esc(smart(m.why_th))}</span></li>`).join('')}</ul>` : ''}
</main>`;
  page({
    path: `/p/${a.id}`, file: `p/${a.id}.html`, tone: s,
    title: personTitle(a),
    desc: fit(a.bio || a.bioEn || `คำคมของ${a.th} (${a.en}) แปลไทย พร้อมแหล่งที่มาที่ตรวจสอบได้`, 160),
    ...ogFor(s),
    images: img ? [a.portrait.file] : [],
    graph: [
      {
        '@type': 'Person', '@id': `${url}#person`, url,
        name: a.th,
        alternateName: [...new Set([a.en, w.th_label].filter((x) => x && x !== a.th))],
        ...(a.bio ? { description: a.bio } : {}),
        ...(known(a.born) ? { birthDate: known(a.born) } : {}),
        ...(known(a.died) ? { deathDate: known(a.died) } : {}),
        sameAs: [...new Set([a.wiki.en || w.wiki_en, a.wiki.th || w.wiki_th, w.qid ? `https://www.wikidata.org/wiki/${w.qid}` : null].filter(Boolean))],
        ...(img ? { image: img } : {}),
      },
      crumbsLd(url, trail),
    ],
    body,
  });
}

// ---------- the rooms (/s/<school>) ----------
for (const s of SCHOOLS) {
  const url = `${SITE}/s/${s.id}`;
  const pool = quotes.filter((q) => q.school === s.id);
  const lines = new Map(); // lines in this machine per thinker
  pool.forEach((q) => lines.set(q.author, (lines.get(q.author) || 0) + 1));
  const thinkers = Object.values(authors).filter((a) => lines.has(a.id));
  // a handful of lines: the curators' first line from each of the machine's most represented thinkers
  const sample = [...thinkers].sort((x, y) => lines.get(y.id) - lines.get(x.id)).slice(0, 8).map((a) => pool.find((q) => q.author === a.id));
  const trail = [HOME, [s.name.th]];
  // นักคิดสายสโตอิก, นักคิดสาย Existential; a name that already says สาย (สายโสกราตีส) takes no second one
  const kind = `${s.short.th.startsWith('สาย') ? '' : 'สาย'}${latinGap(s.short.th)}${s.short.th}`;
  const desc = `${s.machine.name.th} สำหรับคนที่${s.forWho.th} ${s.machine.action.th} แล้วรับคำคมจากนักคิด${kind} ${thinkers.length} คน พร้อมแหล่งที่มา`;
  const body = `${crumbsHtml(trail)}<main>
<p class="pre-m">${esc(s.name.th)} (${esc(s.sub.th)})</p>
<h1>${esc(s.machine.name.th)}</h1>
<p><i>${esc(s.machine.motto.th)}</i></p>
<p><b>${esc(s.machine.action.th)}</b> ${esc(s.machine.hint.th)}</p>
<h2>${esc(s.name.th)} ${esc(s.tagline.th)}</h2>
<p><b>เหมาะกับคนที่</b> ${esc(s.forWho.th)}</p>
<ul>${s.keywords.th.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
<h2>นักคิดในตู้นี้ <span class="pre-m">${thinkers.length} คน ${fmt(pool.length)} ประโยค</span></h2>
<ul>${thinkers.map((a) => `<li><a href="/p/${a.id}">${nm(a.th)}</a> <span class="pre-m">${esc(a.en)}, ${lines.get(a.id)} ประโยค</span></li>`).join('')}</ul>
<h2>ตัวอย่างประโยคจากตู้นี้</h2>
<ul>${sample.map((q) => qItem(q, true)).join('')}</ul>
<p><a href="/library">ดูนักคิดทุกคนในหอสมุด</a></p>
</main>`;
  page({
    path: `/s/${s.id}`, file: `s/${s.id}.html`, hall: true, tone: s,
    title: titles.school(s),
    desc,
    ...ogFor(s),
    graph: [
      { '@type': 'CollectionPage', '@id': url, url, name: titles.school(s), description: desc, inLanguage: 'th', isPartOf: { '@id': WEBSITE }, breadcrumb: { '@id': `${url}#breadcrumb` } },
      crumbsLd(url, trail),
    ],
    body,
  });
}

// ---------- the library ----------
{
  const url = `${SITE}/library`;
  const trail = [HOME, ['หอสมุด']];
  const intro = `รวบรวมจาก ${sourceCount} แหล่ง ทั้ง Wikiquote, Hugging Face และ GitHub ทุกประโยคติดป้ายบอกว่าตรวจที่มาได้แค่ไหน คำคมที่มักถูกอ้างผิดคน เราคัดออกและเก็บไว้ให้ดูแยก`;
  const h1 = `${fmt(libraryTotal)} ประโยค จากนักคิด ${Object.keys(authors).length} คน`;
  const body = `${crumbsHtml(trail)}<main>
<p class="pre-m">หอสมุด</p>
<h1>${h1}</h1>
<p>${esc(intro)}</p>
${SCHOOLS.map((s) => `<h2>${esc(s.name.th)}</h2><p><a href="/s/${s.id}">ไปตู้นี้</a></p><ul>${Object.values(authors).filter((a) => a.schools[0] === s.id).map((a) => `<li><a href="/p/${a.id}">${nm(a.th)}</a> <span class="pre-m">${esc(a.en)}, ${fmt(inLibrary(a.id))} ประโยค</span></li>`).join('')}</ul>`).join('\n')}
</main>`;
  const desc = fit(`หอสมุด ${h1} ${intro.split(' คำคมที่มักถูกอ้างผิดคน')[0]}`, 160); // the first two sentences, whole
  page({
    path: '/library', file: 'library.html',
    title: titles.library(),
    desc,
    graph: [
      { '@type': 'CollectionPage', '@id': url, url, name: titles.library(), description: desc, inLanguage: 'th', isPartOf: { '@id': WEBSITE }, breadcrumb: { '@id': `${url}#breadcrumb` } },
      crumbsLd(url, trail),
    ],
    body,
  });
}

// ---------- about ----------
const STEPS = [
  ['หายใจ', 'ทุกวันเริ่มด้วยการหายใจลึกๆ สักครั้ง เพื่อจุดตะเกียงและเติมไฟไว้หมุนตู้'],
  ['เลือกตู้ตามใจ', 'ห้าสำนักคิด ห้าตู้ ห้าวิธีสุ่ม ถ้าไม่รู้จะเลือกตู้ไหน ก็บอกเราว่าวันนี้ใจเป็นยังไง'],
  ['รับการ์ด', 'การ์ดมีภาพจริงของผู้พูด คำแปลไทย และที่มา บางใบเป็นฟอยล์ และนานๆ\u00a0ทีจะได้ทองคำเปลว'],
  ['เก็บ เขียน แชร์', 'เก็บลงสมุด เขียนความคิดเพื่อรับไฟคืน แชร์เป็นรูป หรือโพสต์ลงอะกอราให้คนอื่นอ่าน'],
];
const LEAD = 'ปรัชญา แต่ทำให้ใจได้หายใจออก ตู้กาชาปองที่สุ่มคำคมจากนักปรัชญาตัวจริง พร้อมแหล่งที่มาที่ตรวจสอบได้ ให้คุณเก็บ คิด และแชร์ต่อ';
const steps = `<ol>${STEPS.map(([b, t]) => `<li><b>${esc(b)}</b> ${esc(t)}</li>`).join('')}</ol>`;
{
  const url = `${SITE}/about`;
  const trail = [HOME, ['เกี่ยวกับเรา']];
  const licence = (raw) => ({ cc: 'ครีเอทีฟคอมมอนส์ (ไม่ระบุรุ่น)', mit: 'MIT', 'not stated': 'ไม่ได้ระบุ', 'not stated (editorial site)': 'ไม่ได้ระบุ (เว็บไซต์บทความ)' })[raw.trim().toLowerCase()] ?? raw;
  const body = `${crumbsHtml(trail)}<main>
<h1>philosophew</h1>
<p>${esc(LEAD)}</p>
<h2>ใช้ยังไง</h2>${steps}
<h2>เราตรวจที่มายังไง</h2>
<ul><li><b>จากต้นฉบับ</b> เจอประโยคนี้ในตัวบทต้นฉบับ พร้อมระบุเล่ม บท และผู้แปลเมื่อรู้ชื่อ</li><li><b>มีแหล่งอ้างอิง</b> มีแหล่งอ้างอิงที่ตรวจสอบได้ว่าเป็นคำพูดของท่าน</li><li><b>เล่าต่อกันมา</b> เล่าต่อกันมาว่าเป็นคำพูดของท่าน แต่เรายังหาต้นฉบับไม่เจอ</li></ul>
<p class="pre-m">คำคมที่ Wikiquote หรือแหล่งตรวจสอบอื่นระบุว่าอ้างผิดคน เราไม่ใส่ในตู้ และรวบรวมประโยคที่ดังที่สุดไว้ในหัวข้อ “ไม่ได้พูด แต่คนชอบแชร์” ในหน้าของนักปรัชญาคนนั้น</p>
<h2>ข้อมูลของเรา</h2>
<ul><li>คำคมคัดสรร (แปลไทย) ${fmt(meta.total)}</li><li>ในหอสมุด ${fmt(index.total)}</li><li>นักคิด ${Object.keys(authors).length}</li><li>ภาพจริง ${withPortrait.filter((a) => a.portrait.kind !== 'papyrus').length}</li></ul>
<table><thead><tr><th>แหล่ง</th><th>เก็บไว้</th><th>สัญญาอนุญาต</th></tr></thead><tbody>${index.sources.filter((s) => s.rows_kept > 0).map((s) => `<tr><td><a href="${esc(s.url)}" rel="noopener">${esc(s.name)}</a></td><td>${fmt(s.rows_kept)}</td><td>${esc(licence(s.license))}</td></tr>`).join('')}</tbody></table>
<h2>ภาพนักปรัชญา</h2>
<p class="pre-m">ภาพทั้งหมดมาจาก Wikimedia Commons และ Internet Archive ตามสัญญาอนุญาตของแต่ละภาพ พระพุทธเจ้าและหลวงพ่อชา เราใช้สัญลักษณ์แทนภาพบุคคลด้วยความเคารพ</p>
<ul>${withPortrait.map((a) => `<li><a href="/p/${a.id}">${nm(a.th)}</a> <span class="pre-m">${esc(a.portrait.artist ? `${a.portrait.artist}, ` : '')}${esc(a.portrait.license || '')}</span>${a.portrait.source ? ` <a href="${esc(a.portrait.source)}" rel="noopener">${/archive\.org/.test(a.portrait.source) ? 'Internet Archive' : 'Wikimedia Commons'}</a>` : ''}</li>`).join('')}</ul>
<h2>ความเป็นส่วนตัว</h2>
<p>สมุด ตะเกียง และคอลเลกชันของคุณอยู่ในเครื่องนี้ ถ้าเข้าสู่ระบบก็อยู่ในบัญชีของคุณด้วย มีแค่คุณที่เปิดดูได้ เราไม่ใช้ตัวติดตามโฆษณา เวลาโพสต์หรือกด phew เราเก็บค่าแฮชของ IP ที่ย้อนกลับไม่ได้ไว้กันสแปม โพสต์ในอะกอราจะขึ้นหลังผู้ดูแลอ่านแล้วเท่านั้น และคุณเลือกได้ว่าจะใส่ชื่อหรือไม่</p>
<p>เล่นได้โดยไม่ต้องมีบัญชี ถ้าเลือกเข้าสู่ระบบด้วย Google หรือด้วยรหัสทางอีเมล เราใช้อีเมลและรหัสบัญชีเพื่อยืนยันว่าเป็นคุณ และซิงก์ความคืบหน้าข้ามเครื่องเท่านั้น</p>
<p><a href="/privacy">อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม</a></p>
<h2>ติดต่อเรา</h2>
<p>เจอคำคมที่อ้างผิดคน มีคำถาม หรืออยากชวนทำอะไรด้วยกัน เขียนมาได้เลยที่ <a href="mailto:${EMAIL}">${EMAIL}</a></p>
<p>ติดตามเรา: <a href="https://www.instagram.com/philoso.phew/" rel="me">Instagram @philoso.phew</a> และ <a href="https://www.tiktok.com/@philoso.phew" rel="me">TikTok @philoso.phew</a></p>
</main>`;
  page({
    path: '/about', file: 'about.html',
    title: titles.about(),
    desc: LEAD,
    graph: [
      { '@type': 'AboutPage', '@id': url, url, name: titles.about(), description: LEAD, inLanguage: 'th', isPartOf: { '@id': WEBSITE }, about: { '@id': ORG }, breadcrumb: { '@id': `${url}#breadcrumb` } },
      crumbsLd(url, trail),
    ],
    body,
  });
}

// ---------- privacy (one source with the app: src/content/privacy.ts; Thai, then the whole policy in English) ----------
{
  const url = `${SITE}/privacy`;
  const trail = [HOME, [PRIVACY.TITLE[0]]];
  const say = (s) => PRIVACY.linkify(esc(s));
  const version = (i, h) => PRIVACY.SECTIONS.map((s) => `<${h} id="${s.id}${i ? '-en' : ''}">${esc(s.h[i])}</${h}>${(s.p || []).map((x) => `<p>${say(x[i])}</p>`).join('')}${s.li ? `<ul>${s.li.map((x) => `<li>${say(x[i])}</li>`).join('')}</ul>` : ''}${(s.after || []).map((x) => `<p>${say(x[i])}</p>`).join('')}`).join('\n');
  const desc = 'นโยบายความเป็นส่วนตัวของ Philosophew เล่นได้โดยไม่ต้องมีบัญชี ถ้าเข้าสู่ระบบ เราเก็บอะไร เก็บไว้ทำอะไร เก็บที่ไหน นานแค่ไหน และคุณลบได้อย่างไร';
  const body = `${crumbsHtml(trail)}<main>
<h1>${esc(PRIVACY.TITLE[0])}</h1>
<p class="pre-m">${esc(PRIVACY.UPDATED[0])}</p>
<p>${say(PRIVACY.INTRO[0])}</p>
${version(0, 'h2')}
<section lang="en">
<h2 id="english">${esc(PRIVACY.TITLE[1])} (English)</h2>
<p class="pre-m">${esc(PRIVACY.UPDATED[1])}</p>
<p>${say(PRIVACY.INTRO[1])}</p>
${version(1, 'h3')}
</section>
</main>`;
  page({
    path: '/privacy', file: 'privacy.html',
    title: titles.privacy(),
    desc,
    graph: [
      { '@type': 'WebPage', '@id': url, url, name: titles.privacy(), description: desc, inLanguage: 'th', isPartOf: { '@id': WEBSITE }, about: { '@id': ORG }, breadcrumb: { '@id': `${url}#breadcrumb` } },
      crumbsLd(url, trail),
    ],
    body,
  });
}

// ---------- the Agora ----------
{
  const url = `${SITE}/agora`;
  const trail = [HOME, ['อะกอรา']];
  const intro = 'คนอ่านคำคมเดียวกัน แต่คิดไม่เหมือนกัน ผู้ดูแลอ่านทุกโพสต์ก่อนขึ้นที่นี่';
  const desc = `อะกอรา ลานแลกความคิดของ Philosophew ${intro}`;
  const body = `${crumbsHtml(trail)}<main>
<p class="pre-m">อะกอรา</p>
<h1>ลานแลกความคิด</h1>
<p>${esc(intro)}</p>
<p>สุ่มคำคม เขียนความคิด แล้วโพสต์ลงอะกอรา <a href="/">ไปหมุนตู้</a></p>
</main>`;
  page({
    path: '/agora', file: 'agora.html',
    title: titles.agora(),
    desc,
    graph: [
      { '@type': 'WebPage', '@id': url, url, name: titles.agora(), description: desc, inLanguage: 'th', isPartOf: { '@id': WEBSITE }, breadcrumb: { '@id': `${url}#breadcrumb` } },
      crumbsLd(url, trail),
    ],
    body,
  });
}

// ---------- the front door (last: index.html is also the shell every page above was cut from) ----------
{
  const desc = 'ตู้กาชาปองปรัชญา เลือกสำนักคิดที่ตรงกับใจวันนี้ สุ่มคำคมจากนักปรัชญาตัวจริงพร้อมแหล่งที่มา เก็บลงสมุด แชร์ให้เพื่อน และจุดตะเกียงของคุณทุกวัน';
  const moodOf = (id) => MOODS.find((m) => m.school === id)?.label.th;
  const body = `<main>
<h1>Philosophew สุ่มคำคมปรัชญา แล้วหายใจออก</h1>
<p>${esc(LEAD)}</p>
<h2>วันนี้ใจเป็นยังไงบ้าง</h2>
<ul>${SCHOOLS.map((s) => {
  const pool = quotes.filter((q) => q.school === s.id);
  const n = new Set(pool.map((q) => q.author)).size;
  return `<li><h3><a href="/s/${s.id}">${esc(s.name.th)} (${esc(s.sub.th)})</a></h3><p>${esc(s.tagline.th)} ${moodOf(s.id) ? `<span class="pre-m">ถ้าวันนี้${esc(moodOf(s.id))}</span>` : ''}</p><p><b>เหมาะกับคนที่</b> ${esc(s.forWho.th)}</p><p class="pre-m">${esc(s.machine.name.th)} ${fmt(pool.length)} ประโยค จากนักคิด ${n} คน</p></li>`;
}).join('')}</ul>
<h2>ใช้ยังไง</h2>${steps}
<p><a href="/library">หอสมุด ${fmt(libraryTotal)} ประโยค จากนักคิด ${Object.keys(authors).length} คน</a></p>
<p><a href="/about">เกี่ยวกับเรา และวิธีตรวจที่มาของคำคม</a></p>
<p><a href="/privacy">นโยบายความเป็นส่วนตัว</a> เล่นได้โดยไม่ต้องมีบัญชี ถ้าเลือกเข้าสู่ระบบ เราใช้อีเมลเพื่อยืนยันว่าเป็นคุณ และซิงก์ความคืบหน้าข้ามเครื่องเท่านั้น</p>
</main>`;
  page({
    path: '/', file: 'index.html', hall: true,
    title: titles.home(),
    desc,
    graph: [
      {
        '@type': 'Organization', '@id': ORG, name: 'Philosophew', url: `${SITE}/`,
        logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png`, width: 512, height: 512 },
        email: EMAIL,
        contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: EMAIL, availableLanguage: ['th', 'en'] },
        sameAs: SOCIAL,
      },
      {
        '@type': 'WebSite', '@id': WEBSITE, url: `${SITE}/`, name: 'Philosophew', alternateName: 'philosophew.lol',
        description: desc, inLanguage: 'th', publisher: { '@id': ORG },
        // the library opens on a search from its address (src/ui/library.ts reads ?q=)
        potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/library?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
      },
    ],
    body,
  });
}

// ---------- sitemap and robots ----------
// lastmod is the day of this build (SOURCE_DATE_EPOCH, in seconds, pins it for a reproducible build)
const lastmod = new Date(process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) * 1000 : Date.now()).toISOString().slice(0, 10);
const order = (p) => (p === '/' ? 0 : p.startsWith('/s/') ? 1 : p.startsWith('/p/') ? 3 : p.startsWith('/q/') ? 4 : 2);
const entries = [...written].sort((x, y) => order(x[0]) - order(y[0]));
const xml = (s) => esc(s).replace(/'/g, '&apos;');
fs.writeFileSync(dist('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map(([p, , imgs]) => {
  // each image once, on the page it belongs to: a card on the front door and its own room, a portrait on its thinker
  const own = imgs.filter((i) => (i === '/og.png' ? p === '/' : i.startsWith('/og/q/') ? p === `/q/${i.slice(6, -4)}` : i.startsWith('/og/') ? p === `/s/${i.slice(4, -4)}` : true));
  return `<url><loc>${xml(SITE + p)}</loc><lastmod>${lastmod}</lastmod>${own.map((i) => `<image:image><image:loc>${xml(SITE + i)}</image:loc></image:image>`).join('')}</url>`;
}).join('\n')}
</urlset>
`);
// /api/posts stays open: the Agora's page is drawn from it, and a crawler that runs scripts would otherwise index an
// Agora that "cannot be reached". Every /api and /data answer carries X-Robots-Tag: noindex (vercel.json).
fs.writeFileSync(dist('robots.txt'), `User-agent: *
Allow: /api/posts
Disallow: /api/
Disallow: /admin

Sitemap: ${SITE}/sitemap.xml
`);
const count = (dir) => written.filter(([p]) => p.startsWith(dir)).length;
console.log(`prerendered ${count('/q/')} quotes, ${count('/p/')} philosophers, ${count('/s/')} rooms, library, about, privacy, agora, front door; sitemap ${written.length} urls`);
