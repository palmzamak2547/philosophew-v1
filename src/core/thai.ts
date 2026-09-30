// Thai line breaking that reads as if a person set it. Browsers only know dictionary words, so they will
// happily start a line with หรอก, ๆ or the ร์ of โบวัวร์, and they split names the dictionary has never seen.
// Here each space-separated phrase stays whole while it fits; inside a phrase, particles stick to the word before
// them, a silent final or trailing vowel never starts a line, and a thinker's name never breaks.
import { html, type Html } from './dom';

const GLUE = /^(ๆ|ฯ|หรอก|นะ|ครับ|ค่ะ|คะ|จ้ะ|จ๊ะ|เถอะ|ล่ะ|สิ|เลย|ด้วย|ไหม|มั้ย|เอง|แหละ|น่ะ|[,.!?;:)\]”’"'…]+)$/;
// a piece no line may start with: a silent final (ร์, อร์ of เออร์, ตส์ of การ์ตส์), a lone consonant (the ท of
// สุภัทโท), or a vowel or mark that follows its consonant. The dictionary splits unknown words this way.
const TAIL = /^([ก-ฮ]{1,2}[ิุ]?์|[ก-ฮ][่-๋]?$|[ะาำๅัิ-ฺ็-๎])/;
const HEAD = /[เแโใไั็]$/; // a leading vowel, or ั and ็ that need the consonant after them
// words that never end a line: they belong with what follows (ของ|จักรวาล, และ|นั่นแหละ, สิ่งที่|เลือก)
// and the prefixes that make a word of what follows (การ|กระทำ, ความ|สุข, ผู้|คน, นัก|ปรัชญา)
const NEXT = /^(และ|หรือ|แต่|ซึ่ง|ของ|กับ|ใน|ที่|จาก|ถึง|แห่ง|เพื่อ|โดย|ว่า|การ|ความ|ผู้|นัก)$/;
const OPEN = /^[(\[“‘"']+$/; // an opening quote or bracket belongs to the word after it
const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const JOIN = '\u2060'; // word joiner: no break here even when the phrase has to wrap
const names = new Set<string>();

/** Words that must never break inside (Thai name parts: transliterations the dictionary does not know). */
export function protect(words: Iterable<string>) {
  for (const w of words) if (w.length >= 3 && /[ก-๛]/.test(w)) names.add(w);
}

// words a Thai dictionary keeps whole but the browser's splits (เศร้า|หมอง): public/data/thai-words.json, built
// by scripts/thai-words.py and .mjs from every Thai line the app shows
const known = new Set<string>();
/** Dictionary words to hold together; loaded after startup, then the page is set again (retypeset). */
export function protectWords(words: Iterable<string>) { for (const w of words) known.add(w); }

/** Words of one phrase, joined where a line must not break. */
export function wordsOf(phrase: string): string[] {
  if (!seg) return [phrase];
  const held: [number, number][] = [];
  for (const n of names) for (let k = phrase.indexOf(n); k >= 0; k = phrase.indexOf(n, k + n.length)) held.push([k, k + n.length]);
  const segs = [...seg.segment(phrase)];
  // a run of up to five pieces that spells a known word stays together (a Set lookup per run: fast on long pages)
  const hold = new Set<number>();
  if (known.size) for (let i = 0; i < segs.length - 1; i++) {
    let w = segs[i].segment;
    for (let j = i + 1; j < Math.min(segs.length, i + 5); j++) {
      w += segs[j].segment;
      if (known.has(w)) for (let k = i + 1; k <= j; k++) hold.add(k);
    }
  }
  const out: string[] = [];
  let prev = '';
  segs.forEach(({ segment, index }, i) => {
    const glue = out.length && (GLUE.test(segment) || TAIL.test(segment) || OPEN.test(prev) || HEAD.test(prev) || NEXT.test(prev) || hold.has(i) || held.some(([a, b]) => index > a && index < b));
    if (glue) out[out.length - 1] += JOIN + segment;
    else out.push(segment);
    prev = segment;
  });
  return out;
}

// ๆ and ฯ, and a particle standing alone after a space, belong to the phrase before them: จริง ๆ, ประหลาด ๆ ด้วย.
// The space stays (it is how Thai writes ๆ) but becomes one no line may break at.
const LEAN = /^([ๆฯ]|(หรอก|นะ|ครับ|ค่ะ|คะ|จ้ะ|จ๊ะ|เถอะ|ล่ะ|สิ|เลย|ด้วย|ไหม|มั้ย|เอง|แหละ|น่ะ)$)/;
const lean = (text: string) => text.replace(/[ \t\n\r]+(\S+)/g, (m, word: string) => (LEAN.test(word) ? '\u00a0' + word : m));

// a number keeps its unit (12 วัน) and its label (Best: 14); initials and particles keep the name they belong to
// (W. D. Ross, Simone de Beauvoir, Diogenes of Sinope, ซีมอน เดอ โบวัวร์): no-break spaces, in any language
const NUM_UNIT = /(\d[\d,.]*) (?=[ก-๛])/g, LABEL_NUM = /: (\d)/g, INITIAL = /\b([A-Z]\.) (?=[A-Z])/g;
const PARTICLE = /(^|[\s(])(de|del|della|der|den|des|di|da|du|von|van|ter|of|y|la|le|ibn|bin|เด|เดอ|ดิ|ดา|ฟอน|ฟาน|แวน) (?=[A-ZÀ-Þก-ฮเ-ไ])/g;
const NB = '\u00a0';
// a number keeps the Thai word that introduces it (ระดับ 8, ถึง 1955, วันที่ 7), not any word before it: จุดแล้ว 23 ดวง
// must still break before 23 on a narrow phone
const WORD_NUM = /(ถึง|ระดับ|ที่|ข้อ|บท|เล่ม|หน้า|ภาค|ตอน|ปี|ค\.ศ\.|พ\.ศ\.|เลข|ฉบับ|อีก) (?=\d)/g;
const nobreak = (s: string) => s.replace(NUM_UNIT, `$1${NB}`).replace(WORD_NUM, `$1${NB}`).replace(LABEL_NUM, `:${NB}$1`).replace(INITIAL, `$1${NB}`).replace(PARTICLE, `$1$2${NB}`);

/**
 * Phrase spans (kept on one line while they fit) holding the words. With `words`, each word is its own
 * span numbered by --i, for staggered entrances. A closing word never stands alone on the last line: it keeps
 * the word before it (a Thai ending is a whole phrase already).
 */
export function phrases(text: string, opts: { words?: boolean } = {}): Html[] {
  let i = 0;
  const chunks = lean(nobreak(text)).split(/([ \t\n\r]+)/).filter(Boolean), n = chunks.length;
  const [a, z] = [chunks[n - 3], chunks[n - 1]];
  // ponytail: a character count stands in for width. Up to 22 letters the two are tied (a no-break space); longer, up
  // to 32 (indubitable conclusions.), they become one phrase, held on one line only once measured to fit (fitPhrases),
  // so a narrow box can still part them rather than overflow
  // (a word-by-word entrance keeps the tie only: its words are boxes of their own, and a space between two would vanish)
  const most = opts.words ? 22 : 32;
  if (n >= 5 && /^\s+$/.test(chunks[n - 2]) && !THAI.test(a + z) && (a + z).length <= most) chunks.splice(n - 3, 3, a + ((a + z).length <= 22 ? NB : ' ') + z);
  return chunks.map((chunk) => {
    if (/^\s+$/.test(chunk)) return html` `;
    const ws = wordsOf(chunk);
    const inner = opts.words ? ws.map((w) => html`<span class="w" style="--i:${i++}">${w}</span>`) : ws.join('');
    return html`<span class="ph">${inner}</span>`;
  });
}

/** The width a line can take inside the nearest box that holds lines (an inline parent has no width of its own). */
function lineWidth(el: HTMLElement | null) {
  while (el && /^(inline|contents)$/.test(getComputedStyle(el).display)) el = el.parentElement;
  if (!el) return 0;
  const cs = getComputedStyle(el);
  return el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
}

/**
 * After layout (and on resize): keep each phrase on one line where it fits; a wider one wraps between words.
 * Layout widths (offsetWidth), not painted ones, so a scaled card or a sliding word cannot fool it.
 */
export function fitPhrases(root: ParentNode, again = true) {
  // Phrases wrap normally unless proven to fit: hold each on one line, measure, release the ones too wide.
  // If this never runs (or runs early), text still wraps; it can never overflow its card.
  // Read every line width first, with nothing held: a box that sizes to its content would otherwise
  // grow to fit the held phrase and then report that it fits.
  const all = [...root.querySelectorAll<HTMLElement>('.ph')];
  all.forEach((ph) => ph.classList.remove('ph--keep'));
  const lines = all.map((ph) => lineWidth(ph.parentElement));
  all.forEach((ph) => ph.classList.add('ph--keep'));
  // Firefox keeps a break it already found between two of a phrase's no-wrap runs (span.nb, below) when the phrase is
  // then held (measured in 155: "self- | evident." inside a nowrap span); taking the phrase's box away once and
  // giving it back (one forced layout for all of them) makes it break the phrase afresh
  const runsIn = all.filter((ph) => ph.querySelector('.nb'));
  if (runsIn.length) {
    runsIn.forEach((ph) => { ph.style.display = 'none'; });
    void (root as Element | Document).querySelector?.('.ph')?.getBoundingClientRect();
    runsIn.forEach((ph) => { ph.style.display = ''; });
  }
  const widths = all.map((ph) => ph.offsetWidth);
  all.forEach((ph, i) => { if (!lines[i] || widths[i] > lines[i] + 0.5) ph.classList.remove('ph--keep'); });
  fitWide(root);
  // measuring forces layout, which is when the browser starts fetching a face it has not needed yet;
  // fallback fonts set wider or narrower, so measure again once the real ones arrive
  if (again && document.fonts?.status === 'loading') void document.fonts.ready.then(() => fitPhrases(root, false));
}

/**
 * A display heading never breaks a word: when its longest word (a long name, a Thai phrase) is wider than the
 * box, the heading steps down in size until it fits, to two thirds at most.
 */
const WIDE = '.display, .h1, .h2, .hall__title, .person__name, .room__name, .ritual__word';
export function fitWide(root: ParentNode) {
  const els = [...(root instanceof Element && root.matches(WIDE) ? [root] : []), ...root.querySelectorAll<HTMLElement>(WIDE)] as HTMLElement[];
  for (const el of els) {
    if (el.style.fontSize) el.style.fontSize = '';
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const base = parseFloat(getComputedStyle(el).fontSize);
    for (let f = base * 0.95; f >= base * 0.66 && el.scrollWidth > el.clientWidth + 1; f *= 0.95) el.style.fontSize = `${f.toFixed(1)}px`;
  }
}

const THAI = /[\u0E01-\u0E5B]/;
/** The same joins as wordsOf, written into plain text: anything the app shows, no markup and no measuring. */
export function setThai(text: string) {
  const v = nobreak(text);
  if (!THAI.test(v)) return v;
  // a short phrase (ส่วนสิ่งที่ออกมา) never breaks inside; a longer one breaks only between its words
  return lean(v.replace(/\u2060/g, '')).split(/([ \t\n\r]+)/).map((c) => (THAI.test(c) ? wordsOf(c).join(c.length <= 16 ? JOIN : '') : c)).join('');
}
// Firefox breaks Thai at a word joiner as if it were not there (measured in 155, and ZWNBSP and keep-all with it);
// where that happens, each joined run is held by a no-wrap span instead. Measured once rather than read from the
// browser's name, so an engine that learns the joiner goes back to plain text.
let joinerHolds: boolean | undefined;
function joinersHold() {
  if (joinerHolds === undefined) {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:1px;font:16px/20px serif';
    probe.textContent = `ของ${JOIN}ตัว${JOIN}เอง`; // Firefox's dictionary breaks ของตัว|เอง
    document.body.append(probe);
    joinerHolds = probe.offsetHeight <= 20;
    probe.remove();
  }
  return joinerHolds;
}
let made = new WeakSet<Text>(); // text this pass split off itself: already set
/** The words a joiner holds together, as runs; everything between them stays loose (Thai writes no spaces). */
export function runs(v: string): [string, boolean][] {
  const segs = [...seg!.segment(v)].map((s) => s.segment);
  const out: [string, boolean][] = [];
  // a no-break space ties too: Firefox breaks between one and a no-wrap span ("the | conclusions."), so they share it
  const tie = (c: string | undefined) => c === JOIN || c === NB;
  segs.forEach((s, i) => {
    const last = out[out.length - 1];
    // a joiner, alone or at either end of a segment, ties exactly the segments on each side of it
    if (i > 0 && (tie(s[0]) || tie(segs[i - 1].at(-1)))) {
      if (last[1]) { last[0] += s; return; }
      const prev = segs[i - 1];
      last[0] = last[0].slice(0, -prev.length);
      if (!last[0]) out.pop();
      out.push([prev + s, true]);
    } else if (s.includes(JOIN)) out.push([s, true]); // a segmenter that never breaks at a joiner hands over the run
    else if (last && !last[1]) last[0] += s;
    else out.push([s, false]);
  });
  return out;
}
// The last word of a block never stands alone on its line: it keeps the word before it when the two are short and
// Latin (a Thai line ends on a whole phrase anyway). text-wrap: pretty does this in Chrome and Safari, but not on a
// narrow phone and not at all in Firefox.
const BLOCK = 'p, li, dd, dt, h1, h2, h3, h4, blockquote, figcaption, td, th, a, button, label, div, .btn, .chip'; // a card is often a link
const WIDOW = /(^|[\s\S]*\s)(\S+) (\S+)\s*$/;
export function widont(v: string) {
  const m = WIDOW.exec(v);
  if (m && !THAI.test(m[2] + m[3]) && (m[2] + m[3]).length <= 22 && /\S/.test(m[1])) { // three Latin words at least
    return `${m[1]}${m[2]}\u00a0${m[3]}${v.slice(m[1].length + m[2].length + m[3].length + 1)}`;
  }
  // Thai: a short last word (กัน, ได้, ใคร, ธรรมดา: six letters at most) keeps the word before it, so the block never ends
  // on it alone. A word is any piece with a letter or digit in it: engines disagree on which Thai pieces are "word-like" (Firefox calls
  // และ, ก็ and หมด not words, and hands a joiner over as a piece of its own), so Firefox once left หมด” and ได้” alone
  const at = v.search(/\S+\s*$/), tail = at < 0 ? '' : v.slice(at);
  if (!seg || !THAI.test(tail)) return v;
  const segs = [...seg.segment(tail)].map((s) => s.segment);
  const words = segs.flatMap((s, i) => (/[\p{L}\p{N}]/u.test(s) ? [i] : []));
  if (words.length < 2) return v;
  const k = words[words.length - 1], j = words[words.length - 2];
  // a joiner inside the last piece means a tie is already there: the word breaker reads "ตลอด\u2060ไป" as one word once it is
  // joined, so without this a second pass would tie it again to the word before (setting twice must change nothing)
  const held = segs[j].endsWith(JOIN) || segs[k].includes(JOIN) || segs.slice(j + 1, k).some((s) => s.includes(JOIN));
  if (segs[k].split(JOIN).join('').length > 6 || held) return v;
  return v.slice(0, at) + segs.slice(0, k).join('') + JOIN + segs.slice(k).join('');
}
function setText(root: Node) {
  const one = (n: Text, closing = false) => {
    if (made.has(n) || !n.parentNode || n.parentElement?.closest('.nb')) return;
    const set = setThai(n.data), v = closing ? widont(set) : set;
    if (!v.includes(JOIN) || !seg || joinersHold()) { if (v !== n.data) n.data = v; return; }
    // in a grid or flex box the text was one item: keep it one (a wrapper), or each run would become its own cell
    const box = n.parentElement ? getComputedStyle(n.parentElement).display : '';
    const f = /flex|grid/.test(box) ? document.createElement('span') : document.createDocumentFragment();
    for (const [s, held] of runs(v)) {
      if (held) {
        const span = document.createElement('span');
        span.className = 'nb';
        span.textContent = s;
        f.append(span);
      } else { const t = document.createTextNode(s); made.add(t); f.append(t); }
    }
    n.replaceWith(f);
  };
  if (root.nodeType === 3) return one(root as Text);
  if (root.nodeType !== 1 || (root as Element).closest('script, style, textarea, [contenteditable], svg')) return;
  // collect first: a node replaced mid-walk would end the walk
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), all: Text[] = [];
  for (let n; (n = w.nextNode());) if (!n.parentElement?.closest('script, style, textarea, [contenteditable], svg')) all.push(n as Text);
  // the text that closes its block (the next text belongs to another one) is the one that can leave a word alone
  // the box its lines are in: the nearest ancestor that is not inline (a quote's span.qrow__text is a block inside
  // the row's link, so its last words are the quote's, not the author's after it); one style read per element
  const display = new Map<Element, string>();
  const blockOf = (t: Text | undefined) => {
    for (let e = t?.parentElement; e; e = e.parentElement) {
      let d = display.get(e);
      if (d === undefined) display.set(e, (d = getComputedStyle(e).display));
      if (d !== 'inline' && d !== 'contents') return e.closest(BLOCK) ? e : null;
    }
    return null;
  };
  const texts = all.filter((t) => t.data.trim());
  const closes = new Set(texts.filter((t, i) => blockOf(t) && blockOf(t) !== blockOf(texts[i + 1])));
  all.forEach((t) => one(t, closes.has(t)));
}

/** Set the whole page again (after new protected words arrive). */
export function retypeset() {
  if (joinerHolds === false) {
    // undo the spans so every run is measured against the new words
    for (const s of document.querySelectorAll('span.nb')) s.replaceWith(s.textContent || '');
    document.body.normalize();
    made = new WeakSet();
  }
  setText(document.body);
  fitPhrases(document.body);
}

/**
 * Typeset everything the app shows: Thai text joined where a line must not break, the moment it arrives;
 * phrases and display headings fitted before the next paint, and again when the width changes (a rotation).
 */
export function typeset() {
  const pending = new Set<ParentNode>();
  let raf = 0, width = innerWidth;
  const flush = () => { raf = 0; for (const el of pending) if (el === document.body || (el as Element).isConnected) fitPhrases(el); pending.clear(); };
  const soon = (el: ParentNode) => { pending.add(el); if (!raf) raf = requestAnimationFrame(flush); };
  setText(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') { setText(m.target); continue; }
      for (const n of m.addedNodes) {
        setText(n);
        if (n.nodeType === 1 && ((n as Element).matches('.ph, ' + WIDE) || (n as Element).querySelector('.ph, ' + WIDE))) soon((n as Element).parentElement || (n as Element));
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  // height-only resizes (a phone's address bar sliding away) change no line
  addEventListener('resize', () => { if (innerWidth !== width) { width = innerWidth; soon(document.body); } });
  // the joiners are for the screen only: copied text goes out clean, so it pastes into a search or a chat as typed
  document.addEventListener('copy', (e) => {
    const text = getSelection()?.toString() || '';
    if (!text.includes('\u2060') || !e.clipboardData) return;
    e.clipboardData.setData('text/plain', text.replace(/\u2060/g, ''));
    e.preventDefault();
  });
}
