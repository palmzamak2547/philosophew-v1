// What search engines and link previews get from a build (run `npm run build` first):
//   node scripts/check-seo.mjs            every page in dist: one title each (unique), a description of 70 to 160
//                                         letters, one canonical pointing at itself, one h1, Open Graph and Twitter
//                                         tags, structured data that parses with the expected types, internal links
//                                         that land on built pages, no middle dot, no share-alike image in structured
//                                         data; plus sitemap.xml, robots.txt, vercel.json headers, the IndexNow key
//                                         and security.txt
//   node scripts/check-seo.mjs --browser  also opens pages in Chromium (dist served by vite preview): without
//                                         JavaScript the text is there; with it the app boots over the page with no
//                                         error, no frame of the static text, no layout shift, and the same h1 and
//                                         title, also for a Googlebot-like visitor (American locale, nothing saved)
// Exits 1 on any failure. Warnings (data another agent owns, a date coming up) do not fail the run.
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const DIST = path.join(root, 'dist');
const SITE = 'https://philosophew.lol';
const fails = [];
const warns = [];
const fail = (where, what) => fails.push(`${where}: ${what}`);
const warn = (where, what) => warns.push(`${where}: ${what}`);
const read = (f) => fs.readFileSync(f, 'utf8');
const letters = new Intl.Segmenter('th', { granularity: 'grapheme' });
const graphemes = (s) => [...letters.segment(s)].length;
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const MIDDLE_DOT = String.fromCharCode(0xb7);
const JOINER = new RegExp(String.fromCharCode(0x2060), 'g'); // the app's word joiners (src/core/thai.ts)
const flat = (s) => s.replace(JOINER, '').replace(new RegExp(String.fromCharCode(0xa0), 'g'), ' ').replace(/\s+/g, ' ').trim();
const THAI = /\p{Script=Thai}/u;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('no dist/index.html: run npm run build first');
  process.exit(1);
}

// ---------- which file answers which address (Vercel: files first, clean URLs, then the app at /) ----------
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(DIST);
const rel = (f) => path.relative(DIST, f).split(path.sep).join('/');
const pages = files.filter((f) => f.endsWith('.html')).map((f) => ({ file: f, url: rel(f) === 'index.html' ? '/' : `/${rel(f).replace(/\.html$/, '')}` }));
const builtPage = (p) => {
  if (p === '/') return true;
  const f = path.join(DIST, p.replace(/\/$/, ''));
  return fs.existsSync(`${f}.html`) || fs.existsSync(path.join(f, 'index.html'));
};
const builtFile = (p) => { const f = path.join(DIST, p); return fs.existsSync(f) && fs.statSync(f).isFile(); };
/** An internal link lands on a built page or a static file (an .html address would be redirected: never link one). */
function lands(href) {
  const u = new URL(unesc(href), `${SITE}/`);
  if (u.origin !== SITE) return true;
  const p = decodeURIComponent(u.pathname);
  if (p.endsWith('.html')) return false;
  return builtPage(p) || builtFile(p);
}

const data = (p) => JSON.parse(read(path.join(root, p)));
const authors = data('public/data/authors.json');
const quoteSchool = new Map(['stoic', 'existential', 'eastern', 'absurd', 'socratic'].flatMap((s) => data(`public/data/quotes/${s}.json`).map((q) => [q.id, s])));
const byPortrait = new Map(Object.values(authors).filter((a) => a.portrait?.file).map((a) => [SITE + a.portrait.file, a]));
const OPEN = /^(public domain|cc0|cc by \d)/i; // what may go into structured data and the image sitemap (never share-alike)
const portraitOk = (url) => { const a = byPortrait.get(url); return !a || (OPEN.test(a.portrait.license || '') && !/SA/i.test(a.portrait.license)); };

const kindOf = (p) => (p === '/' ? 'home' : p.startsWith('/s/') ? 'school' : p.startsWith('/p/') ? 'person' : p.startsWith('/q/') ? 'quote' : p.slice(1));
const EXPECT = {
  home: ['Organization', 'WebSite'],
  school: ['CollectionPage', 'BreadcrumbList'],
  library: ['CollectionPage', 'BreadcrumbList'],
  about: ['AboutPage', 'BreadcrumbList'],
  agora: ['WebPage', 'BreadcrumbList'],
  privacy: ['WebPage', 'BreadcrumbList'],
  person: ['Person', 'BreadcrumbList'],
  quote: ['Quotation', 'BreadcrumbList'],
};
// pw-font / pw-font-ritual: one tag per font file for public/theme.js to preload (vite.config.ts preloadFonts), not SEO
const REPEATABLE = new Set(['theme-color', 'og:locale:alternate', 'pw-font', 'pw-font-ritual']);

// every node of a JSON-LD value, depth first
const nodes = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => nodes(x, out));
  else if (v && typeof v === 'object') { out.push(v); Object.values(v).forEach((x) => nodes(x, out)); }
  return out;
};

// ---------- every page ----------
const titles = new Map();
const facts = new Map(); // url -> { title, h1 }
let largest = { url: '', bytes: 0 };
for (const { file, url } of pages) {
  const h = read(file);
  const at = url;
  const kind = kindOf(url);
  const head = h.slice(0, h.indexOf('</head>'));
  const all = (re) => [...head.matchAll(re)];
  const metas = all(/<meta (name|property)="([^"]+)" content="([^"]*)"[^>]*>/g).map((m) => ({ key: m[2], value: unesc(m[3]) }));
  const meta = (k) => metas.filter((m) => m.key === k).map((m) => m.value);
  const one = (k) => { const v = meta(k); if (v.length !== 1) fail(at, `${v.length} × ${k}`); return v[0] || ''; };
  if (h.length > largest.bytes) largest = { url, bytes: h.length };

  if (!/^<!doctype html>\s*<html lang="th"[\s>]/i.test(h)) fail(at, 'html lang is not "th"');
  // a room, a thinker and a quote paint in their school's colours from the first frame (scripts/prerender.mjs toned)
  const school = kind === 'school' ? url.slice(3) : kind === 'person' ? authors[url.slice(3)]?.schools[0] : kind === 'quote' ? quoteSchool.get(url.slice(3)) : null;
  const tag = h.match(/<html[^>]*>/)?.[0] || '';
  const tone = tag.match(/data-school="([^"]+)"/)?.[1] || null;
  if (tone !== school) fail(at, `the page is toned ${tone} but belongs to ${school}`);
  if (school) {
    const bg = tag.match(/--s-bg:(#[0-9A-Fa-f]{6})/)?.[1];
    const bars = [...head.matchAll(/<meta name="theme-color" content="([^"]*)"/g)].map((m) => m[1]);
    if (!bg || !/data-dark="[01]"/.test(tag) || bars.some((c) => c !== bg)) fail(at, `school tone incomplete (bg ${bg}, bar ${bars.join(' ')})`);
  }
  if (!/<meta charset="utf-8">/i.test(head) || !/<meta name="viewport"/.test(head)) fail(at, 'charset or viewport missing');
  if (meta('theme-color').length < 1) fail(at, 'no theme-color');

  // no tag twice (theme-color has one per colour scheme)
  const seen = new Map();
  metas.forEach((m) => seen.set(m.key, (seen.get(m.key) || 0) + 1));
  for (const [k, n] of seen) if (n > 1 && !REPEATABLE.has(k)) fail(at, `${k} appears ${n} times`);

  const t = all(/<title>([^<]*)<\/title>/g);
  if (t.length !== 1) fail(at, `${t.length} title tags`);
  const title = unesc(t[0]?.[1] || '');
  if (!title) fail(at, 'empty title');
  titles.set(title, [...(titles.get(title) || []), url]);

  const desc = one('description');
  const n = graphemes(desc);
  if (n < 70 || n > 160) fail(at, `description is ${n} letters (70 to 160): ${desc}`);
  if (!THAI.test(desc)) fail(at, 'description is not in Thai');

  const canon = all(/<link rel="canonical" href="([^"]+)">/g);
  if (canon.length !== 1) fail(at, `${canon.length} canonical links`);
  const self = url === '/' ? `${SITE}/` : SITE + url;
  if (canon[0] && canon[0][1] !== self) fail(at, `canonical ${canon[0][1]} is not ${self}`);

  const robots = meta('robots').join(',');
  if (/noindex|none/i.test(robots)) fail(at, `robots says ${robots} on an indexable page`);

  // Open Graph and Twitter
  if (one('og:url') !== self) fail(at, 'og:url is not the canonical');
  if (one('og:title') !== title) fail(at, 'og:title differs from the title');
  if (one('og:description') !== desc) fail(at, 'og:description differs from the description');
  if (one('og:type') !== 'website') fail(at, 'og:type');
  if (one('og:site_name') !== 'Philosophew') fail(at, 'og:site_name');
  if (one('og:locale') !== 'th_TH') fail(at, 'og:locale is not th_TH');
  if (!meta('og:locale:alternate').includes('en_US')) fail(at, 'og:locale:alternate en_US missing');
  const img = one('og:image');
  if (!img.startsWith(`${SITE}/`) || !builtFile(img.slice(SITE.length))) fail(at, `og:image ${img} is not a built file`);
  if (!one('og:image:alt')) fail(at, 'og:image:alt empty');
  if (one('twitter:card') !== 'summary_large_image') fail(at, 'twitter:card is not summary_large_image');
  if (one('twitter:title') !== title || one('twitter:description') !== desc || one('twitter:image') !== img) fail(at, 'twitter tags differ from the page');
  one('twitter:image:alt');

  // one h1, and it is in the page's own text
  const h1s = [...h.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)];
  if (h1s.length !== 1) fail(at, `${h1s.length} h1 elements`);
  const h1 = unesc((h1s[0]?.[0] || '').replace(/<[^>]+>/g, '')).trim();
  facts.set(url, { title, h1 });

  // the static text: there, light, and linked into the site
  const block = h.match(/<!--pre-->([\s\S]*?)<!--\/pre-->/)?.[1] || '';
  if (!block) fail(at, 'no prerendered text');
  if (/<img\b|<picture\b|<video\b/.test(block)) fail(at, 'prerendered text carries media (keep it light)');
  if (/<script\b/.test(block)) fail(at, 'prerendered text carries a script');
  const wantsHall = kind === 'home' || kind === 'school';
  if (wantsHall !== /data-hall>/.test(head)) fail(at, wantsHall ? 'the hall preloads are missing' : 'a flat page preloads the 3D hall');

  // internal links (and the files the head loads)
  const hrefs = [...h.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
  if (!hrefs.some((x) => x.startsWith('/'))) fail(at, 'no internal links');
  for (const x of hrefs) if (!/^(mailto:|https?:\/\/(?!philosophew\.lol))/.test(x) && !lands(x)) fail(at, `link ${x} does not land on a built page`);
  for (const m of head.matchAll(/(?:href|src)="(\/[^"]*)"/g)) if (!builtFile(m[1])) fail(at, `head loads ${m[1]}, which is not built`);

  // structured data
  const blocks = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) fail(at, 'no structured data');
  const types = new Set();
  for (const [, raw] of blocks) {
    let ld;
    try { ld = JSON.parse(raw); } catch (e) { fail(at, `structured data does not parse: ${e.message}`); continue; }
    if (ld['@context'] !== 'https://schema.org') fail(at, `@context is ${ld['@context']}`);
    const all = nodes(ld);
    all.forEach((x) => x['@type'] && [].concat(x['@type']).forEach((ty) => types.add(ty)));
    for (const x of all) {
      // images: ours must exist and be public domain, CC0 or CC BY (never share-alike)
      for (const v of [x.image, x.url, x.contentUrl].flat().filter((v) => typeof v === 'string' && v.includes('/portraits/'))) {
        if (!portraitOk(v)) fail(at, `share-alike or unlicensed portrait in structured data: ${v}`);
        if (!builtFile(v.slice(SITE.length))) fail(at, `structured data image ${v} is not built`);
      }
      for (const k of ['url', 'item', '@id']) {
        const v = x[k];
        if (typeof v === 'string' && v.startsWith(SITE) && !v.includes('/portraits/') && !v.includes('?') && !lands(v.split('#')[0])) fail(at, `structured data ${k} ${v} does not land on a built page`);
      }
      if (x['@type'] === 'BreadcrumbList') {
        const items = x.itemListElement || [];
        items.forEach((it, i) => {
          if (it.position !== i + 1 || !it.name) fail(at, `breadcrumb ${i + 1} is malformed`);
          if (i < items.length - 1 && !it.item) fail(at, `breadcrumb ${i + 1} has no item`);
        });
        if (items.length < 2) fail(at, 'breadcrumb shorter than two steps');
      }
      if (x['@type'] === 'Quotation' && x.text && (!x.creator?.['@id'] || !x.inLanguage)) fail(at, 'Quotation without creator @id or language');
      if (x['@type'] === 'Person' && x.sameAs && [].concat(x.sameAs).some((s) => !/^https:\/\//.test(s))) fail(at, 'Person sameAs is not https');
      if (x['@type'] === 'Organization') {
        if (!x.logo?.url || !builtFile(x.logo.url.slice(SITE.length))) fail(at, 'Organization logo is not a built file');
        if (!Array.isArray(x.sameAs)) fail(at, 'Organization sameAs is not an array');
        if (!/^[^@\s]+@[^@\s]+$/.test(x.email || '') || x.contactPoint?.['@type'] !== 'ContactPoint' || x.contactPoint.email !== x.email) fail(at, 'Organization email or contactPoint');
        if (!x.sameAs?.length) warn(at, 'Organization.sameAs is empty: add the social profiles once they exist (scripts/prerender.mjs SOCIAL)');
      }
      if (x['@type'] === 'SearchAction') {
        const tpl = x.target?.urlTemplate || '';
        if (!tpl.startsWith(`${SITE}/library?q=`) || !tpl.includes('{search_term_string}') || x['query-input'] !== 'required name=search_term_string') fail(at, 'SearchAction target');
      }
    }
  }
  for (const ty of EXPECT[kind] || []) if (!types.has(ty)) fail(at, `structured data lacks ${ty}`);
  if (!EXPECT[kind]) fail(at, `a page kind nobody expected (${kind})`);
  // a thinker's portrait is in Person.image exactly when its licence allows it
  const who = kind === 'person' ? authors[url.slice(3)] : null;
  // a papyrus stands in where no likeness survives (Musonius Rufus): never the person's image
  const open = !!who?.portrait?.file && who.portrait.kind !== 'symbol' && who.portrait.kind !== 'papyrus' && portraitOk(SITE + who.portrait.file) && OPEN.test(who.portrait.license || '');
  if (who && open !== types.has('ImageObject')) fail(at, open ? 'an open-licence portrait is missing from Person.image' : 'Person.image carries a portrait it may not');
}
for (const [t, urls] of titles) if (urls.length > 1) fail(urls.join(', '), `share the title "${t}"`);

// ---------- sitemap ----------
const sitemap = read(path.join(DIST, 'sitemap.xml'));
if (!sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"') || !sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')) fail('sitemap.xml', 'namespaces');
const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
  loc: unesc(m[1].match(/<loc>([^<]+)<\/loc>/)?.[1] || ''),
  lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || '',
  images: [...m[1].matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((x) => unesc(x[1])),
}));
const listed = new Set();
for (const e of entries) {
  if (listed.has(e.loc)) fail('sitemap.xml', `${e.loc} twice`);
  listed.add(e.loc);
  if (!e.loc.startsWith(SITE) || !lands(e.loc)) fail('sitemap.xml', `${e.loc} is not a built page`);
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d\d:\d\d))?$/.test(e.lastmod)) fail('sitemap.xml', `${e.loc} lastmod "${e.lastmod}"`);
  for (const i of e.images) {
    if (!i.startsWith(SITE) || !builtFile(i.slice(SITE.length))) fail('sitemap.xml', `image ${i} is not built`);
    if (!portraitOk(i)) fail('sitemap.xml', `share-alike portrait ${i}`);
  }
}
for (const { url } of pages) if (!listed.has(url === '/' ? `${SITE}/` : SITE + url)) fail('sitemap.xml', `${url} is built but not listed`);
if (entries.length !== pages.length) fail('sitemap.xml', `${entries.length} URLs for ${pages.length} pages`);

// ---------- robots.txt ----------
const robots = read(path.join(DIST, 'robots.txt'));
const rules = robots.split('\n').map((l) => l.trim());
for (const want of ['User-agent: *', 'Disallow: /admin', 'Disallow: /api/', 'Allow: /api/posts', `Sitemap: ${SITE}/sitemap.xml`]) if (!rules.includes(want)) fail('robots.txt', `missing "${want}"`);
for (const r of rules.filter((l) => /^Disallow:/i.test(l))) {
  const p = r.split(':')[1].trim();
  if (!['/admin', '/api/'].includes(p)) fail('robots.txt', `unexpected ${r} (pages need /data, /assets and /portraits to render)`);
}

// ---------- vercel.json ----------
const vercel = data('vercel.json');
if (vercel.cleanUrls !== true) fail('vercel.json', 'cleanUrls is not true');
const last = vercel.rewrites?.at(-1);
// the app answers every route, never a file: a missing /assets/x.js must 404, not come back as HTML cached for a year
if (last?.destination !== '/' || !/^\/\(\(\?!/.test(last?.source || '') || new RegExp(`^${last.source}$`).test('/assets/gone-123.js') || !new RegExp(`^${last.source}$`).test('/q/AbC123') || !new RegExp(`^${last.source}$`).test('/library'))
  fail('vercel.json', 'the app fallback must rewrite routes (not files) to /');
// the site-wide rule for a source: a rule scoped with `has` (the vercel.app host's noindex) is not the site's own
const headerOf = (source, key) => vercel.headers?.find((h) => h.source === source && !h.has)?.headers.find((x) => x.key === key)?.value;
for (const s of ['/data/(.*)', '/api/(.*)', '/(notes|me|admin|link)']) if (headerOf(s, 'X-Robots-Tag') !== 'noindex') fail('vercel.json', `${s} lacks X-Robots-Tag: noindex`);
for (const [s, k] of [['/assets/(.*)', 'Cache-Control'], ['/portraits/(.*)', 'Cache-Control'], ['/data/(.*)', 'Cache-Control'], ['/api/posts', 'x-vercel-enable-rewrite-caching'], ['/(.*)', 'Content-Security-Policy'], ['/(.*)', 'X-Frame-Options']]) if (!headerOf(s, k)) fail('vercel.json', `${s} lost its ${k}`);

// ---------- IndexNow key ----------
// the live site's key is not in this repository: set INDEXNOW_KEY to check your own key file
const key = process.env.INDEXNOW_KEY || '';
if (!key) warn('IndexNow', 'INDEXNOW_KEY is not set: no key file checked');
else if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) fail('IndexNow', `key "${key}" is not 8 to 128 letters, digits or dashes`);
else if (!builtFile(`/${key}.txt`) || read(path.join(DIST, `${key}.txt`)).trim() !== key) fail('IndexNow', `dist/${key}.txt must hold the key`);

// ---------- security.txt (RFC 9116) ----------
const secFile = path.join(DIST, '.well-known', 'security.txt');
if (!fs.existsSync(secFile)) warn('security.txt', 'no public/.well-known/security.txt (the live site\'s own is not in this repository)');
else {
  const sec = read(secFile);
  const field = (k) => sec.match(new RegExp(`^${k}: *(.+)$`, 'mi'))?.[1].trim();
  if (!/^mailto:[^@\s]+@[^@\s]+$|^https:\/\//.test(field('Contact') || '')) fail('security.txt', 'Contact');
  const exp = Date.parse(field('Expires') || '');
  if (!exp) fail('security.txt', 'Expires is not a date');
  else if (exp < Date.now()) fail('security.txt', `expired on ${field('Expires')}: renew public/.well-known/security.txt`);
  else if (exp - Date.now() < 60 * 864e5) warn('security.txt', `expires ${field('Expires')}: renew public/.well-known/security.txt`);
  if (!field('Preferred-Languages')) fail('security.txt', 'Preferred-Languages');
  if (field('Canonical') !== `${SITE}/.well-known/security.txt`) fail('security.txt', 'Canonical');
}

// ---------- no middle dot ----------
const TEXT = /\.(html|xml|txt|json|webmanifest|js|css|svg)$/;
for (const f of files.filter((x) => TEXT.test(x))) {
  const s = read(f);
  if (!s.includes(MIDDLE_DOT)) continue;
  const n = s.split(MIDDLE_DOT).length - 1;
  // the library's lines are the library agent's data (Greek ano teleia, which NFC turns into a middle dot)
  if (rel(f).startsWith('data/library/')) warn(rel(f), `${n} middle dot(s) in library data (owner: library agent)`);
  else fail(rel(f), `${n} middle dot(s)`);
}

const gz = gzipSync(read(path.join(DIST, `${largest.url === '/' ? 'index' : largest.url.slice(1)}.html`))).length;
console.log(`checked ${pages.length} pages, ${entries.length} sitemap URLs; largest page ${largest.url} ${(largest.bytes / 1024).toFixed(1)} KB (${(gz / 1024).toFixed(1)} KB gzipped)`);

// ---------- in a browser ----------
if (process.argv.includes('--browser')) await browserChecks();

// the same problem on many pages reads as one line
const grouped = (list) => {
  const by = new Map();
  for (const x of list) {
    const i = x.indexOf(': ');
    const [where, what] = i < 0 ? ['', x] : [x.slice(0, i), x.slice(i + 2)];
    by.set(what, [...(by.get(what) || []), where]);
  }
  return [...by].map(([what, where]) => (where.length > 3 ? `${what} (${where.length} places: ${where.slice(0, 3).join(', ')}, ...)` : `${where.join(', ')}: ${what}`));
};
for (const w of grouped(warns)) console.log(`warn  ${w}`);
for (const f of grouped(fails)) console.log(`FAIL  ${f}`);
console.log(fails.length ? `${fails.length} failures` : 'all SEO checks passed');
process.exit(fails.length ? 1 : 0);

async function browserChecks() {
  const { preview } = await import('vite');
  const { chromium } = await import('playwright');
  const server = await preview({ root, logLevel: 'silent', preview: { port: 4190, strictPort: false, open: false } });
  const base = (server.resolvedUrls?.local?.[0] || 'http://localhost:4190/').replace(/\/$/, '');
  const browser = await chromium.launch();
  const firstQuote = (s) => data(`public/data/quotes/${s}.json`)[0].id;
  const FLAT = ['/library', '/about', '/agora', '/p/socrates', '/p/marcus-aurelius', `/q/${firstQuote('stoic')}`, `/q/${firstQuote('eastern')}`];
  const HALL = ['/', '/s/stoic', '/s/absurd'];
  const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  const VISITORS = [
    ['Thai reader', { locale: 'th-TH', timezoneId: 'Asia/Bangkok' }],
    ['Googlebot-like', { locale: 'en-US', timezoneId: 'America/Los_Angeles', userAgent: GOOGLEBOT }],
  ];
  const lines = [];
  // Before any page script: count frames painted while the static text is visible and the app is not up yet, and add
  // up layout shifts. requestAnimationFrame runs just before each paint.
  const WATCH = () => {
    const w = (window.__seo = { staticFrames: 0, shift: 0 });
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) w.shift += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* no layout-shift support */ }
    const tick = () => {
      const pre = document.querySelector('.pre');
      if (pre) {
        const r = pre.getBoundingClientRect();
        if (getComputedStyle(pre).visibility === 'visible' && r.width > 2 && r.height > 2) w.staticFrames++;
      }
      if (performance.now() < 10000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const fresh = async (opts, js = true) => {
    const ctx = await browser.newContext({ ...opts, javaScriptEnabled: js, serviceWorkers: 'block', viewport: { width: 412, height: 915 } });
    if (js) {
      await ctx.addInitScript(WATCH);
      // a slow entry script: the page is parsed and styled long before the app runs, the worst case for a flash
      await ctx.route(/\/assets\/index-[^/]+\.js$/, async (r) => { await new Promise((ok) => setTimeout(ok, 1200)); await r.continue(); });
    }
    return ctx;
  };
  const open = async (ctx, p) => {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/\/api\//.test(m.location()?.url || '')) errors.push(m.text()); }); // no API behind vite preview
    await page.goto(base + p, { waitUntil: 'load' });
    return { page, errors };
  };

  try {
    // 1. without JavaScript, the static page is the page
    for (const p of [...HALL, ...FLAT]) {
      const ctx = await fresh(VISITORS[0][1], false);
      const { page } = await open(ctx, p);
      const r = await page.evaluate(() => {
        const pre = document.querySelector('.pre');
        const rect = pre?.getBoundingClientRect();
        return { visible: !!pre && getComputedStyle(pre).visibility === 'visible' && rect.width > 200 && rect.height > 200, h1: document.querySelector('h1')?.textContent.trim(), links: document.querySelectorAll('.pre a[href^="/"]').length, text: pre?.innerText.length || 0 };
      });
      if (!r.visible) fail(`no-JS ${p}`, 'the static text is not visible');
      if (flat(r.h1 || '') !== flat(facts.get(p)?.h1 || '?')) fail(`no-JS ${p}`, `h1 "${r.h1}"`);
      if (r.links < 3 || r.text < 200) fail(`no-JS ${p}`, `only ${r.links} links, ${r.text} letters`);
      lines.push(`no-JS          ${p.padEnd(22)} h1 "${r.h1}", ${r.links} links, ${r.text} letters`);
      await ctx.close();
    }

    // 2. with JavaScript, the app boots over it, for a Thai reader and for a stateless American visitor (Googlebot)
    for (const [who, opts] of VISITORS) {
      for (const p of [...FLAT, ...HALL]) {
        const ctx = await fresh(opts);
        const { page, errors } = await open(ctx, p);
        const hall = HALL.includes(p);
        await page.waitForSelector(hall ? '#screen' : '#screen h1', { timeout: 30000 }).catch(() => fail(`${who} ${p}`, 'the app did not draw the page'));
        await page.waitForTimeout(hall ? 2500 : 800);
        const r = await page.evaluate(() => ({
          // behind the lamp the static page stays, clipped to nothing but readable (src/ui/shell.ts); once the app
          // has drawn its own page (no lamp), it must be gone: one h1, never two
          staticLeft: (() => { const pre = document.querySelector('.pre'); if (!pre) return false; const kept = pre.classList.contains('pre--kept') && pre.getBoundingClientRect().width <= 1; return !(kept && document.documentElement.classList.contains('has-ritual')); })(),
          frames: window.__seo.staticFrames,
          shift: window.__seo.shift,
          h1: document.querySelector('#screen h1')?.textContent || '',
          title: document.title,
          lang: document.documentElement.lang,
          noindex: !!document.querySelector('meta[data-noindex]'),
          ritual: document.documentElement.classList.contains('has-ritual'),
        }));
        const at = `${who} ${p}`;
        if (errors.length) fail(at, `errors: ${errors.join(' | ').slice(0, 300)}`);
        if (r.staticLeft) fail(at, 'the static text is still in the page after the app booted');
        if (r.frames) fail(at, `${r.frames} frame(s) painted the static text before the app`);
        if (r.shift > 0.1) fail(at, `layout shift ${r.shift.toFixed(3)}`);
        if (r.noindex) fail(at, 'a real page says noindex');
        if (!hall) {
          // no cloaking: the app's heading and title are the ones the static page gave crawlers, in Thai for both visitors
          if (flat(r.h1) !== flat(facts.get(p).h1)) fail(at, `the app's h1 "${flat(r.h1)}" differs from the static "${facts.get(p).h1}"`);
          if (r.title !== facts.get(p).title) fail(at, `the app's title "${r.title}" differs from the static "${facts.get(p).title}"`);
          if (r.lang !== 'th') fail(at, `renders in "${r.lang}", not Thai`);
        }
        lines.push(`${who.padEnd(15)}${p.padEnd(22)} lang ${r.lang}, ${r.frames} static frames, shift ${r.shift.toFixed(3)}${r.ritual ? ', lamp up' : ''}, title "${r.title.slice(0, 48)}"`);
        await ctx.close();
      }
    }

    // 3. pages that do not exist say noindex once the app has looked; the next real page takes it back
    for (const p of ['/nope', '/s/nope', '/q/nope', '/p/nobody']) {
      const ctx = await fresh(VISITORS[1][1]);
      const { page } = await open(ctx, p);
      const ok = await page.waitForSelector('meta[name="robots"][data-noindex]', { state: 'attached', timeout: 20000 }).then(() => true, () => false);
      if (!ok) fail(`not found ${p}`, 'no noindex');
      await page.evaluate(() => { const a = document.createElement('a'); a.href = '/library'; document.body.append(a); a.click(); });
      await page.waitForSelector('#screen .library h1', { timeout: 20000 }).catch(() => {});
      const still = await page.evaluate(() => !!document.querySelector('meta[data-noindex]'));
      if (still) fail(`not found ${p}`, 'the noindex stayed after moving on to the library');
      lines.push(`not found      ${p.padEnd(22)} noindex ${ok ? 'yes' : 'NO'}, cleared on the next page ${still ? 'NO' : 'yes'}`);
      await ctx.close();
    }

    // 4. the search box the WebSite markup promises: /library?q=
    {
      const ctx = await fresh(VISITORS[0][1]);
      const { page, errors } = await open(ctx, `/library?q=${encodeURIComponent('Seneca')}`);
      await page.waitForSelector('[data-results] .ptiles a[href="/p/seneca"]', { timeout: 20000 }).catch(() => fail('/library?q=Seneca', 'no result for Seneca'));
      const v = await page.evaluate(() => document.querySelector('input[data-q]')?.value);
      if (v !== 'Seneca') fail('/library?q=Seneca', `the search box holds "${v}"`);
      if (errors.length) fail('/library?q=Seneca', errors.join(' | '));
      lines.push(`search         /library?q=Seneca      box "${v}"`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(lines.join('\n'));
}
