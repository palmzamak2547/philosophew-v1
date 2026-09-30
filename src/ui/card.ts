import { html, raw, type Html } from '../core/dom';
import type { Author, Quote } from '../core/data';
import { verifyLabel } from '../core/data';
import type { Finish } from '../core/store';
import { SCHOOL, L, type SchoolId } from '../content/schools';
import { ICON, DHARMA_WHEEL, mark } from './icons';
import { lifespan } from '../core/time';
import { t, isEn } from '../core/i18n';
import { phrases } from '../core/thai';
import { smart } from '../core/typo';

// Card paper per school: the card carries its own world wherever it is shown.
export const CARD_TONE: Record<SchoolId, { bg: string; ink: string; accent: string; accent2: string; dark: boolean }> = {
  stoic: { bg: '#F2EDE4', ink: '#221F1B', accent: '#A8702F', accent2: '#2F7D6C', dark: false },
  existential: { bg: '#1C1B20', ink: '#F0E8DA', accent: '#E3363F', accent2: '#C9A45C', dark: true },
  eastern: { bg: '#F5EDDD', ink: '#241C16', accent: '#C8412B', accent2: '#3E7A57', dark: false },
  absurd: { bg: '#FFF4DF', ink: '#1B1B3A', accent: '#3D64E8', accent2: '#EE6A3E', dark: false },
  socratic: { bg: '#EEF1F4', ink: '#10223B', accent: '#1F4F8C', accent2: '#C3643A', dark: false },
};

export const finishLabel = (f: Finish) => ({ paper: t('การ์ดกระดาษ', 'Paper card'), foil: t('การ์ดฟอยล์', 'Foil card'), gold: t('การ์ดทองคำเปลว', 'Gold leaf card') })[f];

export function toneStyle(s: SchoolId) {
  const c = CARD_TONE[s];
  // --c-paper: what a portrait is printed on. The dark school's paper is its night, which printed its faces black
  return `--c-bg:${c.bg};--c-ink:${c.ink};--c-accent:${c.accent};--c-accent2:${c.accent2};--c-paper:${c.dark ? '#EFE4D2' : c.bg}`;
}

export const authorName = (a: Author | undefined, fallback = '') => (a ? (isEn() ? a.en : a.th) : fallback);
/** A name for the page: each part of it stays on one line (Thai transliterations are not in any dictionary). */
export const nameHtml = (a: Author | undefined, fallback = '') => phrases(authorName(a, fallback));
/** A quote in running text, in its marks, set in phrases. */
export const quoteHtml = (text: string) => phrases(`“${text}”`);
/** The main quote line in the reader's language, plus the line under it. */
export const quoteLines = (q: Quote) => (isEn() ? { main: smart(q.en), sub: q.orig?.text ? smart(q.orig.text) : null, mainLang: 'en', subLang: q.orig?.lang || 'en' } : { main: smart(q.th), sub: smart(q.en), mainLang: 'th', subLang: 'en' });

export function portrait(a: Author | undefined, cls = '') {
  const p = a?.portrait;
  const symbol = a?.id === 'the-buddha' || p?.kind === 'symbol';
  if (symbol || !p?.file) {
    return html`<figure class="portrait portrait--symbol ${cls}" aria-hidden="true">${raw(symbol ? DHARMA_WHEEL : mark({ size: 64 }))}</figure>`;
  }
  // a papyrus with the thinker's words stands in where no likeness survives (Musonius Rufus)
  const alt = p.kind === 'papyrus' ? t(`คำสอนของ${authorName(a)} บนกระดาษปาปิรุส`, `The words of ${authorName(a)} on papyrus`) : `${t('ภาพของ', 'Portrait of ')}${authorName(a)}`;
  return html`<figure class="portrait duo ${cls}"><img src="${p.file}" alt="${alt}" loading="lazy" decoding="async" width="720" height="900"></figure>`;
}

const lenClass = (s: string, en: boolean) => {
  const n = en ? s.length * 0.8 : s.length; // Latin sets wider per character than Thai
  return n < 34 ? 'len-s' : n < 80 ? 'len-m' : n < 140 ? 'len-l' : 'len-xl';
};

/**
 * Where a line comes from, in two parts: the work with its locator, and who put it into English. A number never starts
 * a line cut from its word (Book 2, 1; p. 177; chapter 23; Book VI) and "translated by" keeps the name it introduces
 * (no-break spaces), while the two parts may part: "Meditations, Book 2," once ended a line and "1 แปลอังกฤษโดย George
 * Long" read as if the 1 were the translator's.
 */
export function sourceParts(q: Pick<Quote, 'source'>): [string, string] {
  const s = q.source;
  const where = [s.work, s.locator].filter(Boolean).join(', ').replace(/ (?=\d|[IVXLC]+(?![\w'’]))/g, '\u00a0');
  return [smart(where), s.translator ? smart(t(`แปลอังกฤษโดย\u00a0${s.translator}`, `trans.\u00a0${s.translator}`)) : ''];
}
/** The source as one string: the share image, the static page (scripts/prerender.mjs imports this), captions. */
export const sourceLine = (q: Pick<Quote, 'source'>) => sourceParts(q).filter(Boolean).join(t(' ', ', '));
/**
 * The source for the page, set in phrases (each held on one line where it fits) and in its two parts, so the
 * typesetter's "a number keeps the Thai word after it" (12 วัน) never glues a locator's last number to แปลอังกฤษโดย:
 * Meditations, Book 2, 1 | แปลอังกฤษโดย George Long (1862).
 */
export const sourceHtml = (q: Pick<Quote, 'source'>) => {
  const [where, by] = sourceParts(q);
  return html`${phrases(where)}${by ? html`${t(' ', ', ')}${phrases(by)}` : ''}`;
};

export function verifyBadge(q: Quote) {
  const v = verifyLabel(q.verify);
  return html`<button class="verify verify--${q.verify}" data-verify="${q.id}" title="${v.long}">${raw(q.verify === 'attributed' ? ICON.info : ICON.seal)}<span>${v.th}</span></button>`;
}

export interface CardOpts { finish?: Finish; isNew?: boolean; back?: boolean; cls?: string }

export function card(q: Quote, a: Author | undefined, o: CardOpts = {}): Html {
  const finish = o.finish || 'paper';
  const school = SCHOOL[q.school];
  const tone = CARD_TONE[q.school];
  const years = a ? lifespan(a.born, a.died, a.circa) : '';
  const lines = quoteLines(q);
  const en = isEn();
  return html`
  <article class="qcard qcard--${finish} ${tone.dark ? 'qcard--dark' : ''} ${o.cls || ''}" style="${toneStyle(q.school)}" data-quote="${q.id}" data-school="${q.school}">
    <div class="qcard__inner">
      <div class="qcard__face">
        <div class="qcard__frame" aria-hidden="true"></div>
        <header class="qcard__top">
          <span class="qcard__school">${L(school.short)}</span>
          ${o.isNew ? html`<span class="qcard__new">${t('เพิ่งรู้จัก', 'Just met')}</span>` : ''}
          ${finish !== 'paper' ? html`<span class="qcard__finish">${finish === 'gold' ? t('ทองคำเปลว', 'Gold leaf') : t('ฟอยล์', 'Foil')}</span>` : ''}
        </header>
        ${portrait(a, 'qcard__portrait')}
        <blockquote class="qcard__quote ${lenClass(lines.main, en)}">
          <p class="qcard__text" lang="${lines.mainLang}">${phrases(lines.main)}</p>
          ${lines.sub ? html`<p class="qcard__orig" lang="${lines.subLang}">${lines.sub}</p>` : ''}
        </blockquote>
        <footer class="qcard__by">
          <p class="qcard__name">${nameHtml(a, q.author)}</p>
          <p class="qcard__meta">${en ? '' : a?.en || ''}${years ? html`<span class="${en ? 'first' : ''}">${years}</span>` : ''}</p>
          <div class="qcard__src"><span>${sourceHtml(q)}</span>${verifyBadge(q)}</div>
        </footer>
        <div class="qcard__brand" aria-hidden="true">${raw(mark({ size: 18 }))}<span>philosophew.lol</span></div>
      </div>
      ${o.back ? html`<div class="qcard__back" aria-hidden="true">${raw(mark({ size: 88, top: 'var(--c-accent)', bottom: 'var(--c-ink)' }))}<span>${L(school.machine.name)}</span></div>` : ''}
    </div>
    <div class="qcard__shine" aria-hidden="true"></div>
  </article>`;
}

/** Pointer/gyro tilt for foil and gold cards. Returns cleanup. */
export function tilt(cardEl: HTMLElement) {
  let raf = 0;
  const set = (x: number, y: number) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      cardEl.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      cardEl.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      cardEl.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(2)}deg`);
      cardEl.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`);
    });
  };
  const move = (e: PointerEvent) => {
    const r = cardEl.getBoundingClientRect();
    set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  const leave = () => set(0.5, 0.5);
  const orient = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    set(Math.min(1, Math.max(0, 0.5 + e.gamma / 50)), Math.min(1, Math.max(0, 0.5 + (e.beta - 40) / 60)));
  };
  cardEl.addEventListener('pointermove', move);
  cardEl.addEventListener('pointerleave', leave);
  addEventListener('deviceorientation', orient);
  leave();
  return () => {
    cardEl.removeEventListener('pointermove', move);
    cardEl.removeEventListener('pointerleave', leave);
    removeEventListener('deviceorientation', orient);
  };
}
