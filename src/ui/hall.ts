import * as THREE from 'three';
import { html, raw, $, reducedMotion } from '../core/dom';
import { go, back } from '../core/router';
import { store } from '../core/store';
import { pull, canPull, unlimited, maxFlames, levelOf, starterQuote, sessionMoods, type Pull } from '../core/game';
import { openFeel } from './feel';
import { loadSchool, loadAuthors, type Author } from '../core/data';
import { SCHOOLS, SCHOOL, MOODS, L, isSchool, type SchoolId, type School } from '../content/schools';
import { getStage, peekStage, type Stage } from '../gl/stage';
import { Gallery } from '../gl/gallery';
import type { Machine } from '../gl/machines/base';
import { screen, setTone, chrome, sheet, flushCelebrations, unpre, toast } from './shell';
import { reveal, rehearse, stopRehearsal } from './reveal';
import { ICON } from './icons';
import { sfx, ambience, unlock } from '../core/audio';
import { t } from '../core/i18n';
import { phrases, fitPhrases } from '../core/thai';
import { couldNotLoad } from './offline';

type MachineCtor = new (s: School, st: Stage) => Machine;
const LOADERS: Record<SchoolId, () => Promise<MachineCtor>> = {
  stoic: () => import('../gl/machines/stoic').then((m) => m.StoicMachine),
  existential: () => import('../gl/machines/existential').then((m) => m.ExistentialMachine),
  eastern: () => import('../gl/machines/eastern').then((m) => m.EasternMachine),
  absurd: () => import('../gl/machines/absurd').then((m) => m.AbsurdMachine),
  socratic: () => import('../gl/machines/socratic').then((m) => m.SocraticMachine),
};

let gallery: Gallery | null = null;
let lastFocus = 0;

function getGallery(stage: Stage) {
  if (!gallery) gallery = new Gallery(stage, async (s, st) => new (await LOADERS[s.id]())(s, st));
  return gallery;
}

/** Leaving the hall for a flat page: freeze the 3D so it costs nothing. A page opened cold never builds it. */
export function sleepHall() {
  gallery?.setActive(false);
  peekStage()?.setView(null, null);
}

/**
 * The session's first card, rehearsed unseen (reveal.ts rehearse) while nothing moves on screen: the page after the
 * breath (main.ts), or a room left alone for a moment. Never fails: offline, the first card compiles as it flies.
 */
export async function rehearseCard(id: SchoolId = SCHOOLS[lastFocus].id) {
  try {
    const [pool, authors] = await Promise.all([loadSchool(id), loadAuthors()]);
    const q = pool.find((x) => authors[x.author]?.portrait?.file) ?? pool[0]; // a portrait: its blends are part of it
    if (q) await rehearse(q, authors[q.author]);
  } catch { /* not saved offline yet */ }
}

/** What a hall page needs before the screen changes (the router waits for it): the machine's code, and a room's cards. */
export function prepareHall(params: { school?: string }) {
  const id = params.school && isSchool(params.school) ? params.school : SCHOOLS[lastFocus].id;
  const inRoom = !!params.school;
  return Promise.all([getStage() ? LOADERS[id]() : null, inRoom ? loadSchool(id) : null, inRoom ? loadAuthors() : null]);
}

export async function hallView(params: { school?: string }) {
  const stage = getStage();
  if (!stage) return fallbackView(params);
  const g = getGallery(stage);
  const inRoom = !!params.school && isSchool(params.school);
  const idx = inRoom ? SCHOOLS.findIndex((s) => s.id === params.school) : lastFocus;
  const first = !g.machines.some(Boolean);
  g.setActive(true);
  g.focus(idx, first);
  // drawn once its own floor and dust are compiled (at once after the first time); a page opened meanwhile keeps it asleep
  void g.ready.then(() => { if (g.isActive) stage.setView(g.scene, g.camera); });
  // the words first, the machine alongside: a slow phone (or a search engine's renderer, which may never finish the 3D)
  // had no heading and no text until the machine was built. The room waits for its machine itself before a pull.
  const machine = g.ensure(idx);
  const view = inRoom ? roomMode(g, SCHOOLS[idx].id, first) : browseMode(g, first);
  // its own h1 is drawn: the prerendered text goes now, not once the machine is built (two h1 in the meantime). Behind
  // the lamp it stays: the hall's words are not shown there (main.ts removes it when the hall is ready)
  if (!document.documentElement.classList.contains('has-ritual')) unpre();
  await machine;
  return view;
}

/** Measure where the text blocks are and tell the camera which rectangle is free for the machine. */
function measure(g: Gallery, mode: 'browse' | 'room') {
  const W = innerWidth, H = innerHeight;
  const box = (sel: string) => screen.querySelector(sel)?.getBoundingClientRect();
  const wide = W >= 900 || (W > H && H <= 520); // a desktop, or a phone held sideways: card left, machine right
  let free: { top: number; bottom: number; left: number; right: number };
  if (mode === 'browse') {
    const mood = box('.hall__mood'), card = box('.hall__card'), nav = box('.hall__nav');
    // the floating dock covers the bottom middle of a wide screen: the machine stands above it, whatever the layout
    const dock = document.querySelector('nav.nav')?.getBoundingClientRect(), dockTop = dock && dock.height ? dock.top : H;
    if (wide) free = { top: H <= 520 ? 64 : 96, bottom: Math.min(nav?.top ?? H - 110, dockTop) - 12, left: (card?.right ?? W * 0.4) + (H <= 520 ? 16 : 40), right: W - (H <= 520 ? 16 : 48) };
    else free = { top: (mood?.bottom ?? 130) + 16, bottom: (card?.top ?? H * 0.55) - 16, left: 16, right: W - 16 };
  } else {
    const motto = box('.room__motto'), bottom = box('.room__gift') || box('.room__hint');
    free = { top: (motto?.bottom ?? 130) + 16, bottom: (bottom?.top ?? H - 190) - 16, left: 16, right: W - 16 };
  }
  g.setSafe(mode, free);
  placeToasts(free);
}

/** Messages in the hall stand where the machine is, never over its words or its row of feelings (the lamp's toast after
 *  Skip hid "How are you feeling today?"): toasts let every touch through, so the machine can still be used. */
function placeToasts(r: { top: number; left: number; right: number } | null) {
  const s = document.documentElement.style;
  if (!r) { ['--toast-top', '--toast-x', '--toast-w'].forEach((k) => s.removeProperty(k)); return; }
  s.setProperty('--toast-top', `${Math.round(r.top)}px`);
  s.setProperty('--toast-x', `${Math.round((r.left + r.right) / 2)}px`);
  s.setProperty('--toast-w', `${Math.round(r.right - r.left)}px`);
}

// ---------------- browse ----------------
function browseMode(g: Gallery, first: boolean) {
  chrome('full');
  g.setRoom(false, first);
  screen.className = 'passthrough';
  screen.innerHTML = html`
    <section class="hall">
      <div class="hall__mood panel" data-interactive>
        <p class="hall__ask">${t('วันนี้ใจเป็นยังไงบ้าง', 'How are you feeling today?')}</p>
        ${store.s.introDone ? '' : html`<p class="hall__coach">${t('เลือกสักข้อ เดี๋ยวเราพาไปตู้ที่เข้ากับใจคุณ', "Pick one and we'll take you to the machine that fits.")}</p>`}
        <div class="hall__moods">
          ${MOODS.map((m) => html`<button class="chip" data-mood="${m.school}" data-mood-id="${m.id}">${L(m.label)}</button>`)}
          <button class="chip chip--pen" data-feel>${raw(ICON.pen)}${t('พิมพ์เล่าเอง', 'In my own words')}</button>
          <button class="chip" data-mood="random">${t('สุ่มให้หน่อย', 'Surprise me')}</button>
        </div>
      </div>
      <div class="hall__info" data-info aria-live="polite"></div>
      <div class="hall__nav" data-interactive>
        <button class="icon-btn hall__arrow" data-step="-1" aria-label="${t('ตู้ก่อนหน้า', 'Previous machine')}">${raw(ICON.back)}</button>
        <ol class="hall__dots">${SCHOOLS.map((s, i) => html`<li><button data-dot="${i}" aria-label="${L(s.name)}"></button></li>`)}</ol>
        <button class="icon-btn hall__arrow hall__arrow--next" data-step="1" aria-label="${t('ตู้ถัดไป', 'Next machine')}">${raw(ICON.back)}</button>
      </div>
    </section>`.s;
  const info = $('[data-info]', screen)!;
  const paint = (i: number) => {
    lastFocus = i;
    const s = SCHOOLS[i];
    setTone(s);
    g.setTone(s);
    info.innerHTML = html`
      <div class="hall__card panel" data-interactive>
        <p class="hall__count num">0${i + 1} <span>/ 05</span></p>
        <h1 class="hall__title">${L(s.name)}</h1>
        <p class="hall__en">${L(s.sub)}</p>
        <p class="hall__tag">${L(s.tagline)}</p>
        <p class="hall__for"><b>${t('เหมาะกับคนที่', 'For you if')}</b> ${phrases(L(s.forWho))}</p>
        <ul class="hall__kw">${L(s.keywords).map((k) => html`<li>${k}</li>`)}</ul>
        <div class="hall__cta">
          <a class="btn btn--accent btn--xl" href="/s/${s.id}">${raw(ICON.arrow)}${t('ลองตู้นี้', 'Try it')}</a>
          <p class="hall__machine muted">${L(s.machine.name)}</p>
        </div>
      </div>`.s;
    screen.querySelectorAll<HTMLButtonElement>('[data-dot]').forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    ambience(null);
    requestAnimationFrame(() => measure(g, 'browse'));
  };
  paint(g.focused);
  g.onFocus = (i) => { paint(i); sfx.whoosh(); };
  g.onSelect = (i) => go(`/s/${SCHOOLS[i].id}`);

  const click = (e: Event) => {
    const el = e.target as Element;
    const step = el.closest<HTMLElement>('[data-step]');
    const dot = el.closest<HTMLElement>('[data-dot]');
    const mood = el.closest<HTMLElement>('[data-mood]');
    let next: number | null = null;
    if (step) next = Math.max(0, Math.min(4, g.focused + Number(step.dataset.step)));
    if (dot) next = Number(dot.dataset.dot);
    if (el.closest('[data-feel]')) {
      openFeel((school, moods) => { sessionMoods.set(moods); go(`/s/${school}`); });
      return;
    }
    if (mood) {
      const m = mood.dataset.mood!;
      next = m === 'random' ? (Math.random() * 5) | 0 : SCHOOLS.findIndex((s) => s.id === m);
      sessionMoods.set(mood.dataset.moodId ? [mood.dataset.moodId] : []);
      screen.querySelectorAll('[data-mood]').forEach((c) => c.classList.toggle('is-on', c === mood));
      // a first visit goes straight to the machine: the first win comes before any browsing
      if (!store.s.introDone) { sfx.whoosh(); setTimeout(() => go(`/s/${SCHOOLS[next!].id}`), 160); return; }
    }
    if (next !== null && next !== g.focused) { g.focus(next); paint(next); sfx.whoosh(); }
  };
  const key = (e: KeyboardEvent) => {
    if ((e.target as Element).closest('input, textarea') || document.querySelector('.sheet')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const n = Math.max(0, Math.min(4, g.focused + (e.key === 'ArrowRight' ? 1 : -1)));
      if (n !== g.focused) { g.focus(n); paint(n); sfx.whoosh(); }
    }
  };
  const onResize = () => measure(g, 'browse');
  screen.addEventListener('click', click);
  addEventListener('keydown', key);
  addEventListener('resize', onResize);
  return () => {
    screen.removeEventListener('click', click);
    removeEventListener('keydown', key);
    removeEventListener('resize', onResize);
    g.onFocus = () => {};
    g.onSelect = () => {};
    screen.className = '';
    placeToasts(null);
  };
}

// ---------------- room ----------------
async function roomMode(g: Gallery, id: SchoolId, first: boolean) {
  const s = SCHOOL[id];
  chrome('immersive');
  setTone(s);
  g.setTone(s);
  g.setRoom(true, first || reducedMotion());
  screen.className = 'passthrough';
  screen.innerHTML = html`
    <section class="room">
      <header class="room__top" data-interactive>
        <button class="icon-btn room__back" data-back aria-label="${t('กลับไปเลือกตู้', 'Back to the machines')}">${raw(ICON.back)}</button>
        <div class="room__title"><p class="room__school">${L(s.name)}</p><h1 class="room__name">${L(s.machine.name)}</h1><p class="room__met" data-met></p></div>
        <button class="icon-btn" data-sound aria-label="${t('เปิดปิดเสียง', 'Sound on or off')}"></button>
      </header>
      <p class="room__motto">${L(s.machine.motto)}</p>
      <div class="room__bottom">
        ${store.s.pulls === 0 ? html`<p class="room__gift">${raw(ICON.stars)}${t('การ์ดใบแรกเป็นของขวัญ ได้การ์ดฟอยล์แน่นอน', "Your first card is a gift. It's always foil.")}</p>` : ''}
        <p class="room__hint" data-hint></p>
        <button class="btn btn--accent btn--xl room__pull" data-pull>
          <svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" class="ring__t"/><circle cx="20" cy="20" r="16" class="ring__b" data-ring/></svg>
          <span data-action>${L(s.machine.action)}</span>
          <span class="again__cost">${raw(ICON.flame)}1</span>
        </button>
        <p class="room__flames"><span data-flames-left></span> <button class="room__odds" data-odds>${t('ดูโอกาส', 'Odds')}</button></p>
      </div>
    </section>`.s;
  measure(g, 'room');
  const onResize = () => measure(g, 'room');
  addEventListener('resize', onResize);
  const ring = $('[data-ring]', screen) as unknown as SVGCircleElement;
  const C = 2 * Math.PI * 16;
  ring.style.strokeDasharray = `${C}`;
  const setProgress = (p: number) => { ring.style.strokeDashoffset = `${C * (1 - p)}`; };
  setProgress(0);
  const hint = $('[data-hint]', screen)!;
  // Shaking on an iPhone needs the reader's yes to a system prompt, and the room used to ask on the first touch every
  // visit (readers called it a strange alert). Now the prompt comes only from a tap on "or shake your phone"; a yes is
  // remembered on this device (pw.motion), and then asked for again on the first touch of a visit, as iOS requires.
  const DM = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
  const askable = !!s.machine.still && typeof DM?.requestPermission === 'function';
  const shakeOn = () => { try { return localStorage.getItem('pw.motion') === 'on'; } catch { return false; } };
  const idleHint = () => {
    if (askable && !shakeOn()) hint.innerHTML = html`${L(s.machine.still!)} <button class="room__odds" data-shake>${t('หรือเขย่ามือถือ', 'or shake your phone')}</button>`.s;
    else hint.textContent = L(s.machine.hint);
  };
  idleHint();
  const pullBtn = $<HTMLButtonElement>('[data-pull]', screen)!;
  const left = $('[data-flames-left]', screen)!;
  const soundBtn = $<HTMLButtonElement>('[data-sound]', screen)!;
  const paintSound = () => { soundBtn.innerHTML = store.s.settings.sound ? ICON.soundOn : ICON.soundOff; soundBtn.setAttribute('aria-pressed', String(store.s.settings.sound)); };
  paintSound();
  const paintFlames = () => {
    const f = store.s.flames;
    const max = maxFlames(levelOf(store.s.xp).level);
    left.innerHTML = unlimited() ? t('ไฟไม่จำกัด สุ่มได้เรื่อยๆ', 'Unlimited flames. Pull as often as you like.') : f > 0
      ? (f > max ? t(`ไฟวันนี้เหลือ <b class="num">${f}</b> ดวง`, `<b class="num">${f}</b> flames left today`) // a milestone's bonus: over the cap
        : t(`ไฟวันนี้เหลือ <b class="num">${f}</b> จาก ${max} ดวง`, `<b class="num">${f}</b> of ${max} flames left today`))
      : t('ไฟวันนี้หมดแล้ว พรุ่งนี้จะเติมให้ใหม่ หรือเขียนความคิดลงสมุดเพื่อรับไฟคืน', 'No flames left today. They refill tomorrow, or you can write a reflection to earn one back.');
    pullBtn.classList.toggle('is-empty', !canPull());
  };
  paintFlames();
  const unsub = store.subscribe(paintFlames);

  const [pool, authors] = await Promise.all([loadSchool(id), loadAuthors()]);
  const here = [...new Set(pool.map((q) => q.author))];
  const paintMet = () => {
    const met = here.filter((a) => store.s.authors[a]).length, left = here.length - met;
    $('[data-met]', screen)!.textContent = left === 0
      ? t(`เจอครบทั้ง ${here.length} คนแล้ว`, `All ${here.length} thinkers met`)
      : left <= 2 && met > 0 ? t(`อีก ${left} คนก็ครบตู้`, `${left} more and this machine is complete`)
      : t(`เจอแล้ว ${met} จาก ${here.length} คน`, `${met} of ${here.length} thinkers met`);
  };
  paintMet();
  const unsubMet = store.subscribe(paintMet);
  const machine = (await g.ensure(SCHOOLS.findIndex((x) => x.id === id)))!;
  let current: Pull | null = null;
  let open: { close: () => void } | null = null;
  const idle = () => { pullBtn.classList.remove('is-busy'); idleHint(); };

  const host = g.host({
    commit: async () => {
      if (!canPull()) { noFlames(); hint.textContent = t('ไฟวันนี้หมดแล้ว', 'No flames left today'); return null; }
      const moods = sessionMoods.get();
      // held BEFORE the pull: the pull's level-up is announced inside it, and once came up as a sheet over the card, where
      // the reader's Keep landed on the sheet (a reader kept four cards and found three). It waits for the card now.
      document.documentElement.classList.add('is-pulling');
      current = store.s.pulls === 0 ? pull(pool, starterQuote(pool, moods), { finish: 'foil' }) : pull(pool, undefined, { moods });
      if (!current) { document.documentElement.classList.remove('is-pulling'); flushCelebrations(); return null; }
      $('.room__gift', screen)?.remove();
      pullBtn.classList.add('is-busy');
      return { finish: current.finish };
    },
    present: (world: THREE.Vector3) => {
      if (!current) return;
      const p = getStage()!.project(world, g.camera);
      const got = current;
      document.documentElement.classList.remove('is-pulling'); // the card itself holds the queue from here
      open = reveal({
        quote: got.quote,
        author: authors[got.quote.author] as Author | undefined,
        finish: got.finish,
        from: p,
        newAuthor: got.newAuthor,
        onAgain: () => { open = null; machine.reset(); idle(); setTimeout(() => void machine.auto(true), 250); },
        onClose: () => { open = null; machine.reset(); idle(); },
      });
    },
    progress: setProgress,
    say: (text: string) => { hint.textContent = text; },
  });
  machine.enter(host);
  ambience(id);
  // no still page came before this room (the lamp skipped, or already lit today): the first card is rehearsed here,
  // once the room has settled; the reader's first touch or key stops it, so it never plays over a pull
  const quiet = setTimeout(() => { if (!open && !machine.busy) void rehearseCard(id); }, 1500);
  addEventListener('pointerdown', stopRehearsal, { capture: true });
  addEventListener('keydown', stopRehearsal, { capture: true });

  const start = () => {
    unlock();
    if (machine.busy || open) return;
    if (!canPull()) return noFlames();
    void machine.auto();
  };
  const click = (e: Event) => {
    const el = e.target as Element;
    if (el.closest('[data-pull]')) return start();
    if (el.closest('[data-back]')) return back('/');
    if (el.closest('[data-shake]')) return askShake(true);
    if (el.closest('[data-odds]')) return oddsSheet(here.length, here.filter((a) => store.s.authors[a]).length);
    if (el.closest('[data-sound]')) {
      store.update((st) => { st.settings.sound = !st.settings.sound; });
      paintSound();
      sfx.toggle(store.s.settings.sound);
      ambience(store.s.settings.sound ? id : null);
    }
  };
  const key = (e: KeyboardEvent) => {
    if (open || document.querySelector('.sheet')) return;
    if (e.key === 'Escape') back('/');
    if ((e.key === ' ' || e.key === 'Enter') && !(e.target as Element).closest('button, a, input, textarea')) { e.preventDefault(); start(); }
  };
  // Shake to draw on phones (the eastern machine listens; the others ignore it). One yes also lets foil and gold cards
  // tilt (the same permission on iOS).
  const askShake = (first: boolean) => {
    sessionStorage.setItem('pw.motion', '1');
    void DM!.requestPermission!().then((r) => {
      try { if (r === 'granted') localStorage.setItem('pw.motion', 'on'); else localStorage.removeItem('pw.motion'); } catch { /* private mode */ }
      if (!machine.busy && !open) idleHint();
      if (first && r !== 'granted') toast(t('ไม่ได้เปิดการเขย่า กดค้างที่กระบอกหรือกดปุ่มได้เหมือนเดิม', 'Shaking stays off. Hold the cup or press the button.'));
    }, () => {});
  };
  const askMotion = () => { if (askable && shakeOn() && !sessionStorage.getItem('pw.motion')) askShake(false); };
  // a touch counts as the tap iOS wants only as it ends (pointerup or click), and a press on the machine
  // lands on the canvas, not on this screen: listen on the window
  addEventListener('pointerup', askMotion, { capture: true });
  addEventListener('click', askMotion, { capture: true });
  let lastShake = 0;
  const motion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    const now = performance.now();
    if (mag > 17 && now - lastShake > 60) { lastShake = now; machine.shake(Math.min(1, (mag - 15) / 14)); }
  };
  screen.addEventListener('click', click);
  addEventListener('keydown', key);
  addEventListener('devicemotion', motion);
  return () => {
    clearTimeout(quiet);
    stopRehearsal();
    removeEventListener('pointerdown', stopRehearsal, { capture: true });
    removeEventListener('keydown', stopRehearsal, { capture: true });
    removeEventListener('pointerup', askMotion, { capture: true });
    removeEventListener('click', askMotion, { capture: true });
    unsub();
    unsubMet();
    open?.close();
    if (document.documentElement.classList.contains('is-pulling')) { document.documentElement.classList.remove('is-pulling'); flushCelebrations(); }
    machine.exit();
    machine.reset();
    ambience(null);
    screen.removeEventListener('click', click);
    removeEventListener('keydown', key);
    removeEventListener('devicemotion', motion);
    removeEventListener('resize', onResize);
    screen.className = '';
    placeToasts(null);
  };
}

/** The real numbers behind every pull (rollFinish, the 40-pull pity, the two nudges in pickQuote). */
function oddsSheet(total: number, met: number) {
  const left = Math.max(1, 40 - store.s.pity);
  sheet(html`
    <div class="verify-sheet odds">
      <p class="label th">${t('โอกาส', 'Odds')}</p>
      <h2 class="h1">${t('โอกาสของการ์ด', 'Card odds')}</h2>
      <ul class="odds__list">
        <li><span>${t('กระดาษ', 'Paper')}</span><b class="num">87.5%</b></li>
        <li><span>${t('ฟอยล์', 'Foil')}</span><b class="num">10%</b></li>
        <li><span>${t('ทองคำเปลว', 'Gold leaf')}</span><b class="num">2.5%</b></li>
      </ul>
      <p>${t(`ได้ทองคำเปลวแน่นอนภายใน 40 ครั้ง ตอนนี้อีกไม่เกิน ${left} ครั้ง`, `Gold leaf is guaranteed within 40 pulls: at most ${left} to go.`)}</p>
      <p>${t('ตู้จะพาไปเจอหน้าใหม่ก่อน ตราบใดที่ตู้นี้ยังมีคนที่คุณไม่เคยเจอ ครึ่งหนึ่งของการสุ่มจะมาจากพวกเขา และถ้าคุณบอกความรู้สึกไว้ ตู้จะเอนไปหาประโยคที่ตรงกับความรู้สึกนั้น', 'Machines introduce new faces first: while someone here is still unmet, half the draws come from them. If you told us how you feel, the machine leans toward lines that match it.')}</p>
      <p class="muted">${t(`ตู้นี้มีนักปรัชญา ${total} คน คุณเจอแล้ว ${met} คน ทุกคนเจอได้ด้วยไฟฟรีรายวัน ไม่ต้องใช้การ์ดหายาก`, `${total} thinkers live in this machine. You've met ${met}. Everyone can be met with the free daily flames; no rare card is ever required.`)}</p>
      <button class="btn btn--ghost" data-close>${t('ปิด', 'Close')}</button>
    </div>`, { label: t('โอกาสของการ์ด', 'Card odds') });
}

function noFlames() {
  sfx.stamp();
  const s = sheet(html`
    <div class="nofire">
      <div class="nofire__lamp" aria-hidden="true">${raw(ICON.lamp)}</div>
      <h2 class="h1">${t('ไฟวันนี้หมดแล้ว', 'Out of flames for today')}</h2>
      <p>${phrases(t('ตะเกียงจะเติมไฟใหม่พรุ่งนี้ตอนคุณกลับมาหายใจอีกครั้ง ระหว่างนี้ลองกลับไปอ่านสิ่งที่เก็บไว้ แล้วเขียนความคิดสั้นๆ รับไฟคืนได้วันละไม่เกิน 3 ดวง', 'Your lamp refills tomorrow when you come back to breathe. Meanwhile, reread what you saved and write a short reflection: up to three flames back a day.'))}</p>
      <div class="row-actions">
        <a class="btn btn--ember" href="/notes" data-close>${raw(ICON.pen)}${t('ไปที่สมุด', 'Open notebook')}</a>
        <a class="btn btn--ghost" href="/library" data-close>${t('เดินเล่นในหอสมุด', 'Browse the library')}</a>
      </div>
      <button class="breathe-cta" data-breathe>${raw(ICON.flame)}<span><b>${t('หายใจกับตะเกียงหนึ่งนาที', 'A minute with the lamp')}</b>${phrases(t('ห้ารอบ ทำตามเปลวไฟ แล้วรับประโยคหนึ่งติดตัวไป', 'Five slow breaths with the flame, then one line to take with you'))}</span></button>
    </div>`, { label: t('ไฟหมด', 'Out of flames') });
  fitPhrases(s.el);
  s.el.querySelector('[data-breathe]')!.addEventListener('click', () => { s.close(); void import('./breathe').then((m) => m.openBreathe(), () => couldNotLoad('part')); });
}

// ---------------- no WebGL: the same flow, drawn flat ----------------
async function fallbackView(params: { school?: string }) {
  chrome('full');
  const id = params.school && isSchool(params.school) ? params.school : null;
  if (!id) {
    setTone(null);
    screen.innerHTML = html`
      <section class="page">
        <h1 class="h1">${t('เลือกตู้ปรัชญา', 'Choose a machine')}</h1>
        <div class="flat-list">${SCHOOLS.map((s) => html`<a class="flat-school" href="/s/${s.id}" style="--s:${s.palette.accent};--b:${s.palette.bg};--i:${s.palette.ink}"><b>${L(s.name)}</b><span>${L(s.tagline)}</span></a>`)}</div>
      </section>`.s;
    return;
  }
  const s = SCHOOL[id];
  setTone(s);
  const [pool, authors] = await Promise.all([loadSchool(id), loadAuthors()]);
  screen.innerHTML = html`
    <section class="page room-flat">
      <h1 class="h1">${L(s.machine.name)}</h1>
      <p>${L(s.machine.motto)}</p>
      <button class="btn btn--accent btn--xl" data-pull>${L(s.machine.action)}</button>
    </section>`.s;
  // as in the 3D room: the pull's level-up waits for the card, and "Pull again" pulls again (it did nothing here)
  const go = () => {
    if (!canPull()) return noFlames();
    document.documentElement.classList.add('is-pulling');
    const r = pull(pool);
    if (r) reveal({ quote: r.quote, author: authors[r.quote.author], finish: r.finish, from: { x: innerWidth / 2, y: innerHeight }, newAuthor: r.newAuthor, onAgain: () => setTimeout(go, 450), onClose: () => {} });
    document.documentElement.classList.remove('is-pulling');
    if (!r) flushCelebrations();
  };
  const click = (e: Event) => { if ((e.target as Element).closest('[data-pull]')) go(); };
  screen.addEventListener('click', click);
  return () => screen.removeEventListener('click', click);
}
