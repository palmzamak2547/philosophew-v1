// The daily breath. A clay lamp in a stone niche: press and hold to breathe in (the wick catches, the
// flame grows, a gold line climbs the arch), let go to breathe out (the light floods into the page).
// It lights today's lamp. First visitors then meet the name; returning ones get today's line.
import { html, raw, el, reducedMotion, sleep, nextFrame } from '../core/dom';
import { checkIn, saveNote, markRead, type CheckIn } from '../core/game';
import { store, beforeLamp } from '../core/store';
import { lampSound, unlock, haptic, sfx } from '../core/audio';
import { mark, ICON } from './icons';
import { lampMilestone, flushCelebrations, announce } from './shell';
import { t, isEn } from '../core/i18n';
import { getStage } from '../gl/stage';
import type { Lamp } from '../gl/lamp';
import { todaysLine, type Daily } from '../core/daily';
import { dayKey, daysBetween } from '../core/time';
import { portrait, quoteLines, nameHtml } from './card';
import { phrases, fitPhrases, setThai } from '../core/thai';
import { dawn } from './dawn';

const HOLD = 3.2; // seconds of breathing in

// Thai colours of the day, Sunday first
const DAY_COLOUR = ['#E3363F', '#F2C230', '#E86AA6', '#3E9A5B', '#F08A2C', '#3D8FD9', '#8A55C9'];

/** `settled`: the words after the breath have slid in (or the reader has moved on). The hall builds behind them only
 *  then: built while they slid, its reflections and first frames stalled the slide (tasks of 125 to 300 ms).
 *  `quiet`: true once every row has landed and the page stands still with the reader on it; false after a Skip, or
 *  when the reader moves on first (the page is about to lift). */
export interface Ritual { res: CheckIn | null; reveal: () => void; settled: Promise<void>; quiet: Promise<boolean> }


export function ritual(): Promise<Ritual> {
  return new Promise((resolveRitual) => {
    const first = !store.s.day;
    // the run continues tomorrow-after-today, or when spare oil covers the missed days
    const missed = store.s.day ? daysBetween(store.s.day, dayKey()) - 1 : -1;
    const nextStreak = missed === 0 || (missed > 0 && missed <= 2 && store.s.oil >= missed) ? store.s.streak + 1 : 0;
    const reduce = reducedMotion();
    // A finger may only start sound once it lifts. On a touch screen not yet touched, the lamp asks for a tap first:
    // the tap lights the wick, heard, and the hold after it breathes with sound. A mouse or a key needs no tap.
    let tapFirst = store.s.settings.sound && matchMedia('(pointer: coarse)').matches && navigator.userActivation?.hasBeenActive === false;
    const intro = first ? t('ก่อนเริ่ม มาหายใจลึกๆ ด้วยกันสักครั้ง', 'Before we begin, take one deep breath with us') : t('หายใจลึกๆ สักครั้ง แล้วค่อยเข้าไป', 'One deep breath, then in you go');
    const root = el(html`
      <div class="ritual" role="dialog" aria-modal="true" aria-label="${t('หายใจก่อนเข้า', 'Breathe in to enter')}">
        <div class="ritual__curtain" aria-hidden="true"></div>
        <div class="ritual__top" aria-hidden="true">${raw(mark({ size: 34, bottom: '#F2ECE0' }))}</div>
        <div class="ritual__head">
          ${nextStreak >= 2 ? html`<p class="ritual__eyebrow">${raw(ICON.flame)}<span>${t(`วันที่ ${nextStreak} ติดต่อกัน`, `Day ${nextStreak} in a row`)}</span></p>` : ''}
          <p class="ritual__intro">${phrases(intro, { words: true })}</p>
        </div>
        <button class="ritual__hold" data-silent aria-describedby="ritual-hint" aria-label="${t('กดค้างไว้เพื่อหายใจเข้า', 'Press and hold to breathe in')}"></button>
        <p class="ritual__hint" id="ritual-hint" aria-live="polite">${tapFirst ? t('แตะที่ตะเกียงเพื่อจุดไฟ', 'Tap the lamp to light it') : t('กดค้างไว้ พร้อมหายใจเข้าช้าๆ', 'Press and hold as you breathe in slowly')}</p>
        <button class="ritual__skip" data-skip>${t('ข้าม', 'Skip')}</button>
        <div class="ritual__out" aria-hidden="true"></div>
      </div>`);
    document.body.append(root);
    document.documentElement.classList.add('has-ritual');
    const hint = root.querySelector<HTMLElement>('.ritual__hint')!;
    const outEl = root.querySelector<HTMLElement>('.ritual__out')!;
    const holdBtn = root.querySelector<HTMLButtonElement>('.ritual__hold')!;
    const daily: Promise<Daily | null> = first ? Promise.resolve(null) : todaysLine().catch(() => null);

    let lamp: Lamp | null = null;
    let flat: { bar: SVGCircleElement; orb: HTMLElement; C: number } | null = null;
    let hold = 0, holding = false, lit = false, full = false, phase: 'in' | 'out' | 'done' = 'in';
    let offTick: (() => void) | null = null, raf = 0;
    let lastX = 0, lastT = 0;

    const setHint = (s: string) => { if (hint.textContent !== setThai(s)) hint.textContent = s; }; // the page shows it typeset
    // layout boxes, not painted ones: the words are still sliding in when we measure
    const free = () => {
      const W = innerWidth, H = innerHeight;
      const head = root.querySelector<HTMLElement>('.ritual__head')!;
      return { left: 12, right: W - 12, top: Math.max(head.offsetTop + head.offsetHeight + 12, 90), bottom: Math.min(hint.offsetTop - 12, H - 120) };
    };

    // ---------- the loop: breath in, lamp, sound ----------
    // A breath is wall-clock time: slow frames must not make it longer, so read the clock, not the frame.
    let clock = performance.now();
    const step = () => {
      const now = performance.now(), dt = Math.min(0.5, (now - clock) / 1000);
      clock = now;
      if (phase !== 'in') return;
      // A stalled frame must not turn the first tap into a hold (it once did, and the wick caught before the finger
      // lifted): until a tap-first press has lit the wick, one frame counts at most a thirtieth of a second of breath,
      // so a hold is about ten frames of holding, never one long frame.
      const breath = holding && tapFirst && !lit ? Math.min(dt, 1 / 30) : dt;
      hold = holding ? Math.min(1, hold + breath / HOLD) : Math.max(0, hold - dt * 0.8);
      if (holding && !lit && hold > (tapFirst ? 0.1 : 0.015)) { // a tap-first press lights on release, unless it is held
        lit = true;
        lamp?.ignite();
        lampSound.ignite();
        haptic(10);
        // held rather than tapped: carry on (silent until the finger lifts; the breath out is heard in full)
        if (tapFirst) { tapFirst = false; setHint(t('หายใจเข้า…', 'Breathe in…')); }
      }
      lamp?.set(hold);
      lampSound.set(hold, holding);
      if (flat) {
        flat.bar.style.strokeDashoffset = `${flat.C * (1 - hold)}`;
        flat.orb.style.setProperty('--b', hold.toFixed(3));
      }
      if (hold >= 1 && holding && !full) {
        full = true;
        root.classList.add('is-full');
        lamp?.full(true);
        lampSound.full();
        setHint(t('ปล่อยได้เลย แล้วหายใจออก', 'Now let go and breathe out'));
        haptic(20);
      } else if (full && hold < 1) {
        full = false;
        root.classList.remove('is-full');
        lamp?.full(false);
      }
    };

    const start = async () => {
      const stage = getStage();
      const mod = stage ? import('../gl/lamp') : null; // fetch the scene while the words settle
      // the words wait for their face, so they never swap font mid-fade
      const fonts = document.fonts;
      await Promise.race([
        Promise.all([fonts?.load('italic 400 24px Fraunces'), fonts?.load('italic 400 24px Trirong', 'ก')]).catch(() => {}),
        sleep(900),
      ]);
      fitPhrases(root);
      root.classList.add('is-text');
      if (stage && mod) {
        try {
          const { Lamp } = await mod;
          if (phase !== 'in') return;
          lamp = new Lamp(stage, reduce);
          if (import.meta.env.DEV) (window as unknown as { __lamp: Lamp }).__lamp = lamp;
          lamp.layout(free());
          // compile shaders off the main thread where the browser can, so nothing stutters later
          await stage.renderer.compileAsync(lamp.scene, lamp.camera).catch(() => {});
          if (phase !== 'in') { lamp?.dispose(); lamp = null; return; } // skipped while compiling (stopScene may have disposed it already)
          stage.setView(lamp.scene, lamp.camera);
          offTick = stage.onTick(step);
          await nextFrame();
          await nextFrame();
        } catch (e) {
          console.error(e);
          lamp?.dispose();
          lamp = null;
        }
      }
      if (phase !== 'in') return;
      if (!lamp) {
        // no WebGL: a drawn flame and a ring still carry the breath
        root.classList.add('ritual--flat');
        const orb = el(html`<div class="ritual__orb" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" class="ritual__track"/><circle cx="60" cy="60" r="56" class="ritual__bar"/></svg><span class="ritual__core"></span></div>`);
        holdBtn.append(orb);
        const bar = orb.querySelector<SVGCircleElement>('.ritual__bar')!;
        const C = 2 * Math.PI * 56;
        bar.style.strokeDasharray = `${C}`;
        bar.style.strokeDashoffset = `${C}`;
        flat = { bar, orb, C };
        const loop = () => {
          step();
          if (phase !== 'done') raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }
      root.classList.add('is-ready');
    };
    void start();

    let relayout = 0;
    const onResize = () => {
      cancelAnimationFrame(relayout);
      relayout = requestAnimationFrame(() => { fitPhrases(root); if (lamp && phase === 'in') lamp.layout(free()); });
    };
    addEventListener('resize', onResize);

    // ---------- input ----------
    const down = (e?: Event) => {
      if (phase !== 'in') return;
      e?.preventDefault();
      unlock();
      lampSound.begin(lit);
      holding = true;
      root.classList.add('is-holding');
      if (!tapFirst) setHint(t('หายใจเข้า…', 'Breathe in…')); // a tap-first touch keeps its own words until it lifts
    };
    const up = () => {
      if (phase !== 'in' || !holding) return;
      holding = false;
      root.classList.remove('is-holding');
      if (hold >= 1) return void exhale();
      if (tapFirst) {
        // the tap that lets sound start: the wick catches now, heard, and the breath can begin
        tapFirst = false;
        if (!lit) { lit = true; lamp?.ignite(); haptic(10); }
        lampSound.ignite();
        setHint(t('กดค้างไว้ พร้อมหายใจเข้าช้าๆ', 'Press and hold as you breathe in slowly'));
        return;
      }
      setHint(flat ? t('อีกนิด กดค้างไว้จนวงเต็ม', 'Hold a little longer, until the circle fills') : t('อีกนิดเดียว ค้างไว้จนเส้นทองมาบรรจบกัน', 'Almost. Keep holding until the gold lines meet'));
    };
    const move = (e: PointerEvent) => {
      if (!lamp) return;
      const now = performance.now(), dtm = Math.max(8, now - lastT);
      lamp.pointer(e.clientX, e.clientY, lastT ? ((e.clientX - lastX) / dtm) * 1000 : 0);
      lastX = e.clientX; lastT = now;
    };
    // Enter and Space on a control (Skip, the buttons after the breath) are that control's click, never a breath
    const onControl = (e: KeyboardEvent) => !!(e.target as Element | null)?.closest?.('button, a, input, textarea');
    const kd = (e: KeyboardEvent) => {
      if (onControl(e)) return;
      if (phase === 'in' && (e.key === ' ' || e.key === 'Enter') && !e.repeat) down(e);
      else if (e.key === 'Escape' && root.classList.contains('is-lit')) userDone(true);
    };
    const ku = (e: KeyboardEvent) => { if (!onControl(e) && (e.key === ' ' || e.key === 'Enter')) up(); };
    // the page's header and dock sit behind the lamp: out of the tab order until it steps aside
    const chromeInert = (off: boolean) => document.querySelectorAll('header.top, nav.nav').forEach((el) => el.toggleAttribute('inert', off));
    chromeInert(true);
    const hidden = () => { if (document.hidden) up(); };
    root.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('[data-skip], .ritual__out')) return;
      down(e);
    });
    root.addEventListener('pointermove', move);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    document.addEventListener('visibilitychange', hidden);
    root.querySelector('[data-skip]')!.addEventListener('click', () => {
      if (phase !== 'in') return;
      lampSound.cancel(); // the global button tap is the click
      phase = 'out';
      stopScene();
      root.classList.add('is-skipped');
      dawn();
      void beforeLamp.wait().then(() => finish(checkIn(), 0));
    });

    // ---------- breathe out ----------
    // the page colour from the token, not from the body: on a lamp day the body is painted dark until dawn()
    const paper = () => getComputedStyle(document.documentElement).getPropertyValue('--s-bg').trim() || '#F3EDE2';
    const exhale = async () => {
      phase = 'out';
      lampSound.release();
      haptic([12, 30, 12]);
      root.classList.add('is-out');
      // signed in, the account's copy lands first (src/core/account.ts): the lamp counts every device's days
      const lighting = beforeLamp.wait().then(() => checkIn());
      outEl.style.background = paper();
      if (lamp) await lamp.exhale(paper());
      else await sleep(reduce ? 350 : 1100);
      const res = await lighting;
      await showOut(res);
      stopScene();
      finish(res, first ? (reduce ? 2200 : 3600) : -1); // long enough to read the lamp line under the name
    };

    const stopScene = () => {
      offTick?.();
      offTick = null;
      cancelAnimationFrame(raf);
      if (lamp) {
        getStage()?.setView(null, null);
        lamp.dispose();
        lamp = null;
      }
    };

    // first visit: the name. Every day after: today's line, the same for everyone.
    const showOut = async (res: CheckIn | null) => {
      const [d] = await Promise.all([
        Promise.race([daily, sleep(1200).then(() => null)]),
        Promise.race([document.fonts?.load('500 32px Trirong', 'ก'), sleep(600)]).catch(() => {}),
      ]);
      if (d) {
        const q = d.quote, a = d.author ?? undefined, lines = quoteLines(q);
        const colour = DAY_COLOUR[new Date(`${d.key}T12:00:00`).getDay()];
        const date = new Date(`${d.key}T12:00:00`).toLocaleDateString(isEn() ? 'en-GB' : 'th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
        const saved = !!store.s.notes[q.id];
        outEl.innerHTML = String(html`
          <figure class="today" style="--day:${colour}">
            ${res ? html`<p class="today__lamp">${raw(ICON.flame)}<span>${lampText(res)}</span></p>` : ''}
            <p class="today__eyebrow"><i aria-hidden="true"></i><span>${t('ประโยคของวันนี้', "Today's line")}</span><span class="today__date">${date}</span></p>
            <blockquote class="today__line" lang="${lines.mainLang}">${phrases(lines.main, { words: true })}</blockquote>
            ${lines.sub ? html`<p class="today__sub" lang="${lines.subLang}">${lines.sub}</p>` : ''}
            <figcaption class="today__by">${portrait(a, 'today__face')}<span>${nameHtml(a, q.author)}</span></figcaption>
            <div class="today__acts">
              <button class="btn btn--ghost today__keep" data-keep data-silent ${saved ? 'disabled' : ''}>${raw(saved ? ICON.saved : ICON.save)}<span>${saved ? t('อยู่ในสมุดแล้ว', 'In your notebook') : t('เก็บลงสมุด', 'Keep it')}</span></button>
              <button class="btn today__go" data-go>${t('เข้าไปหมุนตู้', 'Into the hall')}${raw(ICON.arrow)}</button>
            </div>
            ${res?.rekindleFrom ? html`<p class="today__rekindle">${raw(ICON.flame)}<span>${t(`เขียนความคิดสั้นๆ สักบรรทัดเกี่ยวกับประโยคนี้ แล้วตะเกียงที่จุดติดกัน ${res.rekindleFrom} วันจะกลับมานับต่อ`, `Write one short line about it and your ${dayRun(res.rekindleFrom)} run comes back.`)}</span><button class="btn btn--ember btn--sm" data-write>${raw(ICON.pen)}${t('เขียนหนึ่งบรรทัด', 'Write a line')}</button></p>` : ''}
            <p class="today__same">${t('วันนี้ทุกคนได้ประโยคเดียวกัน', 'Everyone gets this same line today')}</p>
          </figure>`);
        markRead(); // reading today's line is the day's reading beat
        outEl.querySelector('[data-keep]')!.addEventListener('click', (e) => {
          const b = e.currentTarget as HTMLButtonElement;
          saveNote(q, store.s.notes[q.id]?.text || '', store.s.notes[q.id]?.finish || 'paper');
          sfx.stamp();
          haptic(12);
          b.disabled = true;
          b.innerHTML = String(html`${raw(ICON.saved)}<span>${t('อยู่ในสมุดแล้ว', 'In your notebook')}</span>`);
        });
        // the global button tap is their click (a second one here played two at once)
        outEl.querySelector('[data-go]')!.addEventListener('click', () => userDone(true));
        outEl.querySelector('[data-write]')?.addEventListener('click', () => {
          userDone(true);
          // the editor opens over the hall once the light has cleared (a sheet opened sooner sat under the paper)
          void gone.then(() => setTimeout(() => void import('./note-editor').then((m) => m.openNoteEditor(q, a, store.s.notes[q.id]?.finish || 'paper')), 600));
        });
      } else {
        outEl.innerHTML = String(html`
          <div class="ritual__brand">
            <p class="ritual__word">philoso<em>phew</em></p>
            <p class="ritual__tag">${t('สุ่มคำคมปรัชญา แล้วหายใจออก', 'Pull a quote. Breathe out.')}</p>
            ${res ? html`<p class="ritual__lampline">${raw(ICON.flame)}<span>${lampText(res)}</span></p>` : ''}
          </div>`);
      }
      outEl.removeAttribute('aria-hidden');
      fitPhrases(outEl);
      // let the new words take their starting style first, or their entrance never plays
      outEl.getBoundingClientRect();
      root.classList.add('is-lit');
      dawn();
      root.setAttribute('aria-label', d ? t('ประโยคของวันนี้', "Today's line") : 'Philosophew');
      outEl.querySelector<HTMLElement>('[data-go]')?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      // a returning visitor reads, then walks in; with no line to read, the name holds for a moment
      if (!d && !first) setTimeout(userDone, reduce ? 700 : 1500);
    };

    // ---------- leave: when the hall is built behind us and the reader is done ----------
    let hallReady = false, readerDone = false, closed = false, result: CheckIn | null = null, leavingAt = 0;
    let isGone = () => {};
    const gone = new Promise<void>((r) => { isGone = r; });
    // the words leave first, then the paper lifts onto the hall: never two pages of text at once
    const wordsLeave = () => { if (!leavingAt) { leavingAt = performance.now(); root.classList.add('is-leaving'); } };
    const tryClose = () => {
      if (closed || !hallReady || !readerDone) return;
      closed = true;
      removeEventListener('keydown', kd);
      chromeInert(false);
      if (result?.milestone) lampMilestone(result.milestone); // queued first, while the lamp still covers the page
      wordsLeave();
      const words = reduce || !root.classList.contains('is-lit') ? 0 : Math.max(0, 300 - (performance.now() - leavingAt));
      setTimeout(() => {
        root.classList.add('is-gone');
        document.documentElement.classList.remove('has-ritual');
        isGone();
      }, words);
      setTimeout(flushCelebrations, 1200 + words); // the milestone, then anything that happened on the page after the breath
      setTimeout(() => root.remove(), 800 + words);
      if (result) {
        const r = result;
        // skipped: the page after the breath never said what the lamp did. It says it once the paper has lifted, in its
        // own turn (after a milestone, never with it), and where the hall keeps its machine, not over its question
        if (!root.classList.contains('is-lit')) setTimeout(() => { const text = lampText(r); announce(text, ICON.flame, text.length > 90 ? 6500 : 4600, 'toast--lamp'); }, 600);
      }
    };
    let settle = () => {};
    const settled = new Promise<void>((r) => { settle = r; });
    let hush = (_still: boolean) => {};
    const quiet = new Promise<boolean>((r) => { hush = r; });
    function userDone(byReader = false) {
      readerDone = true;
      settle();
      hush(false); // the page ends before it stood still (once it has, this changes nothing)
      tryClose();
      // the reader moved on while the hall still builds behind the page: the words leave now, so the tap is answered,
      // and the paper lifts when it is ready (a timer that ends the page leaves the words up meanwhile)
      if (byReader && !closed && root.classList.contains('is-lit')) wordsLeave();
    }
    const finish = (res: CheckIn | null, holdMs: number) => {
      phase = 'done';
      result = res;
      removeEventListener('resize', onResize);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('keyup', ku);
      document.removeEventListener('visibilitychange', hidden);
      if (holdMs >= 0) setTimeout(userDone, holdMs);
      // the words' entrance (pages.css): the name's italic lands at 1.95 s; today's line word by word (180 ms, then 38 ms
      // a word, each moving for 1.1 s), the rows under it fading in until 2.5 s
      const lineWords = outEl.querySelectorAll('.today__line .w').length;
      if (!root.classList.contains('is-lit')) { settle(); hush(false); } // skipped: nothing slides in, nothing stands still
      else {
        setTimeout(settle, reduce ? 400 : lineWords ? Math.min(2400, Math.max(1300, 180 + (lineWords - 1) * 38 + 1100)) : 2000);
        setTimeout(() => hush(true), reduce ? 400 : lineWords ? 2500 : 2000);
      }
      resolveRitual({ res, reveal: () => { hallReady = true; tryClose(); }, settled, quiet });
    };
  });
}

// "5-day" reads as one word: word joiners hold the hyphen to both sides (it broke as "your 5-" / "day run"). Not U+2011:
// the interface faces have no non-breaking hyphen, so it would come from a system font mid-word.
const dayRun = (n: number) => `${n}\u2060-\u2060day`;

/** What the lamp did today, in one or two sentences (shown on the page after the breath, or as a toast when skipped). */
function lampText(r: CheckIn) {
  const two = (n: number, one: string, pair: string) => (n > 1 ? pair : one);
  let text: string;
  if (r.first) text = t(`จุดตะเกียงวันแรกแล้ว มีไฟ ${r.refilledTo} ดวงไว้หมุนตู้`, `Day one: your lamp is lit. ${r.refilledTo} flames to spend.`);
  else if (r.rekindleFrom) text = t(
    `ตะเกียงดับไป${two(r.away, 'วันเดียว', 'สองวัน')} ไม่เป็นไร เขียนความคิดสั้นๆ สักบรรทัดวันนี้ แล้วตะเกียงที่จุดติดกัน ${r.rekindleFrom} วันจะกลับมานับต่อ`,
    `Your lamp was out for ${two(r.away, 'one day', 'two days')}. That's all right. Write one short line today and your ${dayRun(r.rekindleFrom)} run comes back.`);
  else if (r.away) text = t(`กลับมาแล้ว ดีใจที่ได้เจอกันอีก ตะเกียงจุดใหม่ได้เสมอ ที่ผ่านมาคุณจุดไปแล้ว ${r.lit} ดวง`, `Welcome back. A lamp can always be lit again. You've lit ${r.lit} ${r.lit === 1 ? 'lamp' : 'lamps'} so far.`);
  else if (r.oilUsed) text = t(
    `${two(r.oilUsed, 'เมื่อวาน', 'สองวันที่ผ่านมา')}ไม่ได้แวะมา ตะเกียงเลยใช้น้ำมันสำรองไป ${r.oilUsed} หยด ไฟยังไม่ดับ`,
    `You missed ${two(r.oilUsed, 'yesterday', 'two days')}, so the lamp used ${two(r.oilUsed, 'a drop', 'two drops')} of spare oil. Still burning.`);
  else text = t(`จุดตะเกียงติดกันเป็นวันที่ ${r.streak} แล้ว มีไฟพร้อมใช้ ${r.refilledTo} ดวง`, `Day ${r.streak} in a row. ${r.refilledTo} flames ready.`);
  if (r.oilEarned) text += t(' ตะเกียงเก็บน้ำมันสำรองได้ 1 หยด วันไหนลืมแวะมา มันจะประคองไฟไว้ให้', ' Your lamp saved a drop of spare oil for a day you miss.');
  return text;
}
