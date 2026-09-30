import type { SchoolId } from '../content/schools';

export type Finish = 'paper' | 'foil' | 'gold';

export interface Note {
  quoteId: string;
  school: SchoolId;
  author: string;
  text: string;
  savedAt: number;
  updatedAt: number;
  finish: Finish;
  rewarded?: boolean; // a reflection on this quote already earned its flame
  shownAt?: number; // last time the notebook brought this line back to the top
}

export interface State {
  v: 1;
  createdAt: number;
  xp: number;
  flames: number;
  day: string; // last day the lamp was lit ('' = never)
  streak: number;
  best: number;
  reflectToday: number;
  sharedToday: number;
  pulls: number;
  pity: number;
  seen: Record<string, number>;
  finish: Record<string, Finish>;
  authors: Record<string, number>;
  notes: Record<string, Note>;
  pushes: number;
  milestones: number[]; // streak lengths already celebrated; lamp totals are stored negated (-10, -50...)
  oil: number; // spare oil, 0 to 2: keeps the lamp alight through a missed day
  lit: number; // lamps ever lit; never goes down
  litDays: string[]; // recent lamp days, newest last; 'YYYY-MM-DD*' = a day spare oil kept alight
  rekindle: { prev: number; day: string } | null; // out for a day or two: writing today brings the run back
  rite: { day: string; read: boolean; keep: boolean; done: boolean } | null; // today's three small beats
  settings: { sound: boolean; haptics: boolean; theme: 'auto' | 'light' | 'dark'; name: string; lang: 'th' | 'en'; volume: number };
  settingsAt: number; // when the reader last changed a setting (0 = never): with an account, the newest settings win
  removed: Record<string, number>; // notebook lines taken out, and when: with an account, a removal reaches every device
  introDone: boolean;
}

const KEY = 'pw.state.v1';

// A first visit that opens a published page (a quote, a thinker, the library, about, the Agora) reads it in Thai, the
// language it is written in: search engines render these pages as a first visit from an American browser, and an
// English guess hid every Thai line from them (a quote page showed Google only its English). The EN switch is in the
// header. The front door and the rooms, where the lamp comes first and has no switch, still guess from the device.
const PUBLISHED = /^\/(?:q\/|p\/|(?:library|about|agora)\/?$)/;

function guessLang(): 'th' | 'en' {
  try {
    const asked = new URLSearchParams(globalThis.location?.search ?? '').get('lang'); // a card carried out of an in-app browser (share.ts)
    if (asked === 'th' || asked === 'en') return asked;
    if (PUBLISHED.test(globalThis.location?.pathname ?? '')) return 'th';
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Bangkok') return 'th';
    if ((navigator.languages || [navigator.language]).some((l) => l?.toLowerCase().startsWith('th'))) return 'th';
  } catch { /* old browser */ }
  return 'en';
}

const fresh = (): State => ({
  v: 1,
  createdAt: Date.now(),
  xp: 0,
  flames: 0,
  day: '',
  streak: 0,
  best: 0,
  reflectToday: 0,
  sharedToday: 0,
  pulls: 0,
  pity: 0,
  seen: {},
  finish: {},
  authors: {},
  notes: {},
  pushes: 0,
  milestones: [],
  oil: 0,
  lit: 0,
  litDays: [],
  rekindle: null,
  rite: null,
  settings: { sound: true, haptics: true, theme: 'auto', name: '', lang: guessLang(), volume: 0.8 },
  settingsAt: 0,
  removed: {},
  introDone: false,
});

const SCHOOL_IDS = new Set(['stoic', 'existential', 'eastern', 'absurd', 'socratic']);
const FINISHES = new Set(['paper', 'foil', 'gold']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isFinish = (v: unknown): v is Finish => typeof v === 'string' && FINISHES.has(v);
const obj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});
const nat = (x: unknown) => (isNum(x) ? Math.max(0, Math.floor(x)) : 0);
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const rec = <T>(x: unknown, ok: (v: unknown) => v is T) => Object.fromEntries(Object.entries(obj(x)).filter(([, v]) => ok(v))) as Record<string, T>;

/**
 * Any saved or imported state made safe: every field of the right kind, anything else back to its default.
 * Older saves gain new fields; a broken or hand-edited file can never leave the app unable to start.
 */
export function clean(raw: unknown): State {
  const s = obj(raw), b = fresh(), set = obj(s.settings), rk = obj(s.rekindle), rt = obj(s.rite);
  const notes: Record<string, Note> = {};
  for (const [id, n0] of Object.entries(obj(s.notes))) {
    const n = obj(n0);
    if (typeof n.quoteId !== 'string' || !SCHOOL_IDS.has(str(n.school)) || typeof n.author !== 'string') continue;
    notes[id] = {
      quoteId: n.quoteId, school: n.school as SchoolId, author: n.author, text: str(n.text).slice(0, 4000),
      savedAt: isNum(n.savedAt) ? n.savedAt : b.createdAt, updatedAt: isNum(n.updatedAt) ? n.updatedAt : b.createdAt,
      finish: isFinish(n.finish) ? n.finish : 'paper',
      ...(n.rewarded === true ? { rewarded: true } : {}), ...(isNum(n.shownAt) ? { shownAt: n.shownAt } : {}),
    };
  }
  const st: State = {
    v: 1,
    createdAt: isNum(s.createdAt) ? s.createdAt : b.createdAt,
    xp: nat(s.xp), flames: nat(s.flames), day: DAY.test(str(s.day)) ? str(s.day) : '',
    streak: nat(s.streak), best: nat(s.best), reflectToday: nat(s.reflectToday), sharedToday: nat(s.sharedToday),
    pulls: nat(s.pulls), pity: nat(s.pity),
    seen: rec(s.seen, isNum), finish: rec(s.finish, isFinish), authors: rec(s.authors, isNum), notes,
    pushes: nat(s.pushes),
    milestones: Array.isArray(s.milestones) ? s.milestones.filter(isNum) : [],
    oil: Math.min(2, nat(s.oil)), lit: nat(s.lit),
    litDays: Array.isArray(s.litDays) ? s.litDays.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}\*?$/.test(d)).slice(-400) : [],
    rekindle: isNum(rk.prev) && DAY.test(str(rk.day)) ? { prev: nat(rk.prev), day: str(rk.day) } : null,
    rite: DAY.test(str(rt.day)) ? { day: str(rt.day), read: rt.read === true, keep: rt.keep === true, done: rt.done === true } : null,
    settings: {
      sound: typeof set.sound === 'boolean' ? set.sound : b.settings.sound,
      haptics: typeof set.haptics === 'boolean' ? set.haptics : b.settings.haptics,
      theme: set.theme === 'light' || set.theme === 'dark' || set.theme === 'auto' ? set.theme : b.settings.theme,
      name: str(set.name).slice(0, 32),
      lang: set.lang === 'th' || set.lang === 'en' ? set.lang : b.settings.lang,
      volume: isNum(set.volume) ? Math.min(1, Math.max(0, set.volume)) : b.settings.volume,
    },
    settingsAt: nat(s.settingsAt),
    // the newest thousand removals: enough to reach a device that has been away a long time
    removed: Object.fromEntries(Object.entries(rec(s.removed, isNum)).sort((x, y) => y[1] - x[1]).slice(0, 1000)),
    introDone: s.introDone === true,
  };
  if (!st.lit && st.day) st.lit = Math.max(st.best, st.streak, 1); // saves from before the lamp count
  return st;
}

/** A backup file, read and checked but not applied: what it holds, so the reader can say yes first. */
export function readBackup(text: string) {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('bad-file'); }
  const o = obj(raw);
  if (o.v !== 1 || !isNum(o.xp)) throw new Error('bad-file');
  return clean(raw);
}

// Every tab of this browser shares one saved copy, and each change is saved at once: a tab takes the saved copy
// whenever another tab wrote it since (before any change of its own, when it comes back to the front, on the storage
// event). A tab left open overnight once lit the next day's lamp on its old copy and saved it over a card pulled in
// another tab: the reader kept both lamps but lost the thinker (2026-09-30).
let lastRaw = ''; // the saved copy as this tab last read or wrote it

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    lastRaw = raw || '';
    return raw ? clean(JSON.parse(raw)) : fresh();
  } catch {
    return fresh();
  }
}

type Listener = (s: State) => void;
const listeners = new Set<Listener>();
let state = load();

/** Another tab saved since this one last looked: take its copy (it holds every change up to then). */
function refresh() {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return; }
  if (raw === null || raw === lastRaw) return; // nothing new, or storage was cleared (our next change writes it back)
  try { state = clean(JSON.parse(raw)); } catch { return; }
  lastRaw = raw;
  listeners.forEach((l) => l(state));
}

function persist() {
  try { lastRaw = JSON.stringify(state); localStorage.setItem(KEY, lastRaw); } catch { /* storage full or blocked: the session still works */ }
}

if (typeof document !== 'undefined') {
  addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) refresh(); });
  addEventListener('pageshow', (e) => { if (e.persisted) refresh(); }); // back from the page cache
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

export const store = {
  get s() { return state; },
  update(fn: (s: State) => void) {
    refresh();
    const was = JSON.stringify(state.settings);
    fn(state);
    if (JSON.stringify(state.settings) !== was) state.settingsAt = Date.now();
    persist();
    listeners.forEach((l) => l(state));
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  exportJson() { return JSON.stringify(state, null, 2); },
  /** Throws Error('bad-file') for anything that is not a Philosophew backup, so the UI can say so in either language. */
  /** Replace everything with a backup already read by readBackup (the reader has said yes). */
  restore(next: State) {
    state = next;
    persist();
    listeners.forEach((l) => l(state));
  },
  reset() {
    const lang = state.settings.lang; // erasing the data is not a request to switch language
    state = fresh();
    state.settings.lang = lang;
    persist();
    listeners.forEach((l) => l(state));
  },
};

/**
 * Signed in, a device's first pull of the day lands before today's lamp is lit (src/core/account.ts sets `pending`,
 * src/ui/ritual.ts waits), so the lamp counts from every device's days. Never more than a moment: offline, it lights.
 */
export const beforeLamp = {
  pending: null as Promise<unknown> | null,
  wait(ms = 2500) { return Promise.race([this.pending, new Promise((r) => setTimeout(r, ms))]).catch(() => {}); },
};

// A tiny event bus for moments the UI celebrates (level up, new philosopher, flames earned).
export type GameEvent =
  | { type: 'levelup'; level: number; title: string }
  | { type: 'flame'; delta: number; reason: string }
  | { type: 'xp'; delta: number }
  | { type: 'toast'; text: string }
  | { type: 'rekindle'; streak: number }
  | { type: 'rite' };
const bus = new Set<(e: GameEvent) => void>();
export const emit = (e: GameEvent) => bus.forEach((f) => f(e));
export const onGame = (f: (e: GameEvent) => void) => { bus.add(f); return () => bus.delete(f); };
