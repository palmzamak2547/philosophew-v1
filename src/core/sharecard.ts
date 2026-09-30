// Draws a quote card to a canvas for sharing (IG post 4:5 or story 9:16). No DOM screenshots,
// so fonts, Thai line breaks and the duotone portrait come out the same on every phone.
import type { Author, Quote } from './data';
import type { Finish } from './store';
import { CARD_TONE, sourceLine, authorName, quoteLines } from '../ui/card';
import { SCHOOL, L } from '../content/schools';
import { verifyLabel } from './data';
import { mark, DHARMA_WHEEL } from '../ui/icons';
import { lifespan } from './time';
import { t, isEn } from './i18n';
import { wordsOf } from './thai';
import { fillAt } from './canvastext';

export type Format = 'post' | 'story';
const SIZE: Record<Format, [number, number]> = { post: [1080, 1350], story: [1080, 1920] };

const segCache = new Map<string, Intl.Segmenter>();
function words(text: string, lang: string) {
  const S = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!S) return lang === 'th' ? [...text] : text.split(/(\s+)/);
  let seg = segCache.get(lang);
  if (!seg) { seg = new S(lang, { granularity: 'word' }); segCache.set(lang, seg); }
  return [...seg.segment(text)].map((s) => s.segment);
}

/**
 * Wrap for canvas, set the way a Thai typesetter would: keep each space-separated phrase whole when it
 * fits on a line, break inside a phrase only between words, and never start a line with a particle.
 */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, lang: string) {
  const lines = wrapAt(ctx, text, maxW, lang);
  if (lines.length < 2) return lines;
  // balanced, like text-wrap: balance: the narrowest measure that keeps the same number of lines,
  // so a quote never ends on a lone word
  let lo = maxW * 0.55, hi = maxW;
  for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; if (wrapAt(ctx, text, mid, lang).length <= lines.length) hi = mid; else lo = mid; }
  return wrapAt(ctx, text, hi, lang);
}

function wrapAt(ctx: CanvasRenderingContext2D, text: string, maxW: number, lang: string) {
  const out: string[] = [];
  let line = '';
  const push = (piece: string, sep: string) => {
    const test = line ? line + sep + piece : piece;
    if (!line || ctx.measureText(test).width <= maxW) { line = test; return true; }
    return false;
  };
  // plain spaces only: a no-break space holds its words together here as on the page (Book 2, 1)
  for (const phrase of text.split(/[ \t\n\r]+/).filter(Boolean)) {
    const fits = ctx.measureText(phrase).width <= maxW;
    // the first phrase too: a long unspaced Thai opening was once taken whole and ran over the card's frame
    if (fits && push(phrase, ' ')) continue;
    if (fits) { out.push(line); line = phrase; continue; }
    // a phrase longer than a line: words inside it (particles stay glued to the word before)
    let first = true;
    for (const w of (lang === 'th' ? wordsOf(phrase) : words(phrase, lang)).map((x) => x.replace(/\u2060/g, ''))) {
      if (push(w, first ? ' ' : '')) { first = false; continue; }
      out.push(line);
      line = w;
      first = false;
    }
  }
  if (line) out.push(line);
  return out;
}

export function svgImage(svg: string, color: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    const s = svg.replace(/currentColor/g, color).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });
}

export function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export async function fontsReady() {
  const f = document.fonts;
  if (!f) return;
  await Promise.all([
    f.load('500 60px Trirong', 'ก'),
    f.load('800 44px "Noto Serif Thai"', 'ก'),
    f.load('italic 400 30px Fraunces', 'a'),
    f.load('900 40px Fraunces', 'a'),
    f.load('600 28px "Bricolage Grotesque"', 'a'),
    f.load('600 28px Anuphan', 'ก'),
  ]).catch(() => {});
}

export function arch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/**
 * A thinker's face in an arch the caller has clipped: the duotone photo or, when there is none or it will not load (a
 * portrait this device never saved, offline), the Dharma wheel or the mark in the paper's colour: never an empty arch
 * on an image someone can share. True when the photo itself was drawn (its credit goes under it only then).
 */
export async function drawFace(ctx: CanvasRenderingContext2D, a: Author | undefined, b: { x: number; y: number; w: number; h: number }, o: { paper: string; top: string; size: number; dy: number }) {
  const p = a?.portrait;
  const img = p?.file && p.kind !== 'symbol' ? await loadImg(p.file).catch(() => null) : null;
  if (img) {
    const s = Math.max(b.w / img.width, b.h / img.height);
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(img, b.x + (b.w - img.width * s) / 2, b.y + (b.h - img.height * s) / 2, img.width * s, img.height * s);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = o.paper;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }
  // the mark's colours spelled out: an image has no CSS, so its default var(--ember) drew the top capsules black
  const art = a?.id === 'the-buddha' || p?.kind === 'symbol' ? DHARMA_WHEEL : mark({ size: 200, top: o.top, bottom: 'currentColor' });
  const sym = await svgImage(art, o.paper).catch(() => null);
  if (sym) {
    const s = b.w * o.size;
    ctx.drawImage(sym, b.x + (b.w - s) / 2, b.y + (b.h - s) / 2 + o.dy, s, s);
  }
  return false;
}

/** The least room between the quote's lowest ink and the accent rule over the name. */
const GAP = 40;
const quoteFont = (size: number) => `500 ${size}px Fraunces, Trirong, serif`;
const subFont = (size: number) => `italic 400 ${size}px Fraunces, Georgia, serif`;
const nameFont = (size: number) => `800 ${size}px "Noto Serif Thai", Fraunces, serif`;
const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** At most `k` lines; a cut ends on a whole word (or whole letters, in a script without spaces) and an ellipsis. */
export function cap(ctx: CanvasRenderingContext2D, lines: string[], k: number, maxW: number) {
  if (lines.length <= k) return lines;
  if (k <= 0) return [];
  const out = lines.slice(0, k);
  let last = out[k - 1].replace(/[ \t]+\S*$/, '');
  const cut = (s: string) => (graphemes ? [...graphemes.segment(s)].slice(0, -1).map((x) => x.segment).join('') : s.slice(0, -1));
  while (last && ctx.measureText(`${last}…`).width > maxW) last = cut(last);
  out[k - 1] = `${last.trimEnd()}…`;
  return out;
}

interface QuoteFit { size: number; lines: string[]; base: number[]; enSize: number; en: string[]; enBase: number[] }

/**
 * The quote and the line under it (the English, or in English the original), set from `top` so that their inked
 * boxes end at or above `floor`. Measured, not estimated: each line's real descent, Thai vowels and marks included.
 * The line under it keeps up to three lines while the quote can stay at 26 px or more; only a quote too long for that
 * gives up those lines, one by one, then size, down to 20 px.
 */
function fitQuote(ctx: CanvasRenderingContext2D, ql: ReturnType<typeof quoteLines>, top: number, floor: number, maxW: number, story: boolean): QuoteFit {
  const enSize = story ? 30 : 26;
  ctx.font = subFont(enSize);
  const under = ql.sub ? wrap(ctx, ql.sub, maxW - 40, ql.subLang) : [];
  const text = `“${ql.main}”`;
  let last: QuoteFit | null = null;
  for (const k of under.length ? [3, 2, 1, 0] : [0]) {
    ctx.font = subFont(enSize);
    const en = cap(ctx, under, k, maxW - 40);
    for (let size = story ? 72 : 60; size >= (k ? 26 : 20); size -= 2) {
      ctx.font = quoteFont(size);
      const lines = wrap(ctx, text, maxW, ql.mainLang);
      const base = lines.map((_, i) => top + size + i * size * 1.55);
      const end = base[base.length - 1];
      let bottom = end + ctx.measureText(lines[lines.length - 1]).actualBoundingBoxDescent;
      const wide = lines.some((l) => ctx.measureText(l).width > maxW); // one word longer than a line: only a smaller size fixes it
      const enBase = en.map((_, i) => end + size * 1.55 + 8 + i * enSize * 1.45);
      if (en.length) {
        ctx.font = subFont(enSize);
        bottom = enBase[en.length - 1] + ctx.measureText(en[en.length - 1]).actualBoundingBoxDescent;
      }
      last = { size, lines, base, enSize, en, enBase };
      if (!wide && bottom <= floor) return last;
    }
  }
  return last!; // no quote in the data comes near this (scripts check every card): the smallest setting
}

export async function renderShareCard(q: Quote, a: Author | undefined, finish: Finish, format: Format = 'post') {
  await fontsReady();
  const [W, H] = SIZE[format];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const tone = CARD_TONE[q.school];
  const story = format === 'story';
  const pad = 84;

  // paper
  ctx.fillStyle = tone.bg;
  ctx.fillRect(0, 0, W, H);
  // faint paper grain
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = tone.dark ? `rgba(255,255,255,${Math.random() * 0.025})` : `rgba(0,0,0,${Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // frame
  ctx.lineWidth = finish === 'paper' ? 3 : 10;
  if (finish === 'gold') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    ['#8C6A1E', '#F3D98B', '#B8862F', '#FFF1C4', '#9C7424'].forEach((col, i) => g.addColorStop(i / 4, col));
    ctx.strokeStyle = g;
  } else if (finish === 'foil') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    ['#FF9AD5', '#9AE7FF', '#FFF6A0', '#B6A0FF', '#9AFFD0'].forEach((col, i) => g.addColorStop(i / 4, col));
    ctx.strokeStyle = g;
  } else ctx.strokeStyle = tone.accent;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  // header
  ctx.fillStyle = tone.accent;
  ctx.font = '600 30px "Bricolage Grotesque", Anuphan, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(L(SCHOOL[q.school].short), pad, 118);
  if (finish !== 'paper') {
    fillAt(ctx, finish === 'gold' ? t('ทองคำเปลว', 'Gold leaf') : t('ฟอยล์', 'Foil'), W - pad, 118, 'right');
  }

  // portrait arch
  const pw = story ? 420 : 300, ph = story ? 520 : 370;
  const px = (W - pw) / 2, py = story ? 190 : 160;
  const paper = tone.dark ? '#F0E8DA' : tone.bg;
  ctx.save();
  arch(ctx, px, py, pw, ph);
  ctx.clip();
  ctx.fillStyle = tone.dark ? '#0B0A0D' : shade(tone.accent, -0.45);
  ctx.fillRect(px, py, pw, ph);
  const photo = await drawFace(ctx, a, { x: px, y: py, w: pw, h: ph }, { paper, top: shade(tone.accent, 0.3), size: 0.62, dy: 20 });
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = tone.accent;
  arch(ctx, px - 10, py - 10, pw + 20, ph + 20);
  ctx.stroke();
  // a photo that is not public domain carries its credit under it, as a magazine would: CC BY and CC BY-SA ask it of
  // every copy, and a shared card is one (only when the photo itself is on the card)
  const credit = photo ? portraitCredit(a) : '';
  if (credit) {
    ctx.font = '500 17px "Bricolage Grotesque", Anuphan, sans-serif';
    ctx.fillStyle = tone.dark ? 'rgba(240,232,218,.5)' : 'rgba(0,0,0,.46)';
    let line = credit;
    while (ctx.measureText(line).width > W - pad * 2 && line.length > 12) line = line.replace(/.(…?)$/, '…');
    fillAt(ctx, line, W / 2, py + ph + 40);
  }

  // the author block is anchored above the brand; its accent rule sits over the name's highest mark (the stacked marks
  // of เล่าจื๊อ reach higher than a Latin capital) and is the floor of the quote's room
  const by = H - 200 - (story ? 150 : 80);
  const maxW = W - pad * 2;
  const name = authorName(a, q.author);
  let nameSize = 46;
  ctx.font = nameFont(nameSize);
  while (ctx.measureText(name).width > maxW && nameSize > 30) ctx.font = nameFont((nameSize -= 2)); // a long name steps down, never runs off
  const rule = Math.min(by - 34, by + 24 - ctx.measureText(name).actualBoundingBoxAscent - 14 - 4);
  ctx.textAlign = 'center';
  // quote, at the largest size whose inked lines (measured: descenders, Thai vowels and tone marks) end GAP above
  // the rule: the rule once ran through a long quote's last line of English
  const fit = fitQuote(ctx, quoteLines(q), py + ph + (story ? 90 : 70), rule - GAP, maxW, story);
  ctx.fillStyle = tone.ink;
  ctx.font = quoteFont(fit.size);
  fit.lines.forEach((l, i) => fillAt(ctx, l, W / 2, fit.base[i]));
  ctx.font = subFont(fit.enSize);
  ctx.fillStyle = tone.dark ? 'rgba(240,232,218,.62)' : 'rgba(0,0,0,.52)';
  fit.en.forEach((l, i) => fillAt(ctx, l, W / 2, fit.enBase[i]));

  // author
  ctx.fillStyle = tone.accent;
  ctx.fillRect(W / 2 - 40, rule, 80, 4);
  ctx.fillStyle = tone.ink;
  ctx.font = nameFont(nameSize);
  fillAt(ctx, name, W / 2, by + 24);
  ctx.font = '500 26px "Bricolage Grotesque", Anuphan, sans-serif';
  ctx.fillStyle = tone.dark ? 'rgba(240,232,218,.7)' : 'rgba(0,0,0,.6)';
  const years = a ? lifespan(a.born, a.died, a.circa) : '';
  fillAt(ctx, [isEn() ? '' : a?.en, years].filter(Boolean).join('   '), W / 2, by + 70);
  // the source in two lines (three on a story, which has the room): a long one (a talk, the book it was printed in, its
  // translator) sets a little smaller before anything is cut, and a cut says so
  const src = `${sourceLine(q)}   ${verifyLabel(q.verify).th}`;
  const most = story ? 3 : 2;
  let srcLines: string[] = [];
  for (let size = 22; size >= 18; size--) {
    ctx.font = `500 ${size}px "Bricolage Grotesque", Anuphan, sans-serif`;
    srcLines = wrap(ctx, src, maxW, isEn() ? 'en' : 'th');
    if (srcLines.length <= most) break;
  }
  cap(ctx, srcLines, most, maxW).forEach((l, i) => fillAt(ctx, l, W / 2, by + 112 + i * 30));

  // brand
  const m = await svgImage(mark({ size: 64, top: tone.accent, bottom: tone.ink }), tone.ink).catch(() => null);
  const brandY = H - (story ? 110 : 76);
  ctx.font = '900 30px Fraunces, serif';
  const label = 'philosophew.lol';
  const lw = ctx.measureText(label).width;
  const bx = W / 2 - (lw + 50) / 2;
  if (m) ctx.drawImage(m, bx, brandY - 30, 40, 40);
  ctx.textAlign = 'left';
  ctx.fillStyle = tone.ink;
  ctx.fillText(label, bx + 50, brandY);
  if (story) {
    ctx.textAlign = 'center';
    ctx.font = '500 26px Anuphan, sans-serif';
    ctx.fillStyle = tone.dark ? 'rgba(240,232,218,.6)' : 'rgba(0,0,0,.5)';
    fillAt(ctx, t('สุ่มคำคมปรัชญา แล้วหายใจออก', 'Pull a quote. Breathe out.'), W / 2, brandY + 46);
  }
  return c;
}

/**
 * The picture a chat app shows under a quote's link (og:image, 1200 x 630): the line itself, not the school's card.
 * An editorial spread: the brand's quote mark drawn huge in the school's accent, the Thai line as large as it fits
 * (a short line gets very large, so cards differ in rhythm), the original under it in italic when there is room, the
 * name in two scales, and the thinker in a tall arch that runs off the bottom edge like a doorway. Chat apps show it
 * at a third of its size, so nothing that must be read is under 26 px. Rendered for every quote by scripts/og-quotes.mjs.
 */
export async function renderLinkCard(q: Quote, a: Author | undefined) {
  await fontsReady();
  const W = 1200, H = 630, pad = 72, colW = 600;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const tone = CARD_TONE[q.school];
  const soft = tone.dark ? 'rgba(240,232,218,.66)' : 'rgba(0,0,0,.56)';
  ctx.fillStyle = tone.bg;
  ctx.fillRect(0, 0, W, H);
  // light from the doorway: the arch's side of the spread is a touch brighter
  const glow = ctx.createRadialGradient(940, 330, 40, 940, 330, 620);
  glow.addColorStop(0, tone.dark ? 'rgba(255,214,150,.10)' : 'rgba(255,255,255,.34)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // the doorway: the thinker, duotone, in an arch from 58 px below the top to past the bottom edge
  const ax = 760, aw = 368, ay = 58, ah = H - ay + 40;
  const paper = tone.dark ? '#F0E8DA' : tone.bg;
  ctx.save();
  arch(ctx, ax, ay, aw, ah);
  ctx.clip();
  ctx.fillStyle = tone.dark ? '#0B0A0D' : shade(tone.accent, -0.45);
  ctx.fillRect(ax, ay, aw, ah);
  // a share-alike photo would pass its licence on to the whole picture (a tinted copy is an adaptation): the mark stands in
  const face = a && /SA/.test(a.portrait?.license || '') ? { ...a, portrait: null } : a;
  const photo = await drawFace(ctx, face, { x: ax, y: ay, w: aw, h: ah }, { paper, top: shade(tone.accent, 0.3), size: 0.6, dy: -10 });
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = tone.accent;
  arch(ctx, ax - 14, ay - 14, aw + 28, ah + 28);
  ctx.stroke();
  const credit = photo ? portraitCredit(face) : '';
  if (credit) {
    ctx.save();
    ctx.translate(ax + aw + 36, H - 24);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '500 15px "Bricolage Grotesque", Anuphan, sans-serif';
    ctx.fillStyle = soft;
    ctx.textAlign = 'left';
    ctx.fillText(credit.length > 70 ? `${credit.slice(0, 68)}…` : credit, 0, 0);
    ctx.restore();
  }

  // the brand's quote mark, huge, the spread's one flourish (its capsules open the line)
  const m = await svgImage(mark({ size: 200, top: tone.accent, bottom: tone.ink }), tone.ink).catch(() => null);
  if (m) {
    ctx.globalAlpha = tone.dark ? 0.9 : 0.95;
    ctx.drawImage(m, pad - 22, 26, 150, 150);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 24px Fraunces, serif';
  ctx.fillStyle = tone.ink;
  const site = 'philosophew.lol';
  ctx.fillText(site, pad + colW - ctx.measureText(site).width, 92);

  // the name block, anchored to the bottom; its rule is the floor of the quote's room
  const name = authorName(a, q.author);
  let nameSize = 40;
  ctx.font = nameFont(nameSize);
  while (ctx.measureText(name).width > colW && nameSize > 28) ctx.font = nameFont((nameSize -= 2));
  const nameBase = H - 96;
  ctx.fillStyle = tone.ink;
  ctx.fillText(name, pad, nameBase);
  const years = a ? lifespan(a.born, a.died, a.circa) : '';
  const latin = [isEn() ? '' : a?.en, years].filter(Boolean).join('   ');
  ctx.font = '500 24px "Bricolage Grotesque", Anuphan, sans-serif';
  ctx.fillStyle = soft;
  if (latin) ctx.fillText(latin, pad, nameBase + 40);
  ctx.font = nameFont(nameSize);
  const rule = nameBase - ctx.measureText(name).actualBoundingBoxAscent - 26;
  ctx.fillStyle = tone.accent;
  ctx.fillRect(pad, rule, 64, 4);
  ctx.font = '700 22px "Bricolage Grotesque", Anuphan, sans-serif';
  ctx.fillText(L(SCHOOL[q.school].short), pad + 82, rule + 9); // the school, as the rule's eyebrow

  // the line: the largest size whose inked lines end 30 px over the rule; a short line may also carry its original
  const ql = quoteLines(q);
  const top = 176, floor = rule - 30;
  const text = `“${ql.main}”`;
  let size = 76, lines: string[] = [], lh = 0;
  for (; size >= 34; size -= 2) {
    ctx.font = quoteFont(size);
    lines = wrap(ctx, text, colW, ql.mainLang);
    lh = size * 1.48;
    const bottom = top + size + (lines.length - 1) * lh + ctx.measureText(lines[lines.length - 1]).actualBoundingBoxDescent;
    if (bottom <= floor && lines.every((l) => ctx.measureText(l).width <= colW)) break;
  }
  if (size < 34) { // the longest lines: 34 px and an honest ellipsis (the page holds the whole of it)
    size = 34;
    lh = size * 1.48;
    ctx.font = quoteFont(size);
    lines = cap(ctx, wrap(ctx, text, colW, ql.mainLang), Math.max(1, Math.floor((floor - top - size) / lh) + 1), colW);
  }
  ctx.font = quoteFont(size);
  ctx.fillStyle = tone.ink;
  lines.forEach((l, i) => ctx.fillText(l, pad, top + size + i * lh));
  const end = top + size + (lines.length - 1) * lh;
  if (ql.sub && size >= 44) {
    ctx.font = subFont(26);
    const room = Math.floor((floor - end - 18) / (26 * 1.45));
    const en = cap(ctx, wrap(ctx, ql.sub, colW, ql.subLang), Math.min(2, room), colW);
    ctx.fillStyle = soft;
    en.forEach((l, i) => ctx.fillText(l, pad, end + 26 + 30 + i * 26 * 1.45));
  }
  return c;
}

/** The credit line a portrait's licence asks for; empty for public domain, no-rights images and symbols. */
export function portraitCredit(a: Author | undefined) {
  const p = a?.portrait;
  if (!p?.file || p.kind === 'symbol' || !p.license || /^(public domain|no restrictions|copyrighted free use)$|cc0/i.test(p.license.trim())) return '';
  return `${t('ภาพ', 'Image')}: ${p.artist ? `${p.artist}, ` : ''}${p.license}`;
}

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function canvasBlob(c: HTMLCanvasElement) {
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}
