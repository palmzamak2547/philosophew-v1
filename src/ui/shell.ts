import { html, raw, el, $, on, type Html } from '../core/dom';
import { store, onGame } from '../core/store';
import { findQuote, loadAuthors, type Author } from '../core/data';
import { quoteLines, nameHtml } from './card';
import { phrases, fitPhrases } from '../core/thai';
import { levelOf, maxFlames, unlimited } from '../core/game';
import { ICON, mark } from './icons';
import { sfx, unlock } from '../core/audio';
import { t, lang, setLang, isEn } from '../core/i18n';
import { TONE, type School } from '../content/schools';

const NAV = () => [
  { href: '/', label: t('ตู้ปรัชญา', 'Machines'), icon: ICON.home },
  { href: '/notes', label: t('สมุด', 'Notebook'), icon: ICON.book },
  { href: '/agora', label: t('อะกอรา', 'Agora'), icon: ICON.agora },
  { href: '/library', label: t('หอสมุด', 'Library'), icon: ICON.stars },
  { href: '/me', label: t('ฉัน', 'Me'), icon: ICON.bust },
];

let header: HTMLElement, nav: HTMLElement, toasts: HTMLElement;
export let screen: HTMLElement;
let onLangChange: () => void = () => {};

function headerHtml() {
  return html`
    <header class="top" data-chrome>
      <a class="brand" href="/" aria-label="${t('Philosophew หน้าแรก', 'Philosophew home')}">
        ${raw(mark({ size: 34 }))}
        <span class="wordmark">philoso<em>phew</em></span>
      </a>
      <div class="top__right">
        <button class="pill pill-signin" data-signin hidden aria-label="${t('เข้าสู่ระบบ', 'Sign in')}">${raw(ICON.bust)}<span class="pill-signin__label">${t('เข้าสู่ระบบ', 'Sign in')}</span></button>
        <button class="pill lang" data-lang aria-label="${t('Switch to English', 'เปลี่ยนเป็นภาษาไทย')}">${lang() === 'th' ? 'EN' : 'ไทย'}</button>
        <a class="pill flames" href="/me" aria-label="${t('ไฟวันนี้', 'Flames today')}">
          <span class="flames__icon">${raw(ICON.flame)}</span><b class="num" data-flames>0</b>
        </a>
        <a class="lvl" href="/me" aria-label="${t('ระดับ', 'Level')}">
          <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" class="lvl__track"/><circle cx="20" cy="20" r="17" class="lvl__bar" data-lvlbar/></svg>
          <b class="num" data-lvl>1</b>
        </a>
      </div>
    </header>`;
}

function navHtml() {
  return html`<nav class="nav" aria-label="${t('เมนูหลัก', 'Main menu')}" data-chrome>
    ${NAV().map((n) => html`<a href="${n.href}" class="nav__item" data-nav="${n.href}">${raw(n.icon)}<span>${n.label}</span></a>`)}
  </nav>`;
}

function paint() {
  const s = store.s;
  const lv = levelOf(s.xp);
  const free = unlimited();
  $('[data-flames]', header)!.textContent = free ? '∞' : String(s.flames);
  $('[data-lvl]', header)!.textContent = String(lv.level);
  const bar = $('[data-lvlbar]', header) as unknown as SVGCircleElement;
  const c = 2 * Math.PI * 17;
  bar.style.strokeDasharray = `${c}`;
  bar.style.strokeDashoffset = `${c * (1 - lv.progress)}`;
  const fl = header.querySelector('.flames')!;
  fl.classList.toggle('is-empty', s.flames <= 0 && !free);
  // readers looked for sign-in in the header (it lived on /me): shown while signed out, gone once an account is here
  let signedIn = true;
  try { signedIn = !!localStorage.getItem('pw.acct'); } catch { /* storage blocked: accounts cannot work here */ }
  $('[data-signin]', header)!.hidden = signedIn;
  fl.setAttribute('aria-label', free ? t('ไฟไม่จำกัด', 'Unlimited flames') : t(`ไฟวันนี้เหลือ ${s.flames} จาก ${maxFlames(lv.level)} ดวง`, `${s.flames} of ${maxFlames(lv.level)} flames left today`));
}

export function mountShell(onLang: () => void) {
  onLangChange = onLang;
  document.documentElement.lang = lang();
  const app = document.getElementById('app')!;
  // the prerendered page (its h1, words and links) stays readable, though never seen, until the app draws its own:
  // behind the lamp a search engine that never breathes would otherwise find an empty page (unpre removes it). Inert:
  // in the page for a crawler, but no Tab stop and nothing read twice (a keyboard walked its 13 links before the lamp)
  const pre = app.querySelector('.pre');
  if (pre) { pre.classList.add('pre--kept'); pre.setAttribute('inert', ''); document.body.append(pre); }
  app.innerHTML = '';
  header = el(headerHtml());
  nav = el(navHtml());
  screen = el(html`<main id="screen" tabindex="-1"></main>`);
  toasts = el(html`<div class="toasts" role="status" aria-live="polite"></div>`);
  app.append(header, screen, nav, el(html`<div class="grain" aria-hidden="true"></div>`));
  document.body.append(toasts); // outside #app: an open card makes #app inert, and toasts must still be heard
  paint();
  store.subscribe(paint);
  // the header gets its frosted ground once a page scrolls under it (one class, set at most once a frame)
  let ticking = false;
  const scrolled = () => { ticking = false; document.documentElement.classList.toggle('is-scrolled', scrollY > 4); };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(scrolled); } }, { passive: true });

  onGame((e) => {
    if (e.type === 'flame') { toast(e.reason, ICON.flame); bump('.flames'); sfx.flame(); }
    if (e.type === 'levelup') celebrate(() => levelUp(e.level, e.title));
    if (e.type === 'toast') toast(e.text);
    // day one: the first card is a start, not a finish (the rite still counts, it just is not announced)
    if (e.type === 'rite' && store.s.lit > 1) celebrate(() => { sfx.flame(); toast(t('วันนี้ครบแล้ว ฟิ้ว จะอยู่ต่อหรือไปพักก็ได้', "That's today done. Phew. Stay or rest: both are fine."), ICON.check, 4200); });
    if (e.type === 'rekindle') { toast(t(`ตะเกียงกลับมานับต่อแล้ว จุดติดกัน ${e.streak} วัน`, `Your run is back. ${e.streak} days in a row.`), ICON.flame, 3600); bump('.flames'); sfx.flame(); }
  });

  // First gesture anywhere unlocks audio. A mouse press may start sound, but a finger only may once it lifts
  // (pointerup, touchend), and a key press counts too: listen for all of them, so the first sound is never lost.
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) document.addEventListener(type, unlock, { capture: true, passive: true });
  // every control clicks softly, unless it has a voice of its own: one that sounds in its own click handler (these run
  // first, and the tap then keeps quiet: src/core/audio.ts voice), or one that sounds later and carries data-silent.
  // Asked for on the target itself, even once a page has redrawn it away: /me's Language (and Theme, before /me set
  // itself in place) took the tapped button off the page first, and a delegate that checks the page stayed silent
  const TAP = 'button:not([data-silent]), .btn:not([data-silent]), .chip, .nav__item';
  document.addEventListener('click', (e) => { if ((e.target as Element | null)?.closest?.(TAP)) sfx.tap(); });
  on(document, 'click', '[data-lang]', () => switchLang());
  on(document, 'click', '[data-signin]', () => void import('./signin').then((m) => m.openSignIn()).then(paint, () => toast(t('เปิดหน้าเข้าสู่ระบบไม่ได้ ลองใหม่อีกครั้ง', 'Could not open sign-in. Try again.'))));
  addEventListener('storage', (e) => { if (e.key === 'pw.acct') paint(); });
  applyTheme();
}

/** The kept prerendered text leaves once the app has drawn its own page: one h1, always. */
export const unpre = () => document.querySelector('body > .pre')?.remove();

/** Swap language everywhere: chrome is rebuilt, the current view re-renders. */
export function switchLang(to?: 'th' | 'en') {
  setLang(to || (lang() === 'th' ? 'en' : 'th'));
  const h = el<HTMLElement>(headerHtml());
  header.replaceWith(h);
  header = h;
  const n = el<HTMLElement>(navHtml());
  nav.replaceWith(n);
  nav = n;
  paint();
  markNav(location.pathname);
  onLangChange();
}

export function markNav(path: string) {
  nav.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((a) => {
    const href = a.dataset.nav!;
    const active = href === '/' ? path === '/' || path.startsWith('/s/') : path.startsWith(href);
    a.classList.toggle('is-on', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

/** immersive = the 3D room owns the screen: hide the nav and header. */
export function chrome(mode: 'full' | 'immersive' | 'none') {
  document.body.dataset.chrome = mode;
}

export function bump(sel: string) {
  const n = $(sel, header);
  if (!n) return;
  n.classList.remove('bump');
  void n.offsetWidth;
  n.classList.add('bump');
}

// ---------- colour of the room ----------
// The same tokens and attributes scripts/prerender.mjs writes into a room's, a thinker's or a quote's own page, so the
// app taking over changes nothing on screen.
export function setTone(s: School | null) {
  const r = document.documentElement;
  if (!s) {
    TONE.forEach((k) => r.style.removeProperty(`--s-${k}`));
    if (!r.getAttribute('style')) r.removeAttribute('style');
    delete r.dataset.school;
    delete r.dataset.dark;
  } else {
    TONE.forEach((k) => r.style.setProperty(`--s-${k}`, s.palette[k]));
    r.dataset.school = s.id;
    r.dataset.dark = s.dark ? '1' : '0';
  }
  const c = s ? s.palette.bg : getComputedStyle(r).getPropertyValue('--paper').trim();
  // while the lamp holds the browser's bar dark (public/theme.js keeps the page's colour in data-was), the colour waits
  // there for dawn() to hand back
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => m.setAttribute(m.hasAttribute('data-was') ? 'data-was' : 'content', c));
}

export function applyTheme() {
  const th = store.s.settings.theme;
  const r = document.documentElement;
  if (th === 'auto') delete r.dataset.theme; else r.dataset.theme = th;
  try { localStorage.setItem('pw.theme', th); } catch { /* private mode */ }
}

// ---------- toasts ----------
// One message at a time. A toast raised in the same moment as the one on screen (one Save can earn a flame and bring a
// run back) joins it as a line of its own, and the box stays until both can be read; a toast raised later takes the
// place of the one before. Announcements (celebrate) wait until no toast is showing.
const SAME_MOMENT = 400;
let shown: { box: HTMLElement; lines: HTMLElement; at: number; until: number; timer: number } | null = null;

export function toast(text: string, icon?: string, ms = 2600, cls = '') {
  const now = performance.now();
  if (shown && now - shown.at < SAME_MOMENT) {
    shown.lines.append(el(html`<span>${text}</span>`));
    stay(shown, Math.max(shown.until, now + ms) + 1000); // a second to read the extra line
    return;
  }
  if (shown) leave(shown);
  const box = el(html`<div class="toast ${cls}">${icon ? raw(icon) : ''}<span class="toast__lines"><span>${text}</span></span></div>`);
  toasts.append(box);
  const m: NonNullable<typeof shown> = { box, lines: box.querySelector<HTMLElement>('.toast__lines')!, at: now, until: 0, timer: 0 };
  shown = m;
  stay(m, now + ms);
}
function stay(m: NonNullable<typeof shown>, until: number) {
  m.until = until;
  clearTimeout(m.timer);
  m.timer = window.setTimeout(() => leave(m), until - performance.now());
}
function leave(m: NonNullable<typeof shown>) {
  clearTimeout(m.timer);
  if (shown === m) shown = null;
  m.box.classList.add('is-out');
  setTimeout(() => m.box.remove(), 400);
}

/** A message that is not the answer to what the reader just did (what the lamp did, what flames are): it waits its turn,
 *  and says what is true when it shows (`text` may be a function). */
export function announce(text: string | (() => string), icon?: string, ms = 2600, cls = '') {
  queued.push(() => toast(typeof text === 'function' ? text() : text, icon, ms, cls));
  flushCelebrations();
}

// ---------- sheets ----------
export interface SheetHandle { el: HTMLElement; close: () => void }
export function sheet(content: Html, opts: { label: string; onClose?: () => void; cls?: string }): SheetHandle {
  const scrim = el(html`<div class="scrim"></div>`);
  const box = el(html`<div class="sheet ${opts.cls || ''}" role="dialog" aria-modal="true" aria-label="${opts.label}"><div class="sheet__grip"></div>${content}</div>`);
  document.body.append(scrim, box);
  const prev = document.activeElement as HTMLElement | null;
  requestAnimationFrame(() => { scrim.classList.add('is-in'); box.classList.add('is-in'); });
  const focusable = () => [...box.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled') && !x.hidden);
  setTimeout(() => (focusable()[0] || box).focus?.(), 60);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    scrim.classList.remove('is-in');
    box.classList.remove('is-in');
    document.removeEventListener('keydown', key);
    setTimeout(() => { scrim.remove(); box.remove(); }, 420);
    prev?.focus?.();
    opts.onClose?.();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = focusable();
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', key);
  scrim.addEventListener('click', close);
  box.addEventListener('click', (e) => { if ((e.target as Element).closest('[data-close]')) close(); });
  return { el: box, close };
}

// Big moments (a level up, a lamp milestone, the day's rite, what the lamp and flames mean) wait their turn and show one
// at a time: never behind a card or the lamp, never over a machine that is dispensing one, never over an open sheet or
// a toast (a level-up sheet opened over the flames explainer; after Skip two messages arrived together). A sheet's turn
// ends when it closes, a toast's when it has gone; one that is still loading (a milestone's line) keeps its turn.
type Moment = () => void | Promise<void>;
const queued: Moment[] = [];
let starting = 0; // until then, the moment just played is still putting itself on screen
let waiting = 0;
const busy = () => {
  const c = document.documentElement.classList;
  return c.contains('has-reveal') || c.contains('has-ritual') || c.contains('is-pulling') || !!shown || !!document.querySelector('.sheet.is-in') || performance.now() < starting;
};
function play(fn: Moment) {
  starting = performance.now() + 600;
  const r = fn();
  if (r instanceof Promise) { starting = Infinity; void r.finally(() => { starting = performance.now() + 600; }); }
}
function celebrate(fn: Moment, first = false) {
  if (!queued.length && !busy()) return play(fn);
  first ? queued.unshift(fn) : queued.push(fn);
  flushCelebrations();
}
/** The screen may be free: the next waiting moment plays after a short beat, as soon as nothing else is showing. */
export function flushCelebrations() {
  clearTimeout(waiting);
  const next = () => {
    if (!queued.length) return;
    if (busy()) { waiting = window.setTimeout(next, 400); return; }
    play(queued.shift()!);
  };
  waiting = window.setTimeout(next, 450);
}

/**
 * Once, at a moment worth keeping (the lamp's third day, the third line kept): an invitation to keep it on every device
 * (src/ui/signin.ts). It waits for whatever is on screen, and never comes back. Signed-in readers never see it.
 */
export function offerAccount(reason: 'lamp' | 'notes') {
  try { if (localStorage.getItem('pw.acct') || localStorage.getItem('pw.invited')) return; } catch { return; }
  // in its own turn, like every announcement: after a milestone it opened over the lamp's toast
  setTimeout(() => celebrate(() => import('./signin').then((m) => m.invite(reason), () => {})), 1200);
}

function levelUp(level: number, title: string) {
  sfx.levelup();
  const cap = maxFlames(level), rose = cap > maxFlames(level - 1);
  sheet(html`
    <div class="levelup">
      <div class="levelup__burst" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => html`<i style="--i:${i}"></i>`)}</div>
      <p class="label th">${t('ระดับใหม่', 'Level up')}</p>
      <p class="levelup__num num">${level}</p>
      <h2 class="h1">${phrases(title)}</h2>
      ${rose ? html`<p class="muted">${t(`ตอนนี้ได้ไฟสูงสุดวันละ ${cap} ดวง`, `You now get up to ${cap} flames a day`)}</p>` : ''}
      <button class="btn btn--ember" data-close>${t('ไปต่อ', 'Continue')}</button>
    </div>`, { label: t('เลื่อนระดับ', 'Level up'), cls: 'sheet--center', onClose: flushCelebrations });
}

// ---------- lamp milestones ----------
// One checked line for each milestone (docs/RETENTION.md 2.6). Ids from public/data/quotes.
const MILESTONE_LINE: Record<number, string> = { 3: 'zMrE2nmI', 7: '6GI6HBNq', 14: 'sZb76uIn', 30: '787K6mEd' };
const LAMPS_LINE = 'E4HIFKpF'; // Beckett: try again, fail better; for totals, which count every return

export function lampMilestone(m: { kind: 'streak' | 'lit'; n: number }) {
  celebrate(async () => {
    const id = m.kind === 'lit' ? LAMPS_LINE : MILESTONE_LINE[m.n] || MILESTONE_LINE[30];
    const [q, authors] = await Promise.all([findQuote(id).catch(() => null), loadAuthors().catch(() => ({} as Record<string, Author>))]);
    sfx.levelup();
    const a = q ? authors[q.author] : undefined;
    const title = m.kind === 'lit'
      ? t(`จุดตะเกียงมาแล้ว ${m.n} ดวง`, `${m.n} lamps lit`)
      : t(`จุดตะเกียงครบ ${m.n} วัน`, m.n === 7 ? 'Seven days of lamplight' : `${m.n} days of lamplight`);
    sheet(html`
      <div class="levelup milestone">
        <div class="milestone__lamp" aria-hidden="true">${raw(ICON.flame)}</div>
        <p class="label th">${m.kind === 'lit' ? t('ทุกครั้งที่กลับมานับหมด', 'Every return counts') : t('ตะเกียงของคุณ', 'Your lamp')}</p>
        <h2 class="h1">${title}</h2>
        <p class="muted">${t('เปลวตะเกียงของคุณโตขึ้นอีกนิด รับไฟเพิ่ม 2 ดวง', 'Your lamp burns a little brighter. 2 extra flames.')}</p>
        ${q ? html`<blockquote class="milestone__q"><p lang="${isEn() ? 'en' : 'th'}">${phrases(quoteLines(q).main)}</p><cite>${nameHtml(a, q.author)}</cite></blockquote>` : ''}
        <button class="btn btn--ember" data-close>${t('ไปต่อ', 'Continue')}</button>
      </div>`, { label: title, cls: 'sheet--center', onClose: flushCelebrations });
    requestAnimationFrame(() => fitPhrases(document.body.querySelector('.milestone') || document.body));
    if (m.kind === 'streak' && m.n === 3) offerAccount('lamp');
  }, true);
}
