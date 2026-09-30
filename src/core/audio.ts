// Every sound in Philosophew is synthesised here with Web Audio: no files, instant, ours.
// ponytail: one shared context and reverb; voices are fire-and-forget nodes the GC collects.
import { store } from './store';
import type { SchoolId } from '../content/schools';

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode, dry: GainNode, wet: GainNode, verb: ConvolverNode;
let noiseBuf: AudioBuffer;
const GAIN = 1.8; // master gain per unit of the volume setting: the payoffs sit near other phone media, the limiter keeps it clean

const enabled = () => store.s.settings.sound;
const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 60));

// Browsers keep audio locked until the reader touches, clicks or types, and a context made earlier only costs a
// cold page time (and logs "AudioContext was not allowed to start"). So nothing is built before a real gesture:
// navigator.userActivation says so where the browser has it, else the first pointerdown or keydown.
let gestured = false;
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { gestured = true; }, { capture: true, once: true, passive: true });
const activated = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? gestured;

function build() {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const c = new AC({ latencyHint: 'interactive' });
  master = c.createGain();
  master.gain.value = GAIN * (store.s.settings.volume ?? 0.8);
  // a limiter, not a compressor: the mix peaks around -10 dBFS, so it only ever catches a pile-up of voices
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 0;
  comp.ratio.value = 20;
  comp.attack.value = 0.002;
  comp.release.value = 0.15;
  master.connect(comp).connect(c.destination);
  // a tab in the background goes quiet (room beds and chimes would keep playing) and wakes where it was
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (document.hidden) { master.gain.setTargetAtTime(0, t, 0.05); window.setTimeout(() => { if (document.hidden) void ctx?.suspend(); }, 300); }
    else { void ctx.resume().catch(() => {}); master.gain.setTargetAtTime(GAIN * (store.s.settings.volume ?? 0.8), ctx.currentTime, 0.08); }
  });
  dry = c.createGain();
  dry.connect(master);
  wet = c.createGain();
  verb = c.createConvolver();
  // The tail is set in the task after the gesture's first frame: the convolver prepares all of it at once (20 to 35 ms
  // on a desktop, about 100 ms at 4x CPU) and, made inside the gesture, it held back the gesture's own answer on screen
  // (the lamp's wick, QA m3). Right after that frame is a fixed moment, never the middle of the breath or of a camera
  // move (where an idle callback once put it). The reverb fades in as it arrives, so the first sound's tail never jumps
  // in. An offline render (the film's product stem, which stubs out timers) gets it at once.
  if (typeof (c as BaseAudioContext as OfflineAudioContext).startRendering === 'function') {
    verb.buffer = impulse(c, 2.6, 2.2);
    wet.gain.value = 0.28;
  } else {
    wet.gain.value = 0;
    requestAnimationFrame(() => setTimeout(() => { verb.buffer = impulse(c, 2.6, 2.2); wet.gain.setTargetAtTime(0.28, c.currentTime, 0.05); }, 0));
  }
  wet.connect(verb).connect(master);
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  noiseInto(noiseBuf.getChannelData(0), 0x9e3779b9);
  return c;
}

/** White noise from a xorshift generator: the same flat noise as Math.random per sample, several times cheaper. */
function noiseInto(d: Float32Array, seed: number, fade = 1, r = 1) {
  let s = seed | 0 || 1, e = fade;
  for (let i = 0; i < d.length; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    d[i] = (s / 2147483648) * e;
    e *= r;
  }
}

/** A reverb tail: noise under an exponential decay (-60 dB at the end) that darkens as it dies, like a real room. */
function impulse(c: Ctx, seconds: number, decay: number) {
  const len = Math.floor(c.sampleRate * seconds), sr = c.sampleRate;
  const b = c.createBuffer(2, len, sr);
  const r = Math.pow(0.001, decay / 2 / len); // decay 2 = -60 dB over the whole length
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    noiseInto(d, 0x2545f491 + ch * 0x68e31da4, 1, r); // two different tails: a wide stereo room
    // a one-pole lowpass sliding from 7 kHz to 1.2 kHz (the coefficient updated every 64 samples: cheap in the gesture)
    let lp = 0, a = 0;
    for (let i = 0; i < len; i++) {
      if ((i & 63) === 0) a = Math.exp((-2 * Math.PI * 7000 * Math.pow(1200 / 7000, i / len)) / sr);
      lp = (1 - a) * d[i] + a * lp;
      d[i] = lp * 1.6; // the level the unfiltered tail had
    }
  }
  return b;
}

/** Call from any user gesture; browsers keep audio locked until then. */
export function unlock() {
  if (!activated()) return;
  if (!ctx && (ctx = build())) warmStrings(ctx);
  if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
}

function out(sendWet = 0.3) {
  const g = ctx!.createGain();
  g.connect(dry);
  if (sendWet > 0) {
    const s = ctx!.createGain();
    s.gain.value = sendWet;
    g.connect(s).connect(wet);
  }
  return g;
}

function ready() {
  if (!enabled()) return false;
  if (!ctx) unlock();
  // a context made or resumed in this very gesture is still "suspended" for a few milliseconds: once the page has
  // been touched it is on its way to running, so schedule now and it plays the moment it starts (the tap that
  // lights the lamp on a phone would otherwise be silent)
  return !!ctx && (ctx.state === 'running' || (ctx.state === 'suspended' && activated()));
}

interface ToneOpts { type?: OscillatorType; gain?: number; attack?: number; decay?: number; at?: number; to?: number; wet?: number; detune?: number }
function tone(freq: number, o: ToneOpts = {}) {
  const c = ctx!;
  const t = c.currentTime + (o.at || 0);
  const osc = c.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.decay || 0.3));
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  const peak = o.gain ?? 0.2, a = o.attack ?? 0.005, d = o.decay ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  osc.connect(g).connect(out(o.wet ?? 0.25));
  osc.start(t);
  osc.stop(t + a + d + 0.05);
}

interface NoiseOpts { dur?: number; type?: BiquadFilterType; freq?: number; q?: number; gain?: number; attack?: number; at?: number; to?: number; wet?: number }
function noise(o: NoiseOpts = {}) {
  const c = ctx!;
  const t = c.currentTime + (o.at || 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type || 'bandpass';
  f.frequency.setValueAtTime(o.freq || 1200, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + (o.dur || 0.2));
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  const dur = o.dur ?? 0.2, a = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out(o.wet ?? 0.15));
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

/**
 * A Karplus-Strong string computed once per note: a noise burst ringing in a tuned delay line, damped by a
 * one-pole lowpass. Computed here rather than as a DelayNode feedback loop, because Web Audio adds one render
 * quantum (128 frames) to any delay inside a cycle: every string came out flat, D5 sounding at 225 Hz.
 */
const strings = new Map<string, AudioBuffer>();
export function stringWave(sr: number, freq: number, decay = 0.985, bright = 3200) {
  const a = Math.exp(-2 * Math.PI * bright / sr), w = 2 * Math.PI * freq / sr;
  const lag = Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w; // the lowpass delays the loop this much
  const loss = decay * (1 - a) / Math.sqrt(1 - 2 * a * Math.cos(w) + a * a); // per pass, at the fundamental
  const len = Math.floor(sr * Math.min(2.4, Math.log(1e-4) / (freq * Math.log(loss)) + 0.05)); // until -80 dB
  const y = new Float32Array(len);
  const D = Math.max(2, sr / freq - lag), N = Math.floor(D), f = D - N;
  const burst = Math.floor(sr * 0.02), fall = Math.pow(0.0001 / 0.35, 1 / burst), end = Math.pow(0.0001, 1 / (sr * 2.4));
  let lp = 0, ex = 1, env = 1, bl = 0;
  for (let n = 0; n < len; n++) {
    const d1 = n - N >= 0 ? y[n - N] : 0, d2 = n - N - 1 >= 0 ? y[n - N - 1] : 0;
    lp = (1 - a) * (d1 + f * (d2 - d1)) + a * lp;
    // the pluck's burst through the string's own lowpass: a finger on gut, not a hiss (white noise peaked 17-26 dB
    // over the ringing string and carried half its energy above 5 kHz)
    bl = (1 - a) * (n < burst ? (Math.random() * 2 - 1) * ex : 0) + a * bl;
    y[n] = bl + decay * lp;
    ex *= fall;
  }
  for (let n = 0; n < len; n++) { y[n] *= env; env *= end; } // the old -80 dB fade over 2.4 s
  return y;
}
function stringBuf(c: BaseAudioContext, freq: number, decay = 0.985, bright = 3200) {
  const key = `${freq.toFixed(2)} ${decay} ${bright}`;
  let b = strings.get(key);
  if (!b) {
    const y = stringWave(c.sampleRate, freq, decay, bright);
    b = c.createBuffer(1, y.length, c.sampleRate);
    b.getChannelData(0).set(y);
    strings.set(key, b);
  }
  return b;
}
// the strings the app plays, computed one per idle moment after the first gesture: a reveal never waits for one
const STOIC = [62, 65, 69, 74], SOCRATIC = [64, 67, 71, 76, 79], LEVEL = [60, 64, 67, 72, 76], HALL = [50, 57, 62];
function warmStrings(c: BaseAudioContext) {
  const todo: [number, number?, number?][] = [...STOIC.map((m) => [m] as [number]), ...LEVEL.map((m) => [m] as [number]),
    ...SOCRATIC.map((m) => [m, 0.985, 4200] as [number, number, number]), ...HALL.map((m) => [m, 0.99, 1400] as [number, number, number])];
  const next = () => { const n = todo.shift(); if (!n) return; stringBuf(c, hz(n[0]), n[1], n[2]); idle(next); };
  idle(next);
}
function pluck(freq: number, o: { at?: number; gain?: number; decay?: number; bright?: number } = {}) {
  const c = ctx!;
  const t = c.currentTime + (o.at || 0);
  const src = c.createBufferSource();
  src.buffer = stringBuf(c, freq, o.decay, o.bright);
  const g = c.createGain();
  g.gain.value = o.gain ?? 0.35;
  src.connect(g).connect(out(0.35));
  src.start(t);
}

/** Inharmonic partials = struck metal: bells, singing bowls, coins. */
function bell(freq: number, o: { at?: number; gain?: number; decay?: number; ratios?: number[] } = {}) {
  const ratios = o.ratios || [1, 2.76, 5.4, 8.93];
  ratios.forEach((r, i) => tone(freq * r, { at: o.at, gain: (o.gain ?? 0.12) / (i + 1), attack: 0.002, decay: (o.decay ?? 2.2) / (1 + i * 0.6), wet: 0.45 }));
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// One action, one voice. The interface's own sounds used to pile up on a single action: a Save that earned a flame,
// brought a run back and finished the day's rite played tap, flame, flame, stamp and flame within 30 ms (a Keep: tap
// and stamp; an arrow: tap and whoosh; a tab: tap and page). Now the first of them takes the moment and the others
// asked for within it stay quiet. The global tap (src/ui/shell.ts) is asked for after a control's own click handlers,
// so a control with a voice of its own is heard as itself; a control whose voice comes later than its click (a form
// that saves) carries data-silent. A machine's gesture, the lamp and the card's motif are not part of this.
const MOMENT = 300;
let voicedAt = -Infinity;
const voice = () => {
  const now = performance.now();
  if (now - voicedAt < MOMENT) return false;
  voicedAt = now;
  return true;
};

export const sfx = {
  tap() { if (!ready() || !voice()) return; tone(880, { type: 'triangle', gain: 0.05, decay: 0.06, wet: 0 }); },
  tick() { if (!ready()) return; noise({ type: 'highpass', freq: 5200, gain: 0.08, dur: 0.025, wet: 0 }); },
  toggle(on: boolean) { if (!ready() || !voice()) return; tone(on ? 660 : 440, { type: 'sine', gain: 0.08, decay: 0.09, to: on ? 990 : 330, wet: 0.1 }); },
  /** a page turning: soft paper, barely there */
  page() { if (!ready() || !voice()) return; noise({ type: 'bandpass', freq: 3200, to: 1500, q: 0.9, gain: 0.06, dur: 0.22, attack: 0.03, wet: 0.1 }); },
  whoosh() { if (!ready() || !voice()) return; noise({ type: 'bandpass', freq: 400, to: 2400, q: 0.8, gain: 0.12, dur: 0.45, attack: 0.15, wet: 0.3 }); },
  coin() {
    if (!ready()) return;
    bell(1318, { gain: 0.09, decay: 0.9, ratios: [1, 2.4, 4.1] });
    bell(1760, { at: 0.07, gain: 0.07, decay: 0.8, ratios: [1, 2.4, 4.1] });
  },
  // the crank's clicks were 30 LU under the drop that ends the same gesture: heard now, and lower so never piercing
  ratchet(i = 0) { if (!ready()) return; noise({ type: 'bandpass', freq: 1900 + (i % 3) * 300, q: 3, gain: 0.3, dur: 0.035, wet: 0.05 }); },
  drop() {
    if (!ready()) return;
    tone(180, { type: 'sine', gain: 0.25, decay: 0.18, to: 70, wet: 0.1 });
    noise({ type: 'lowpass', freq: 900, gain: 0.08, dur: 0.12 });
    tone(1250, { type: 'triangle', gain: 0.09, decay: 0.05, wet: 0 }); // the part a phone speaker can play
  },
  bounce(v = 1) { if (!ready()) return; tone(220 + v * 160, { type: 'sine', gain: 0.12 * v, decay: 0.09, to: 120, wet: 0.08 }); tone(1100 + v * 300, { type: 'triangle', gain: 0.035 * v, decay: 0.04, wet: 0 }); },
  rattle() { if (!ready()) return; for (let i = 0; i < 5; i++) noise({ at: i * 0.018 + Math.random() * 0.01, type: 'bandpass', freq: 1800 + Math.random() * 1600, q: 4, gain: 0.14, dur: 0.03, wet: 0.05 }); },
  wood(v = 1) { if (!ready()) return; tone(520 + Math.random() * 80, { type: 'triangle', gain: 0.1 * v, decay: 0.07, wet: 0.2 }); noise({ type: 'bandpass', freq: 1400, q: 3, gain: 0.05 * v, dur: 0.04 }); },
  rumble(v = 1) {
    if (!ready()) return;
    noise({ type: 'lowpass', freq: 160, q: 0.7, gain: 0.22 * v, dur: 0.35, attack: 0.03, wet: 0.05 });
    noise({ type: 'bandpass', freq: 420, q: 1.2, gain: 0.08 * v, dur: 0.3, attack: 0.03, wet: 0.05 }); // the grit a phone can play (the rest is under 160 Hz)
  },
  glass() { if (!ready()) return; bell(2093, { gain: 0.06, decay: 1.2, ratios: [1, 2.92, 5.1] }); },
  neon() { if (!ready()) return; tone(120, { type: 'sawtooth', gain: 0.04, decay: 0.12, wet: 0 }); },
  pop() {
    if (!ready()) return;
    tone(420, { type: 'sine', gain: 0.22, decay: 0.12, to: 900, wet: 0.2 });
    noise({ type: 'highpass', freq: 3000, gain: 0.08, dur: 0.06 });
  },
  stamp() {
    if (!ready() || !voice()) return;
    tone(90, { type: 'sine', gain: 0.22, decay: 0.12, to: 50, wet: 0.1 });
    noise({ type: 'bandpass', freq: 1400, q: 2, gain: 0.14, dur: 0.05 });
    tone(620, { type: 'triangle', gain: 0.07, decay: 0.05, wet: 0 }); // the rubber's knock, for phone speakers
  },
  flame() { if (!ready() || !voice()) return; noise({ type: 'bandpass', freq: 600, to: 1800, q: 0.7, gain: 0.1, dur: 0.5, attack: 0.08, wet: 0.2 }); bell(1568, { at: 0.15, gain: 0.05, decay: 0.8 }); },
  levelup() {
    if (!ready()) return;
    voicedAt = performance.now(); // a celebration is always heard, and it is the moment's voice
    LEVEL.forEach((m, i) => pluck(hz(m), { at: i * 0.07, gain: 0.45 }));
    bell(hz(84), { at: 0.4, gain: 0.08, decay: 2 });
  },
  // the finishes sit a little under the school's reveal that follows them (gold was the loudest sound in the app)
  foil() { if (!ready()) return; [84, 88, 91, 96].forEach((m, i) => tone(hz(m), { at: i * 0.05, gain: 0.065, decay: 0.5, wet: 0.6, type: 'sine' })); },
  gold() {
    if (!ready()) return;
    bell(hz(67), { gain: 0.07, decay: 3.2 });
    [79, 83, 86, 91].forEach((m, i) => tone(hz(m), { at: 0.1 + i * 0.07, gain: 0.025, decay: 1.2, wet: 0.7 }));
  },
  /** Each school gets its own short motif when a quote is revealed. */
  reveal(school: SchoolId) {
    if (!ready()) return;
    switch (school) {
      // the five motifs at one loudness (about -26 LUFS momentary each; they spread over 8 LU before)
      case 'stoic': STOIC.forEach((m, i) => pluck(hz(m), { at: i * 0.09, gain: 0.42 })); break; // D dorian lyre
      case 'socratic': SOCRATIC.forEach((m, i) => pluck(hz(m), { at: i * 0.08, gain: 0.36, bright: 4200 })); break;
      case 'eastern': [72, 74, 76, 79, 81].forEach((m, i) => bell(hz(m), { at: i * 0.12, gain: 0.046, decay: 2.6 })); break; // pentatonic bowls
      case 'existential': [57, 60, 64, 67, 71].forEach((m, i) => tone(hz(m), { at: i * 0.03, type: 'triangle', gain: 0.07, attack: 0.02, decay: 1.8, wet: 0.5 })); break; // Am9, late-night
      case 'absurd':
        tone(220, { type: 'triangle', gain: 0.28, decay: 0.35, to: 660, wet: 0.1 }); // boing (a triangle: a phone plays its overtones)
        [60, 64, 67, 72].forEach((m, i) => tone(hz(m), { at: 0.25 + i * 0.06, type: 'square', gain: 0.048, decay: 0.25, wet: 0.2 }));
        break;
    }
  },
};

// ---- the lamp ritual: cave air, the wick, the breath, and a chord that swells with it ----
interface LampVoice { bus: GainNode; nodes: AudioScheduledSourceNode[]; bf: BiquadFilterNode; bg: GainNode; pf: BiquadFilterNode; pg: GainNode; timer: number; power: number; lit: boolean }
let lampV: LampVoice | null = null;

export const lampSound = {
  /** First touch wakes the room (browsers only start audio on a gesture). */
  begin(lit = false) { // lit: the wick caught on an earlier touch, so the chord is there from the start
    if (!ready() || lampV) return;
    const c = ctx!, t = c.currentTime;
    const bus = c.createGain();
    bus.connect(out(0.4));
    const nodes: AudioScheduledSourceNode[] = [];
    const air = () => { const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random() * 1.5); nodes.push(s); return s; };
    // cave air: low and slow, barely there
    const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 190;
    const rg = c.createGain(); rg.gain.setValueAtTime(0.0001, t); rg.gain.exponentialRampToValueAtTime(0.035, t + 1.8);
    air().connect(rf).connect(rg).connect(bus);
    // the breath: air through a narrowing throat
    const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 420; bf.Q.value = 0.85;
    const bg = c.createGain(); bg.gain.value = 0.0001;
    air().connect(bf).connect(bg).connect(bus);
    // the chord: open D (D2 sub, D3 A3 D4 E4 A4), warm triangles behind a lowpass that opens with the breath
    const pf = c.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 280; pf.Q.value = 0.5;
    const pg = c.createGain(); pg.gain.value = 0.0001;
    pf.connect(pg).connect(bus);
    [38, 50, 57, 62, 64, 69].forEach((m, i) => {
      const o = c.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = hz(m);
      o.detune.value = (i % 2 ? 1 : -1) * (2 + i * 1.5);
      const g = c.createGain();
      g.gain.value = i === 0 ? 0.9 : 1 / (1 + i * 0.35);
      o.connect(g).connect(pf);
      o.start(t);
      nodes.push(o);
    });
    const v: LampVoice = { bus, nodes, bf, bg, pf, pg, timer: 0, power: 0, lit };
    lampV = v;
    // the wick sputters now and then, more often as the flame grows
    const crackle = () => {
      if (lampV !== v) return;
      if (v.lit && enabled()) noise({ type: 'bandpass', freq: 2600 + Math.random() * 3600, q: 2.5, gain: 0.008 + 0.028 * v.power * Math.random(), dur: 0.008 + Math.random() * 0.014, wet: 0.2 });
      v.timer = window.setTimeout(crackle, 110 + Math.random() * (650 - 350 * v.power));
    };
    crackle();
  },
  /** The wick catches: a soft low thump, a rush of air, a few sparks. */
  ignite() {
    if (lampV) lampV.lit = true;
    if (!ready()) return;
    // the first sound an untouched phone plays: the thump is below what its speaker can play, so a bright catch rides on it
    tone(92, { type: 'sine', gain: 0.18, attack: 0.01, decay: 0.32, to: 46, wet: 0.2 });
    tone(740, { type: 'triangle', gain: 0.06, decay: 0.08, to: 520, wet: 0.2 });
    noise({ type: 'bandpass', freq: 600, to: 2600, q: 0.7, gain: 0.12, dur: 0.42, attack: 0.02, wet: 0.35 });
    for (let i = 0; i < 4; i++) noise({ at: 0.04 + Math.random() * 0.25, type: 'highpass', freq: 5000, gain: 0.04, dur: 0.012, wet: 0.3 });
  },
  /** p is the breath, 0 to 1; holding says whether air is moving in right now. */
  set(p: number, holding: boolean) {
    if (!lampV || !ctx) return;
    const t = ctx.currentTime, v = lampV;
    v.power = p;
    v.bf.frequency.setTargetAtTime(420 + p * 1250, t, 0.12);
    v.bg.gain.setTargetAtTime(holding ? 0.012 + p * 0.055 : 0.0001, t, holding ? 0.15 : 0.25);
    v.pf.frequency.setTargetAtTime(280 + Math.pow(p, 1.4) * 2400, t, 0.2);
    v.pg.gain.setTargetAtTime(v.lit ? 0.004 + p * 0.034 : 0.0001, t, 0.3);
  },
  /** The breath is full: one singing bowl. */
  full() {
    if (!ready()) return;
    bell(hz(74), { gain: 0.09, decay: 5.5, ratios: [1, 2.71, 5.18, 8.43] });
    tone(hz(86), { at: 0.05, gain: 0.018, attack: 0.2, decay: 1.8, wet: 0.8 });
  },
  /** Let go: the long phew, the chord opens into light, then the room goes quiet. */
  release() {
    const v = lampV;
    lampV = null;
    if (v && ctx) {
      const t = ctx.currentTime;
      clearTimeout(v.timer);
      v.bg.gain.setTargetAtTime(0.0001, t, 0.1);
      v.bus.gain.setTargetAtTime(0.0001, t + 2.4, 0.5);
      v.nodes.forEach((n) => { try { n.stop(t + 5); } catch { /* stopped */ } });
    }
    if (!ready()) return;
    const t = ctx!.currentTime;
    noise({ type: 'bandpass', freq: 1500, to: 240, q: 0.6, gain: 0.12, dur: 1.7, attack: 0.07, wet: 0.5 });
    if (v) {
      v.pf.frequency.setTargetAtTime(3400, t, 0.3);
      v.pg.gain.setTargetAtTime(0.05, t, 0.35);
      v.pg.gain.setTargetAtTime(0.0001, t + 0.9, 0.8);
    } else {
      // the breath in was silent (a phone's first hold: sound may start only as the finger lifts), so the open D
      // chord it would have carried blooms here on its own
      [38, 50, 57, 62, 64, 69].forEach((m, i) => tone(hz(m), { type: i ? 'triangle' : 'sine', gain: i ? 0.024 / (1 + i * 0.35) : 0.03, attack: 0.3, decay: 2.2, wet: 0.6 }));
    }
    [78, 81].forEach((m, i) => tone(hz(m), { type: 'triangle', at: 0.15 + i * 0.12, gain: 0.02, attack: 0.35, decay: 2.6, wet: 0.7 }));
    tone(55, { type: 'sine', gain: 0.09, attack: 0.3, decay: 1.4, to: 110, wet: 0.3 });
    const shimmer = [86, 88, 91, 93, 95, 98];
    for (let i = 0; i < 8; i++) tone(hz(shimmer[(Math.random() * shimmer.length) | 0]), { at: 0.35 + Math.random() * 1.1, gain: 0.011, attack: 0.02, decay: 0.9, wet: 0.9 });
  },
  /** Skipped or left: fade everything fast. */
  cancel() {
    const v = lampV;
    lampV = null;
    if (!v || !ctx) return;
    const t = ctx.currentTime;
    clearTimeout(v.timer);
    v.bus.gain.setTargetAtTime(0.0001, t, 0.12);
    v.nodes.forEach((n) => { try { n.stop(t + 0.8); } catch { /* stopped */ } });
  },
};

// ---- room ambience: quiet generative beds, one at a time ----
let amb: { stop: () => void } | null = null;
export function ambience(school: SchoolId | null) {
  amb?.stop();
  amb = null;
  if (!school || !ready()) return;
  const c = ctx!;
  const bus = c.createGain();
  bus.gain.value = 0.0001;
  bus.connect(out(0.5));
  bus.gain.setTargetAtTime(0.5, c.currentTime, 1.2);
  const nodes: AudioScheduledSourceNode[] = [];
  const bed = (type: BiquadFilterType, freq: number, gain: number, q = 0.5) => {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07 + Math.random() * 0.05;
    const lg = c.createGain();
    lg.gain.value = gain * 0.6;
    lfo.connect(lg).connect(g.gain);
    s.connect(f).connect(g).connect(bus);
    s.start(0, Math.random() * 2);
    lfo.start();
    nodes.push(s, lfo);
  };
  let timer = 0;
  const every = (ms: number, fn: () => void) => {
    const loop = () => { if (enabled()) fn(); timer = window.setTimeout(loop, ms * (0.6 + Math.random() * 0.8)); };
    timer = window.setTimeout(loop, ms);
  };
  switch (school) {
    // the five rooms within a few LU of each other (an 18.8 LU spread before; the existential bed was steady hiss to 24 kHz)
    case 'eastern': bed('bandpass', 500, 0.035); every(5200, () => bell(hz([84, 86, 88, 91, 93][(Math.random() * 5) | 0]), { gain: 0.017, decay: 3 })); break; // wind and chimes
    case 'existential': bed('bandpass', 3000, 0.012, 0.4); every(700, () => noise({ type: 'bandpass', freq: 2500 + Math.random() * 3000, q: 8, gain: 0.02, dur: 0.02, wet: 0.2 })); break; // rain on glass
    case 'absurd': bed('bandpass', 6200, 0.032, 3); every(4000, () => tone(1800 + Math.random() * 600, { type: 'sine', gain: 0.012, decay: 0.3, to: 2600, wet: 0.3 })); break; // cicadas in the heat
    case 'stoic': bed('lowpass', 220, 0.13); every(9000, () => pluck(hz(HALL[(Math.random() * 3) | 0]), { gain: 0.07, decay: 0.99, bright: 1400 })); break; // stone hall
    case 'socratic': bed('bandpass', 900, 0.038); every(6000, () => { const f = 2400 + Math.random() * 1200; tone(f, { gain: 0.02, decay: 0.12, to: f * 1.4, wet: 0.3 }); tone(f * 1.1, { at: 0.14, gain: 0.015, decay: 0.1, to: f * 1.6, wet: 0.3 }); }); break; // breeze and a bird
  }
  amb = {
    stop() {
      clearTimeout(timer);
      const t = c.currentTime;
      bus.gain.setTargetAtTime(0.0001, t, 0.4);
      nodes.forEach((n) => { try { n.stop(t + 1.5); } catch { /* stopped */ } });
    },
  };
}

/** 0.5 soft, 0.8 medium, 1 loud */
export function setVolume(v: number) {
  store.update((s) => { s.settings.volume = v; });
  if (ctx && master) master.gain.setTargetAtTime(GAIN * v, ctx.currentTime, 0.05);
}

export function haptic(pattern: number | number[] = 12) {
  // never before the page has been activated (a finger counts on release): Chrome refuses the call and logs
  // "Blocked call to navigator.vibrate"
  if (!store.s.settings.haptics || !activated()) return;
  try { navigator.vibrate?.(pattern); } catch { /* iOS has no vibrate */ }
}
