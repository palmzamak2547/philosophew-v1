import { store, emit, type Finish, type State, type Note } from './store';
import { dayKey, daysBetween } from './time';
import type { Quote } from './data';
import { t } from './i18n';

// ---- levels ----
export const LEVEL_TITLES: [string, string][] = [
  ['ผู้เริ่มสงสัย', 'The Wonderer'],
  ['นักตั้งคำถาม', 'The Questioner'],
  ['ผู้ฟังในอะกอรา', 'Listener in the Agora'],
  ['ผู้รักปัญญา', 'Lover of Wisdom'],
  ['ผู้เดินใต้ระเบียงหิน', 'Walker of the Stoa'],
  ['ผู้เดินออกจากถ้ำ', 'The One Who Left the Cave'],
  ['คนเข็นหินผู้มีความสุข', 'Happy Boulder Pusher'],
  ['ผู้ฝันว่าเป็นผีเสื้อ', 'Butterfly Dreamer'],
  ['ผู้เลือกทางเดินเอง', 'Chooser of Paths'],
  ['ผู้รู้ว่าตัวเองไม่รู้', 'Knower of Not Knowing'],
  ['ปราชญ์ผู้ปล่อยวาง', 'Sage Who Lets Go'],
  ['ราชาปราชญ์', 'Philosopher King'],
];
export const xpFor = (level: number) => Math.round(50 * Math.pow(level - 1, 1.6));
export function levelOf(xp: number) {
  let l = 1;
  while (xpFor(l + 1) <= xp) l++;
  const from = xpFor(l), to = xpFor(l + 1);
  const [th, en] = LEVEL_TITLES[Math.min(l, LEVEL_TITLES.length) - 1];
  return { level: l, title: t(th, en), from, to, progress: (xp - from) / (to - from) };
}
export const maxFlames = (level: number) => 5 + (level >= 5 ? 1 : 0) + (level >= 10 ? 1 : 0) + (level >= 20 ? 1 : 0);
const FLAME_CAP = 12;
const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];
const LIT_MILESTONES = [10, 50, 100, 365]; // total lamps: people who once broke a run get celebrated too
const OIL_EVERY = 7, OIL_MAX = 2;

function gainXp(s: State, delta: number) {
  const before = levelOf(s.xp).level;
  s.xp += delta;
  const after = levelOf(s.xp);
  emit({ type: 'xp', delta });
  if (after.level > before) {
    queueMicrotask(() => emit({ type: 'levelup', level: after.level, title: after.title }));
  }
}

// ---- daily lamp (breath ritual) ----
// The lamp bends, it does not break (docs/RETENTION.md 2.3): every 7th lamp stores a drop of spare oil
// (up to 2) that keeps a missed day alight; a lamp out for one or two days can be rekindled by writing a
// line today; the total of lamps ever lit never goes down. Nothing here is ever sold.
export interface CheckIn {
  streak: number;
  broken: boolean; // the run restarted (after oil and rekindle were considered)
  refilledTo: number;
  bonus: number;
  first: boolean;
  oilUsed: number;
  oilEarned: boolean;
  rekindleFrom: number; // > 0: the run that writing a line today will bring back
  away: number; // days missed, when the run restarted
  lit: number;
  milestone: { kind: 'streak' | 'lit'; n: number } | null;
}

export function needsCheckIn() {
  return store.s.day !== dayKey();
}

/** The day key n days before `key`, by calendar date (no clock or timezone involved). */
export function shiftDay(key: string, n: number) {
  const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

export function checkIn(): CheckIn | null {
  let res: CheckIn | null = null;
  store.update((s) => {
    res = lightLamp(s, dayKey());
    if (res) gainXp(s, 5);
  });
  return res;
}

/**
 * The lamp's rules for one day, on a plain state object, with no side effects (testable: scripts/check-lamp.mjs;
 * src/core/merge.ts runs them again for a device that lit its lamp before it heard of another device's days).
 */
export function lightLamp(s: State, today: string): CheckIn | null {
  {
    if (s.day === today) return null;
    const first = !s.day;
    const missed = first ? 0 : Math.max(0, daysBetween(s.day, today) - 1);
    let oilUsed = 0, rekindleFrom = 0;
    const marks: string[] = [];
    if (s.rekindle && s.rekindle.day !== today) s.rekindle = null; // an offer lasts one day
    if (first) s.streak = 1;
    else if (missed === 0) s.streak += 1;
    else if (missed <= OIL_MAX && s.oil >= missed) {
      s.oil -= missed;
      oilUsed = missed;
      for (let i = missed; i >= 1; i--) marks.push(shiftDay(today, -i) + '*');
      s.streak += 1;
    } else if (missed <= OIL_MAX && s.streak >= 2) {
      rekindleFrom = s.streak;
      s.rekindle = { prev: s.streak, day: today };
      s.streak = 1;
    } else s.streak = 1;
    const broken = !first && missed > 0 && !oilUsed;
    s.best = Math.max(s.best, s.streak);
    s.day = today;
    s.reflectToday = 0;
    s.sharedToday = 0;
    s.lit += 1;
    s.litDays = [...s.litDays, ...marks, today].slice(-400);
    let oilEarned = false;
    if (s.lit % OIL_EVERY === 0 && s.oil < OIL_MAX) { s.oil += 1; oilEarned = true; }
    const cap = maxFlames(levelOf(s.xp).level);
    s.flames = Math.min(FLAME_CAP, Math.max(s.flames, cap)); // refill, never take banked flames away
    let bonus = 0;
    let milestone: CheckIn['milestone'] = null;
    const m = STREAK_MILESTONES.find((x) => x === s.streak && !s.milestones.includes(x));
    const lm = LIT_MILESTONES.find((x) => x === s.lit && !s.milestones.includes(-x));
    if (m) { s.milestones.push(m); milestone = { kind: 'streak', n: m }; }
    else if (lm) { s.milestones.push(-lm); milestone = { kind: 'lit', n: lm }; }
    if (milestone) {
      bonus = 2;
      s.flames = Math.min(FLAME_CAP, s.flames + bonus);
    }
    return { streak: s.streak, broken, refilledTo: s.flames, bonus, first, oilUsed, oilEarned, rekindleFrom, away: broken ? missed : 0, lit: s.lit, milestone };
  }
}

// ---- the daily rite: breathe, read one line, keep one (docs/RETENTION.md 2.5) ----
// About thirty seconds without spending a flame; when all three are done the day gets a clear finish.
function riteBeat(s: State, beat: 'read' | 'keep') {
  const today = dayKey();
  if (s.rite?.day !== today) s.rite = { day: today, read: false, keep: false, done: false };
  s.rite[beat] = true;
  if (s.day === today && s.rite.read && s.rite.keep && !s.rite.done) {
    s.rite.done = true;
    queueMicrotask(() => emit({ type: 'rite' }));
  }
}
/** Reading today's line counts as the reading beat. */
export function markRead() { store.update((s) => riteBeat(s, 'read')); }

// ---- pulls ----
export interface Pull { quote: Quote; finish: Finish; newAuthor: boolean; count: number }

const RANK: Record<Finish, number> = { paper: 0, foil: 1, gold: 2 };

export function rollFinish(pity: number): Finish {
  if (pity >= 39) return 'gold'; // a gold card at least every 40 pulls
  const r = Math.random();
  return r < 0.025 ? 'gold' : r < 0.125 ? 'foil' : 'paper';
}

/**
 * Unseen quotes first, then the least seen. Two honest nudges, both told to the reader in the odds sheet:
 * machines introduce new faces first (half the draws, while anyone here is unmet), and a mood the reader
 * named leans the draw toward lines tagged with it (60%, when there are any).
 */
export function pickQuote(pool: Quote[], moods: string[] = []): Quote {
  const s = store.s;
  let from = pool;
  const felt = moods.length ? pool.filter((q) => q.mood.some((m) => moods.includes(m))) : [];
  if (felt.length && Math.random() < 0.6) from = felt;
  const unmet = from.filter((q) => !s.authors[q.author]);
  if (unmet.length && Math.random() < 0.5) from = unmet;
  let min = Infinity;
  for (const q of from) min = Math.min(min, s.seen[q.id] || 0);
  const cands = from.filter((q) => (s.seen[q.id] || 0) === min);
  return cands[(Math.random() * cands.length) | 0];
}

/** The very first card: a line found in the author's own writing, short, matching the mood when we know it. */
export function starterQuote(pool: Quote[], moods: string[] = []): Quote | undefined {
  const best = pool.filter((q) => q.verify === 'primary' && q.th.length <= 120);
  const felt = best.filter((q) => q.mood.some((m) => moods.includes(m)));
  const from = felt.length ? felt : best.length ? best : pool;
  return from[(Math.random() * from.length) | 0];
}

/** The mood the reader named this visit (a chip or their own words), for the machine to lean toward. */
export const sessionMoods = {
  get(): string[] { try { return JSON.parse(sessionStorage.getItem('pw.moods') || '[]'); } catch { return []; } },
  set(m: string[]) { try { sessionStorage.setItem('pw.moods', JSON.stringify(m.slice(0, 3))); } catch { /* private mode */ } },
};

/** Signed in on this device, from the account note (so a page can say where its words are kept without the account code). */
export function signedIn() {
  try { const n = JSON.parse(localStorage.getItem('pw.acct') || 'null'); return !!n?.me?.email && !n.logout; } catch { return false; }
}
/** An account the owner granted pulls without flames (pw.users.unlimited, kept in the account note pw.acct). */
export function unlimited() {
  try { return JSON.parse(localStorage.getItem('pw.acct') || 'null')?.me?.unlimited === true; } catch { return false; }
}
export function canPull() { return store.s.flames > 0 || unlimited(); }

export function pull(pool: Quote[], forced?: Quote, opts: { finish?: Finish; moods?: string[] } = {}): Pull | null {
  const free = unlimited();
  if (!pool.length || (store.s.flames <= 0 && !free)) return null;
  const quote = forced || pickQuote(pool, opts.moods);
  let result: Pull | null = null;
  store.update((s) => {
    if (!free) s.flames -= 1;
    s.pulls += 1;
    const finish = opts.finish || rollFinish(s.pity);
    s.pity = finish === 'gold' ? 0 : s.pity + 1;
    s.seen[quote.id] = (s.seen[quote.id] || 0) + 1;
    const prev = s.finish[quote.id];
    if (!prev || RANK[finish] > RANK[prev]) s.finish[quote.id] = finish;
    const newAuthor = !s.authors[quote.author];
    if (newAuthor) s.authors[quote.author] = Date.now();
    gainXp(s, 10 + (newAuthor ? 20 : 0) + (finish === 'gold' ? 15 : finish === 'foil' ? 5 : 0));
    riteBeat(s, 'read');
    result = { quote, finish, newAuthor, count: s.seen[quote.id] };
  });
  return result;
}

// ---- notebook ----
/**
 * The notebook comes back to you (docs/RETENTION.md 2.7): a line kept exactly 1, 7, 30 or 365 days ago,
 * or else an older reflection the notebook has not brought back in the last 14 days.
 */
export function pickResurface(notes: Note[], now = Date.now()): { note: Note; ago: number } | null {
  const DAY = 86400000, today = dayKey(new Date(now));
  const agoOf = (n: Note) => daysBetween(dayKey(new Date(n.savedAt)), today);
  for (const d of [1, 7, 30, 365]) {
    const hit = notes.find((n) => agoOf(n) === d);
    if (hit) return { note: hit, ago: d };
  }
  const old = notes.filter((n) => n.text.trim() && agoOf(n) >= 3 && (!n.shownAt || now - n.shownAt > 14 * DAY))
    .sort((a, b) => (a.shownAt || 0) - (b.shownAt || 0))[0];
  return old ? { note: old, ago: agoOf(old) } : null;
}


export const REFLECT_MIN = 15;
const REFLECT_DAILY = 3;

export function saveNote(q: Quote, text: string, finish: Finish) {
  let earned = false;
  let rekindled = 0;
  store.update((s) => {
    const now = Date.now();
    const prev = s.notes[q.id];
    const note = prev || { quoteId: q.id, school: q.school, author: q.author, text: '', savedAt: now, updatedAt: now, finish };
    note.text = text.trim().slice(0, 2000);
    note.updatedAt = now;
    if (RANK[finish] > RANK[note.finish]) note.finish = finish;
    if (s.rekindle && s.rekindle.day === dayKey() && note.text.length >= REFLECT_MIN) {
      s.streak = s.rekindle.prev + 1;
      s.best = Math.max(s.best, s.streak);
      s.rekindle = null;
      rekindled = s.streak;
    }
    // once per line, ever: a line removed and kept again earned its 25 XP again (and a flame) each time
    if (note.text.length >= REFLECT_MIN && !note.rewarded && !s.reflected[q.id]) {
      note.rewarded = true;
      s.reflected[q.id] = now;
      gainXp(s, 25);
      if (s.reflectToday < REFLECT_DAILY && s.flames < FLAME_CAP) {
        s.reflectToday += 1;
        s.flames += 1;
        earned = true;
      }
    }
    s.notes[q.id] = note;
    delete s.removed[q.id];
    riteBeat(s, 'keep');
  });
  if (earned) emit({ type: 'flame', delta: 1, reason: t('เขียนความคิดแล้ว ได้ไฟคืน 1 ดวง', 'Reflection written. One flame back.') });
  if (rekindled) emit({ type: 'rekindle', streak: rekindled });
  try { navigator.storage?.persist?.(); } catch { /* optional */ }
  return earned;
}

/** Out of the notebook, on every device: the removal is remembered, so a copy elsewhere does not bring the line back. */
export function removeNote(quoteId: string) {
  store.update((s) => {
    if (s.notes[quoteId]?.rewarded) s.reflected[quoteId] ??= Date.now(); // a line rewarded before this record existed
    delete s.notes[quoteId];
    s.removed[quoteId] = Date.now();
  });
}

/** Undo a removal: the line as it was, and the removal forgotten. */
export function restoreNote(n: Note) {
  store.update((s) => { s.notes[n.quoteId] = n; delete s.removed[n.quoteId]; });
}

export function markShared() {
  store.update((s) => {
    if (s.sharedToday < 3) { s.sharedToday += 1; gainXp(s, 10); }
  });
}

export function addPush() {
  store.update((s) => { s.pushes += 1; });
  return store.s.pushes;
}
