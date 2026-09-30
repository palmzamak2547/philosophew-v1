import { html, raw, el, reducedMotion } from '../core/dom';
import type { Author, Quote } from '../core/data';
import type { Finish } from '../core/store';
import { store } from '../core/store';
import { saveNote, canPull, unlimited } from '../core/game';
import { card, tilt, finishLabel, authorName, quoteLines } from './card';
import { ICON } from './icons';
import { loadAuthors } from '../core/data';
import { speak, stopSpeaking, whenVoice } from '../core/speech';
import { toast, announce, flushCelebrations, offerAccount } from './shell';
import { openNoteEditor } from './note-editor';
import { openShare } from './share';
import { explainVerify } from './verify';
import { sfx, haptic } from '../core/audio';
import { t, isEn } from '../core/i18n';
import { fitPhrases } from '../core/thai';

export interface RevealOpts {
  quote: Quote;
  author?: Author;
  finish: Finish;
  from: { x: number; y: number };
  newAuthor: boolean;
  onAgain: () => void;
  onClose: () => void;
}

/** The card's scene as it opens: the scrim, the banner of a rare finish, the card face down and flipping, its actions. */
function scene(q: Quote, author: Author | undefined, finish: Finish, isNew: boolean, coach: boolean, rehearsal = false) {
  return el(html`
    <div class="${rehearsal ? 'card-rehearsal' : 'reveal'}" ${rehearsal ? raw('aria-hidden="true" inert') : html`role="dialog" aria-modal="true" aria-label="${t('คำคมที่ได้', 'Your quote')}"`}>
      <div class="reveal__scrim"></div>
      ${finish !== 'paper' ? html`<p class="reveal__banner reveal__banner--${finish}">${finishLabel(finish)}</p>` : ''}
      <button class="icon-btn reveal__close" aria-label="${t('ปิด', 'Close')}" data-act="close">${raw(ICON.close)}</button>
      <div class="reveal__stage">${card(q, author, { finish, isNew, back: true, cls: 'is-flipping' })}</div>
      <div class="reveal__actions">
        <div class="reveal__row">
          <button class="rbtn" data-act="save"></button>
          <button class="rbtn" data-act="note">${raw(ICON.pen)}<span>${t('เขียนความคิด', 'Reflect')}</span></button>
          <button class="rbtn" data-act="listen" hidden>${raw(ICON.soundOn)}<span>${t('ฟัง', 'Listen')}</span></button>
          <button class="rbtn" data-act="share">${raw(ICON.share)}<span>${t('แชร์', 'Share')}</span></button>
        </div>
        ${coach ? html`<p class="reveal__coach">${t('ชอบประโยคนี้ไหม เก็บลงสมุดไว้อ่านซ้ำได้', 'Like this line? Keep it in your notebook.')}</p>` : ''}
        <button class="btn btn--accent btn--xl reveal__again" data-act="again"></button>
      </div>
      ${rehearsal ? '' : html`<p class="sr" aria-live="assertive">${quoteLines(q).main}, ${authorName(author)}</p>`}
    </div>`);
}

/** Fit card + actions on any screen: scale the card down rather than letting the buttons fall off. */
function fitScene(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('.reveal__stage')!;
  fitPhrases(stage);
  stage.style.transform = '';
  stage.style.marginBottom = '';
  const cs = getComputedStyle(root);
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const actions = root.querySelector<HTMLElement>('.reveal__actions')!.offsetHeight + 18;
  const s = Math.max(0.68, Math.min(1, (innerHeight - pad - actions) / stage.offsetHeight));
  if (s < 1) {
    stage.style.transform = `scale(${s.toFixed(3)})`;
    stage.style.marginBottom = `${(-(1 - s) * stage.offsetHeight).toFixed(1)}px`;
  }
}

/** The card leaves the capsule at (dx, dy) from where it lands, spins, and lands face up. */
function fly(inner: HTMLElement, dx: number, dy: number, landed: () => void) {
  if (reducedMotion()) {
    inner.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out', fill: 'both' }).onfinish = landed;
    return;
  }
  inner.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(.1) rotateY(180deg) rotateZ(-18deg)`, opacity: 0 },
    { opacity: 1, offset: 0.12 },
    { transform: `translate(${dx * 0.1}px, ${dy * 0.1 - 40}px) scale(1.04) rotateY(40deg) rotateZ(3deg)`, offset: 0.62 },
    { transform: 'none', opacity: 1 },
  ], { duration: 1150, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }).onfinish = landed;
}

let rehearsed = false, rehearsal: HTMLElement | null = null;
/**
 * The first card's whole entrance, played once where nobody can see or reach it (a foil card, at a five-hundredth of
 * its opacity, inert and hidden from assistive tech), at a quiet moment before the first real one. Chrome makes the GPU
 * programs for a card's gradients, blends, 3D turn and blurs the first time it draws them: about forty, 0.3 to 0.7 s on
 * a phone-class GPU with a cold cache, and made during the real flight they swallowed most of it (measured: 40 to 43
 * programs and a 420 ms gap in the flight; after a rehearsal, 1 program and no gap over 50 ms). The flight and the
 * landing (the words coming into focus, the shine, the actions) play together: 1.3 s. Resolves when it is over.
 */
export async function rehearse(q: Quote, author: Author | undefined) {
  if (rehearsed || rehearsal || document.hidden) return;
  const root = (rehearsal = scene(q, author, 'foil', true, true, true));
  document.body.append(root);
  const cardEl = root.querySelector<HTMLElement>('.qcard')!, inner = cardEl.querySelector<HTMLElement>('.qcard__inner')!;
  await root.querySelector('img')?.decode().catch(() => {}); // the portrait's blends are made only once it is drawn
  if (rehearsal !== root) return; // stopped meanwhile
  fitScene(root); // the same size and scale as the real card, so the same programs
  root.classList.add('is-in');
  await new Promise<void>((done) => {
    fly(inner, 0, innerHeight * 0.3, done);
    setTimeout(() => { cardEl.classList.remove('is-flipping'); cardEl.classList.add('is-revealed'); }, 150);
  });
  if (rehearsal === root) { rehearsed = true; stopRehearsal(); }
}

/** A real pull is starting, or the room is left: the rehearsal steps aside at once (a later quiet moment may try again). */
export function stopRehearsal() {
  rehearsal?.remove();
  rehearsal = null;
}

export function reveal(o: RevealOpts) {
  const q = o.quote;
  const firstEver = !store.s.introDone; // the first card coaches once: keep it, then what the lamp and flames mean
  const root = scene(q, o.author, o.finish, o.newAuthor, firstEver);
  document.body.append(root);
  // the card is modal: the app behind it can be neither clicked nor tabbed into (sheets from the card live outside #app)
  const app = document.getElementById('app');
  app?.setAttribute('inert', '');
  document.documentElement.classList.add('has-reveal');
  const cardEl = root.querySelector<HTMLElement>('.qcard')!;
  const inner = cardEl.querySelector<HTMLElement>('.qcard__inner')!;
  const againBtn = root.querySelector<HTMLButtonElement>('[data-act="again"]')!;
  const saveBtn = root.querySelector<HTMLButtonElement>('[data-act="save"]')!;

  const paint = () => {
    const f = store.s.flames;
    againBtn.innerHTML = canPull() ? `${ICON.again}<span>${t('สุ่มอีกครั้ง', 'Pull again')}</span><span class="again__cost">${ICON.flame}${unlimited() ? '∞' : f}</span>` : `<span>${t('ไฟวันนี้หมดแล้ว', 'No flames left today')}</span>`;
    againBtn.disabled = !canPull();
    const saved = !!store.s.notes[q.id];
    saveBtn.classList.toggle('is-on', saved);
    saveBtn.innerHTML = `${saved ? ICON.saved : ICON.save}<span>${saved ? t('อยู่ในสมุดแล้ว', 'Kept') : t('เก็บลงสมุด', 'Keep')}</span>`;
  };
  paint();
  const unsub = store.subscribe(paint);

  const fit = () => fitScene(root);
  fit();
  addEventListener('resize', fit);

  // entrance: the card leaves the capsule, spins, and lands face up. It starts now, in the frame that first draws it:
  // a machine presents from inside the stage's frame callback, where a requestAnimationFrame only runs a frame later,
  // so the finished card used to paint once at full size before its flight began. fit() has already laid the card out
  // (and resolved the scrim's style), so is-in still starts every transition from where it was.
  root.classList.add('is-in');
  const r = cardEl.getBoundingClientRect();
  fly(inner, o.from.x - (r.left + r.width / 2), o.from.y - (r.top + r.height / 2), () => { cardEl.classList.remove('is-flipping'); cardEl.classList.add('is-revealed'); });
  setTimeout(() => { sfx.reveal(q.school); haptic([10, 40, 16]); }, reducedMotion() ? 0 : 520);
  const offTilt = o.finish !== 'paper' || !matchMedia('(pointer: coarse)').matches ? tilt(cardEl) : () => {};

  let closed = false;
  const close = (again = false) => {
    if (closed) return;
    closed = true;
    app?.removeAttribute('inert');
    stopSpeaking();
    unsub();
    offTilt();
    document.removeEventListener('keydown', key);
    removeEventListener('resize', fit);
    root.classList.remove('is-in');
    root.classList.add('is-out');
    document.documentElement.classList.remove('has-reveal');
    setTimeout(() => root.remove(), 420);
    if (firstEver) {
      store.update((s) => { s.introDone = true; });
      // after anything that was waiting for the card (a level up), and in its own turn: it once sat under that sheet
      announce(() => t(`ตะเกียงนับวันที่คุณแวะมา ส่วนไฟคือจำนวนครั้งที่หมุนตู้ได้วันนี้ เหลืออีก ${store.s.flames} ดวง`, `The lamp counts the days you visit. Flames are today's pulls: ${store.s.flames} left.`), ICON.flame, 5200);
    }
    flushCelebrations();
    if (Object.keys(store.s.notes).length >= 3) offerAccount('notes'); // something worth keeping on every device
    if (again) o.onAgain(); else o.onClose();
  };
  // Escape closes the card and stops there: the room behind must not read it as "leave the room". Tab cycles
  // inside the card (a sheet opened over it keeps its own focus)
  const focusable = () => [...root.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled') && x.offsetParent !== null);
  const key = (e: KeyboardEvent) => {
    if (document.querySelector('.sheet.is-in')) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusable();
    if (!f.length) return;
    const i = f.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  };
  document.addEventListener('keydown', key);

  root.addEventListener('click', (e) => {
    const target = (e.target as Element).closest<HTMLElement>('[data-act],[data-verify]');
    if (!target) return;
    if (target.dataset.verify) return explainVerify(q);
    switch (target.dataset.act) {
      case 'close': return close();
      case 'again': return close(true);
      case 'save':
        if (store.s.notes[q.id]) { toast(t('อยู่ในสมุดแล้ว เปิดดูได้ที่หน้าสมุด', 'Already in your notebook'), ICON.book); return; }
        saveNote(q, '', o.finish);
        sfx.stamp();
        const coach = root.querySelector<HTMLElement>('.reveal__coach');
        if (coach && o.newAuthor) {
          // the coach line becomes the answer, in place: no toast over the card
          void loadAuthors().then((all) => {
            coach.textContent = t(`เก็บแล้ว นี่คือนักปรัชญาคนแรกของคุณ (${Object.keys(store.s.authors).length} จาก ${Object.keys(all).length} คน)`, `Kept. Your first philosopher: ${Object.keys(store.s.authors).length} of ${Object.keys(all).length}.`);
            coach.classList.add('is-done');
          });
        } else {
          coach?.remove();
          toast(t('เก็บลงสมุดแล้ว', 'Kept in your notebook'), ICON.saved);
        }
        return;
      case 'note': return openNoteEditor(q, o.author, o.finish);
      case 'listen': return listen(target);
      case 'share': return openShare(q, o.author, o.finish);
    }
  });
  // read aloud with the device's own voice; the button appears only if there is a voice for the language
  const lang = isEn() ? 'en' : 'th';
  void whenVoice(lang).then((ok) => { if (ok && !closed) root.querySelector<HTMLElement>('[data-act="listen"]')!.hidden = false; });
  const listen = (btn: HTMLElement) => {
    const paintBtn = (on: boolean) => { btn.innerHTML = on ? `${ICON.stop}<span>${t('หยุด', 'Stop')}</span>` : `${ICON.soundOn}<span>${t('ฟัง', 'Listen')}</span>`; btn.classList.toggle('is-on', on); };
    if (btn.classList.contains('is-on')) { stopSpeaking(); paintBtn(false); return; }
    const lines = quoteLines(q);
    if (speak(`${lines.main}, ${authorName(o.author, q.author)}`, lang, () => paintBtn(false))) paintBtn(true);
  };
  setTimeout(() => againBtn.focus({ preventScroll: true }), 900);
  return { close: () => close() };
}
