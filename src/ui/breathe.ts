// A minute with the lamp: guided breathing (in 4 s, hold 2 s, out 6 s; the long exhale is the calming
// part), five rounds. The flame grows with each breath in and settles with each breath out, the gold
// line climbs and falls with it, and the minute ends on one checked line. Works without WebGL too.
import { html, raw, el, reducedMotion } from '../core/dom';
import { lampSound, unlock, haptic, sfx } from '../core/audio';
import { getStage } from '../gl/stage';
import type { Lamp } from '../gl/lamp';
import { loadSchool, loadAuthors, type Quote, type Author } from '../core/data';
import { quoteLines, nameHtml } from './card';
import { ICON } from './icons';
import { t, isEn } from '../core/i18n';
import { phrases, fitPhrases } from '../core/thai';

const PHASES = [
  { key: 'in', secs: 4, th: 'หายใจเข้า', en: 'Breathe in' },
  { key: 'hold', secs: 2, th: 'ค้างไว้', en: 'Hold' },
  { key: 'out', secs: 6, th: 'หายใจออกช้าๆ', en: 'Breathe out slowly' },
] as const;
const CYCLE = PHASES.reduce((a, p) => a + p.secs, 0);
const ROUNDS = 5;
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** Where the breath sits: 0 at the bottom of an exhale, 1 at the top of an inhale. */
function breathAt(s: number) {
  const c = s % CYCLE;
  if (c < 4) return { v: ease(c / 4), phase: 0, left: 4 - c };
  if (c < 6) return { v: 1, phase: 1, left: 6 - c };
  return { v: 1 - ease((c - 6) / 6), phase: 2, left: CYCLE - c };
}

export async function openBreathe() {
  unlock();
  const reduce = reducedMotion();
  const root = el(html`
    <div class="ritual breathe" role="dialog" aria-modal="true" aria-label="${t('หายใจกับตะเกียง', 'Breathe with the lamp')}">
      <div class="ritual__curtain" aria-hidden="true"></div>
      <div class="ritual__head breathe__head">
        <p class="ritual__eyebrow">${raw(ICON.flame)}<span data-round>${t(`รอบที่ 1 จาก ${ROUNDS}`, `Round 1 of ${ROUNDS}`)}</span></p>
        <p class="breathe__cue" data-cue aria-live="polite">${t('เตรียมตัว', 'Get ready')}</p>
        <p class="breathe__count num" data-count aria-hidden="true"></p>
      </div>
      <p class="ritual__hint breathe__hint">${t('ทำตามเปลวไฟ ไม่ต้องกดอะไร', 'Follow the flame. Nothing to press.')}</p>
      <button class="icon-btn breathe__close" data-close aria-label="${t('ปิด', 'Close')}">${raw(ICON.close)}</button>
      <div class="ritual__out breathe__out" aria-hidden="true"></div>
    </div>`);
  document.body.append(root);
  document.documentElement.classList.add('has-ritual');
  const cue = root.querySelector<HTMLElement>('[data-cue]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const round = root.querySelector<HTMLElement>('[data-round]')!;
  const out = root.querySelector<HTMLElement>('.breathe__out')!;

  const stage = getStage();
  const prev = stage?.view();
  let lamp: Lamp | null = null;
  let off: (() => void) | null = null;
  let raf = 0, closed = false, finished = false;
  let s = -1.5; // a moment to settle before the first breath
  let lastPhase = -1;

  const step = (dt: number) => {
    if (closed || finished) return;
    s += dt;
    if (s < 0) return;
    const b = breathAt(s);
    const r = Math.min(ROUNDS, Math.floor(s / CYCLE) + 1);
    lamp?.set(0.2 + 0.8 * b.v);
    lampSound.set(b.v, b.phase !== 1);
    if (b.phase !== lastPhase) {
      lastPhase = b.phase;
      const p = PHASES[b.phase];
      cue.textContent = t(p.th, p.en);
      root.dataset.phase = p.key;
      haptic(b.phase === 0 ? 14 : 8);
      round.textContent = t(`รอบที่ ${r} จาก ${ROUNDS}`, `Round ${r} of ${ROUNDS}`);
    }
    count.textContent = String(Math.max(1, Math.ceil(b.left)));
    if (s >= CYCLE * ROUNDS) void finish();
  };

  const start = async () => {
    lampSound.begin(true); // the lamp is lit for the whole minute: its chord and wick breathe with it from the start
    if (stage) {
      try {
        const { Lamp } = await import('../gl/lamp');
        if (closed) return;
        lamp = new Lamp(stage, reduce);
        const head = root.querySelector<HTMLElement>('.breathe__head')!, hint = root.querySelector<HTMLElement>('.breathe__hint')!;
        lamp.layout({ left: 12, right: innerWidth - 12, top: head.offsetTop + head.offsetHeight + 12, bottom: hint.offsetTop - 12 });
        await stage.renderer.compileAsync(lamp.scene, lamp.camera).catch(() => {});
        if (closed) { lamp.dispose(); lamp = null; return; }
        lamp.ignite();
        stage.setView(lamp.scene, lamp.camera);
        off = stage.onTick((dt) => step(dt));
      } catch (e) { console.error(e); lamp = null; }
    }
    if (!lamp) {
      root.classList.add('ritual--flat');
      let last = performance.now();
      const loop = (now: number) => { step(Math.min(0.1, (now - last) / 1000)); last = now; if (!closed && !finished) raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    requestAnimationFrame(() => root.classList.add('is-text', 'is-ready'));
  };

  // the minute ends on one line, from the school that answers an overwhelmed mind
  const finish = async () => {
    finished = true;
    lampSound.release();
    window.setTimeout(() => sfx.levelup(), 1200); // the phew is heard first, then the plucks
    const [pool, authors] = await Promise.all([loadSchool('eastern'), loadAuthors()]).catch(() => [[] as Quote[], {} as Record<string, Author>] as const);
    const calm = pool.filter((q) => q.verify === 'primary' && (q.mood.includes('overwhelmed') || q.mood.includes('anxious')) && q.th.length < 110);
    const q = calm[(Math.random() * calm.length) | 0];
    const lines = q ? quoteLines(q) : null;
    out.innerHTML = html`
      <figure class="today">
        <p class="today__eyebrow"><span>${t(`หายใจครบ ${ROUNDS} รอบแล้ว ฟิ้ว`, `${ROUNDS} breaths. Phew.`)}</span></p>
        ${q && lines ? html`<blockquote class="today__line" lang="${lines.mainLang}">${phrases(lines.main, { words: true })}</blockquote>
        <figcaption class="today__by"><span>${nameHtml(authors[q.author], q.author)}</span></figcaption>` : ''}
        <div class="today__acts"><button class="btn today__go" data-close>${t('กลับไปต่อ', 'Back to it')}${raw(ICON.arrow)}</button></div>
      </figure>`.s;
    out.style.background = getComputedStyle(document.documentElement).getPropertyValue('--s-bg').trim() || '#F3EDE2';
    out.removeAttribute('aria-hidden');
    fitPhrases(out);
    out.getBoundingClientRect(); // starting style first, so the entrance plays
    root.classList.add('is-out', 'is-lit');
    stopScene();
  };

  const stopScene = () => {
    off?.();
    off = null;
    cancelAnimationFrame(raf);
    if (lamp) {
      lamp.dispose();
      lamp = null;
      if (stage) stage.setView(prev?.scene ?? null, prev?.camera ?? null);
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (!finished) lampSound.cancel();
    stopScene();
    root.classList.add('is-gone');
    document.documentElement.classList.remove('has-ritual');
    setTimeout(() => void import('./shell').then((m) => m.flushCelebrations()), 900);
    removeEventListener('keydown', key);
    setTimeout(() => root.remove(), 800);
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', key);
  root.addEventListener('click', (e) => { if ((e.target as Element).closest('[data-close]')) close(); }); // the global button tap is the click
  void start();
  if (isEn()) root.lang = 'en';
}
