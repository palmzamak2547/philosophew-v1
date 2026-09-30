// Typesetting QA: where does every word land? Flags a word split across lines, a line holding a lone letter, word or a
// Thai particle, a line starting with closing punctuation, and text spilling out of its box. Every screen, Thai and
// English, phone to desktop.
//   node scripts/qa-lines.mjs [--base http://localhost:5178] [--only hall,me] [--widths 320,390] [--cards] [--shots]
//     [--engine chromium|webkit|firefox]  (each engine breaks Thai with its own dictionary: sweep all three)
// Writes work/lines/report.json (+ crops of every finding with --shots). Exit code 1 when an error is found.
import * as pw from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const has = (k) => args.includes('--' + k);
const BASE = opt('base', 'http://localhost:5178');
const WIDTHS = (opt('widths', '320,360,375,390,412,430,768,1024,1280,1440,1920')).split(',').map(Number);
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const LANGS = (opt('langs', 'th,en')).split(',');
const ENGINE = opt('engine', 'chromium');
const OUT = ENGINE === 'chromium' ? 'work/lines' : `work/lines-${ENGINE}`;
mkdirSync(OUT + '/shots', { recursive: true });

// ---------- the analyzer, run inside the page ----------
function analyze(rootSel) {
  const GLUE = /^(ๆ|ฯ|หรอก|นะ|ครับ|ค่ะ|คะ|จ้ะ|จ๊ะ|เถอะ|ล่ะ|สิ|เลย|ด้วย|ไหม|มั้ย|เอง|แหละ|น่ะ)$/;
  const CLOSE = /^([,.!?;:)\]”’ๆ»]|…(?=[\s”’"']|$)|["'](?=[\s,.;:!?)\]]|$))/; // a straight quote only when it closes; an ellipsis may open (…Philosophy)
  const seg = new Intl.Segmenter('th', { granularity: 'word' });
  const root = document.querySelector(rootSel) || document.body;
  const hiddenCache = new Map();
  const hidden = (el) => {
    if (hiddenCache.has(el)) return hiddenCache.get(el);
    const cs = getComputedStyle(el);
    const h = cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || (el.parentElement && el.parentElement !== document.documentElement ? hidden(el.parentElement) : false);
    hiddenCache.set(el, h);
    return h;
  };
  const blockOf = (el) => { let b = el; while (b && b.parentElement && getComputedStyle(b).display === 'inline') b = b.parentElement; return b; };
  const path = (el) => { const p = []; for (let e = el; e && e !== document.body && p.length < 4; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')); return p.join(' > '); };
  const issues = [];
  const blocks = new Map();
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let space = true; // a space (or no-break space) came before the next word: that is what makes it a new word
  for (let n; (n = tw.nextNode());) {
    const text = n.nodeValue;
    if (!text || !text.trim()) { space = true; continue; }
    const el = n.parentElement;
    if (!el || el.closest('script,style,noscript,svg,canvas,textarea,input,select,option,[aria-hidden="true"],.sr,.sr-only,[data-lines-skip],.pre')) continue; // .pre: the prerendered text kept, clipped to 1 px, for crawlers (src/ui/shell.ts)
    if (hidden(el)) continue;
    const b = blockOf(el);
    const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    for (const s of seg.segment(text)) {
      if (!/[^\s\u2060]/.test(s.segment)) { if (/\s/.test(s.segment)) space = true; continue; } // a space (joined or not) parts words; a joiner alone does not
      const r = document.createRange();
      r.setStart(n, s.index); r.setEnd(n, s.index + s.segment.length);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
      if (!rects.length) continue;
      const lines = [];
      for (const x of rects) if (!lines.some((y) => Math.abs(y - x.top) < fs * 0.6)) lines.push(x.top);
      const latin = /[A-Za-z]/.test(s.segment);
      if (lines.length > 1 && s.isWordLike) issues.push({ kind: latin ? 'broken-word' : 'broken-thai-word', level: latin ? 'error' : 'warn', text: s.segment, where: path(b) });
      if (!blocks.has(b)) blocks.set(b, []);
      blocks.get(b).push({ t: s.segment, top: rects[0].top, left: rects[0].left, right: rects[rects.length - 1].right, fs, word: s.isWordLike, sp: space });
      space = false;
    }
  }
  for (const [b, words] of blocks) {
    const box = b.getBoundingClientRect(), cs = getComputedStyle(b);
    const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    // lines of this block
    const lines = [];
    for (const w of words) {
      let L = lines.find((l) => Math.abs(l.top - w.top) < w.fs * 0.6);
      if (!L) lines.push(L = { top: w.top, words: [] });
      L.words.push(w);
    }
    lines.sort((a, b2) => a.top - b2.top);
    const txt = (l) => l.words.map((w) => w.t).join('');
    if (lines.length >= 2) lines.forEach((l, i) => {
      const s = txt(l).trim(), visible = [...s.replace(/\s/g, '')];
      const segs = l.words.filter((w) => /\S/.test(w.t));
      if (visible.length <= 2 && !/^\d+$/.test(s)) issues.push({ kind: 'lone-glyph-line', level: 'error', text: s, line: i + 1, of: lines.length, where: path(b), full: lines.map(txt).join(' | ').slice(0, 160) });
      else if (segs.length === 1 && GLUE.test(segs[0].t.trim())) issues.push({ kind: 'particle-alone', level: 'error', text: s, where: path(b), full: lines.map(txt).join(' | ').slice(0, 160) });
      // a last line holding one word under a fuller line: never in a centred block, and worth a look anywhere
      // (words are what a space in the text separates: Jean-Paul is one, "de Beauvoir" two, in every engine)
      const count = (x) => x.words.filter((w, k) => k === 0 || w.sp).length;
      const thaiPhrase = /[\u0E01-\u0E5B]/.test(s) && [...seg.segment(s.replace(/\u2060/g, ''))].filter((x) => /[\p{L}\p{N}]/u.test(x.segment)).length > 1; // a Thai line may end on a whole phrase (a word: any piece with a letter; Firefox calls some Thai words not word-like)
      if (i > 0 && i === lines.length - 1 && !thaiPhrase && count(l) === 1 && count(lines[i - 1]) >= 2 && visible.length > 2) issues.push({ kind: 'lone-word-line', level: cs.textAlign === 'center' ? 'error' : 'warn', text: s, where: path(b), full: lines.map(txt).join(' | ').slice(0, 160) });
      if (i > 0 && CLOSE.test(s)) issues.push({ kind: 'line-starts-with-closer', level: 'error', text: s.slice(0, 20), where: path(b), full: lines.map(txt).join(' | ').slice(0, 160) });
      if (i > 0 && segs.length && GLUE.test(segs[0].t.trim()) && segs.length > 1) issues.push({ kind: 'line-starts-with-particle', level: 'error', text: s.slice(0, 24), where: path(b), full: lines.map(txt).join(' | ').slice(0, 160) });
    });
    // text outside its own box (horizontal spill); a scroller is allowed to scroll
    if (!/auto|scroll/.test(cs.overflowX)) {
      const minL = box.left + (b.clientLeft || 0) - 1.5, maxR = box.left + (b.clientLeft || 0) + b.clientWidth + 1.5;
      const out = words.filter((w) => w.word && (w.right > maxR || w.left < minL));
      if (out.length && b.clientWidth > 0) issues.push({ kind: 'text-overflow', level: 'error', text: out.map((w) => w.t).join(' ').slice(0, 60), where: path(b), box: Math.round(b.clientWidth), pad: [pl, pr] });
    }
  }
  // page-level: nothing wider than the viewport
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    // name the culprit: the innermost visible boxes that reach past the right edge
    const wide = [...document.body.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && !hidden(e); });
    const inner = wide.filter((e) => !wide.some((o) => o !== e && e.contains(o))).slice(0, 3);
    issues.push({ kind: 'page-scrolls-sideways', level: 'error', text: `${document.documentElement.scrollWidth} > ${innerWidth}`, where: inner.map((e) => `${path(e)} "${(e.textContent || '').trim().slice(0, 40)}"`).join(' ; ') });
  }
  return issues;
}

// ---------- seeded state ----------
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const quotes = ['stoic', 'existential', 'eastern', 'absurd', 'socratic'].flatMap((s) => JSON.parse(readFileSync(`public/data/quotes/${s}.json`, 'utf8')));
const roster = Object.values(JSON.parse(readFileSync('public/data/authors.json', 'utf8')));
function state(lang, o = {}) {
  const seen = {}, notes = {}, authors = {}, finish = {};
  quotes.filter((_, i) => i % 9 === 0).slice(0, 48).forEach((q, i) => {
    seen[q.id] = 1; authors[q.author] = Date.now() - i * 3600e3;
    if (i % 3 === 0) notes[q.id] = { quoteId: q.id, school: q.school, author: q.author, text: i % 6 === 0 ? (lang === 'en' ? 'Today I tried letting go of what I cannot control, and it felt lighter.' : 'วันนี้ลองปล่อยวางเรื่องที่ควบคุมไม่ได้ แล้วรู้สึกเบาขึ้นจริงๆ') : '', savedAt: Date.now() - (48 - i) * 86400e3 / 3, updatedAt: Date.now() - i * 3600e3, finish: i % 12 === 0 ? 'gold' : i % 5 === 0 ? 'foil' : 'paper' };
    if (i % 12 === 0) finish[q.id] = 'gold';
  });
  const litDays = Array.from({ length: 23 }, (_, i) => shift(today, -i - (i > 12 ? 2 : 0)));
  return { day: today, streak: 12, best: 14, lit: 23, litDays, oil: 1, flames: 3, xp: 900, pulls: 48, pity: 5, seen, notes, authors, finish, introDone: true, settings: { lang, sound: false, haptics: false, theme: 'light', name: '', volume: 0.8 }, ...o };
}

// ---------- scenarios ----------
const longest = (key) => [...roster].sort((a, b) => (b[key] || '').length - (a[key] || '').length)[0]?.id;
const SC = [
  { name: 'ritual-first', path: '/', fresh: true, act: async (p) => { await p.waitForSelector('.ritual.is-ready', { timeout: 20000 }).catch(() => {}); }, root: '.ritual' },
  { name: 'ritual-first-out', path: '/', fresh: true, act: breathe, root: '.ritual' },
  { name: 'ritual-return-today', path: '/', st: (l) => state(l, { day: shift(today, -1) }), act: breathe, root: '.ritual' },
  { name: 'hall', path: '/' },
  { name: 'feel-sheet', path: '/', act: async (p) => { await p.click('[data-feel]').catch(() => {}); await p.waitForTimeout(600); } },
  ...['stoic', 'existential', 'eastern', 'absurd', 'socratic'].map((s) => ({ name: 'room-' + s, path: '/s/' + s })),
  { name: 'odds-sheet', path: '/s/stoic', act: async (p) => { await p.click('[data-odds]').catch(() => {}); await p.waitForTimeout(600); } },
  { name: 'notes', path: '/notes' },
  { name: 'library', path: '/library' },
  { name: 'person-long-th', path: () => '/p/' + longest('th') },
  { name: 'person-long-en', path: () => '/p/' + longest('en') },
  { name: 'quote', path: () => '/q/' + quotes[3].id },
  { name: 'note-editor', path: () => '/q/' + quotes[3].id, act: async (p) => { await p.click('[data-act="note"]').catch(() => {}); await p.waitForTimeout(700); } },
  { name: 'me', path: '/me' },
  { name: 'profile-sheet', path: '/me', act: async (p) => { await p.click('[data-profile]').catch(() => {}); await p.waitForTimeout(1500); } },
  { name: 'about', path: '/about' },
  { name: 'agora', path: '/agora' },
];
async function breathe(p) {
  await p.waitForSelector('.ritual.is-ready', { timeout: 20000 }).catch(() => {});
  const vp = p.viewportSize();
  await p.mouse.move(vp.width / 2, vp.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(3600);
  await p.mouse.up();
  await p.waitForSelector('.ritual.is-lit', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(2600);
}

// ---------- run ----------
const browser = await pw[ENGINE].launch(ENGINE === 'chromium' ? { args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] } : {});
const report = [];
const jobs = [];
for (const sc of SC) if (!ONLY || ONLY.includes(sc.name)) for (const lang of LANGS) for (const w of WIDTHS) jobs.push({ sc, lang, w });
let done = 0;
async function worker() {
  for (let job; (job = jobs.shift());) {
    const { sc, lang, w } = job;
    const h = w < 700 ? 844 : w < 1100 ? 1024 : 900;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: lang === 'en' ? 'en-GB' : 'th-TH', timezoneId: 'Asia/Bangkok', serviceWorkers: 'block' });
    const st = sc.fresh ? { settings: { lang } } : (sc.st ? sc.st(lang) : state(lang));
    await ctx.addInitScript(([s, fresh]) => { if (!sessionStorage.getItem('qa.seeded')) { sessionStorage.setItem('qa.seeded', '1'); if (fresh) localStorage.clear(); localStorage.setItem('pw.state.v1', JSON.stringify(s)); } }, [st, !!sc.fresh]);
    const page = await ctx.newPage();
    for (let attempt = 0; attempt < 2; attempt++) try {
      // the dev server's client reloads once when Firefox drops its first socket: wait for that load instead of failing
      await page.goto(BASE + (typeof sc.path === 'function' ? sc.path() : sc.path), { waitUntil: 'networkidle', timeout: 30000 })
        .catch(async (e) => { if (!/interrupted by another navigation/.test(e.message)) throw e; await page.waitForLoadState('networkidle', { timeout: 30000 }); });
      await page.evaluate(() => document.fonts.ready);
      if (sc.act) await sc.act(page);
      await page.waitForTimeout(700);
      await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* infinite */ } }));
      await page.waitForTimeout(150);
      const issues = await page.evaluate(analyze, sc.root || 'body');
      for (const i of issues) report.push({ scenario: sc.name, lang, width: w, ...i });
      if (has('shots') && issues.some((i) => i.level === 'error')) await page.screenshot({ path: `${OUT}/shots/${sc.name}-${lang}-${w}.png`, fullPage: true });
      break;
    } catch (e) {
      if (attempt) report.push({ scenario: sc.name, lang, width: w, kind: 'run-failed', level: 'error', text: String(e.message).slice(0, 160) });
    }
    await ctx.close();
    if (++done % 20 === 0) process.stdout.write(`${done} `);
  }
}
await Promise.all(Array.from({ length: Number(opt('workers', 4)) }, worker));
await browser.close();

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const errors = report.filter((r) => r.level === 'error');
const key = (r) => `${r.kind} | ${r.scenario} | ${r.where || ''} | ${r.text}`;
const grouped = new Map();
for (const r of report) { const k = key(r); if (!grouped.has(k)) grouped.set(k, { ...r, at: [] }); grouped.get(k).at.push(`${r.lang}${r.width}`); }
console.log(`\n${report.length} findings (${errors.length} errors) in ${SC.length} screens x ${LANGS.length} languages x ${WIDTHS.length} widths`);
for (const g of [...grouped.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))) {
  console.log(`[${g.level}] ${g.kind}  ${g.scenario}  "${g.text}"  ${g.where || ''}  at ${g.at.join(',')}${g.full ? `\n        ${g.full}` : ''}`);
}
process.exit(errors.length ? 1 : 0);
