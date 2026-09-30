// Two copies of one reader's progress made into one: this device's and the account's. Deterministic (the same two
// copies always give the same result) and it never loses what either side kept:
//   collections  every card, finish, thinker and notebook line from either side; a line edited on both keeps the
//                newest words; a line removed after its last edit stays removed (State.removed)
//   counters     the larger of the two (XP, pulls, lamps lit, best run), so merging twice changes nothing
//   the lamp     the side that lit it last owns the day (flames, today's counts, the run, spare oil); on the same day the
//                spent flames stay spent. A device that lit today's lamp before it heard of the other's days counted
//                from too far back, so today is lit again on the other side's lamp, with the lamp's own rules
//   settings     the newest change wins (State.settingsAt); on a tie, the second copy (the account's)
// Used by src/core/account.ts; checked by scripts/check-account.mjs.
import { clean, type State, type Note, type Finish } from './store';
import { lightLamp } from './game';

const RANK: Record<Finish, number> = { paper: 0, foil: 1, gold: 2 };
const REFLECT_MIN = 15; // as game.ts: a reflection this long brings a rekindled run back

function union<T>(a: Record<string, T>, b: Record<string, T>, pick: (x: T, y: T) => T) {
  const out: Record<string, T> = {};
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) out[k] = k in a && k in b ? pick(a[k], b[k]) : k in a ? a[k] : b[k];
  return out;
}

function mergeNote(p: Note, q: Note): Note {
  // the newest words; on the same instant, the longer (then the later in plain order): never a coin toss
  const newer = p.updatedAt !== q.updatedAt ? (p.updatedAt > q.updatedAt ? p : q)
    : p.text.length !== q.text.length ? (p.text.length > q.text.length ? p : q) : p.text >= q.text ? p : q;
  const n: Note = { ...newer, savedAt: Math.min(p.savedAt, q.savedAt), finish: RANK[p.finish] >= RANK[q.finish] ? p.finish : q.finish };
  delete n.rewarded;
  delete n.shownAt;
  if (p.rewarded || q.rewarded) n.rewarded = true; // a reflection earns its flame once, whichever device wrote it
  const shown = Math.max(p.shownAt ?? 0, q.shownAt ?? 0);
  if (shown) n.shownAt = shown;
  return n;
}

/** Lamp days, lit or kept by oil ('YYYY-MM-DD*'): a day lit anywhere counts as lit. */
function mergeDays(...lists: string[][]) {
  const by = new Map<string, string>();
  for (const d of lists.flat()) {
    const k = d.slice(0, 10), cur = by.get(k);
    if (!cur || cur.endsWith('*')) by.set(k, d);
  }
  return [...by.keys()].sort().map((k) => by.get(k)!).slice(-400);
}
const countLit = (days: string[]) => days.filter((d) => !d.endsWith('*')).length;

/** The last lamp day before `s.day` in its history ('' if none): what that device knew when it lit today's lamp. */
const knewUpTo = (s: State) => s.litDays.map((d) => d.slice(0, 10)).filter((d) => d < s.day).pop() || '';

export function merge(local: unknown, remote: unknown): State {
  const a = clean(local), b = clean(remote);
  const same = a.day === b.day;
  const [late, early] = a.day > b.day ? [a, b] : [b, a];

  const removed = union(a.removed, b.removed, Math.max);
  const notes: Record<string, Note> = {};
  for (const [id, n] of Object.entries(union(a.notes, b.notes, mergeNote))) {
    if ((removed[id] ?? -1) >= n.updatedAt) continue; // removed after its last edit
    notes[id] = n;
    delete removed[id]; // written again after a removal: the line is back
  }

  const s: State = {
    v: 1,
    createdAt: Math.min(a.createdAt, b.createdAt),
    xp: Math.max(a.xp, b.xp),
    flames: same ? Math.min(a.flames, b.flames) : late.flames,
    day: late.day,
    streak: same ? Math.max(a.streak, b.streak) : late.streak,
    best: Math.max(a.best, b.best),
    reflectToday: same ? Math.max(a.reflectToday, b.reflectToday) : late.reflectToday,
    sharedToday: same ? Math.max(a.sharedToday, b.sharedToday) : late.sharedToday,
    pulls: Math.max(a.pulls, b.pulls),
    // the pull count since the last gold card, from the side that pulled more (the other has not seen every pull)
    pity: a.pulls !== b.pulls ? (a.pulls > b.pulls ? a : b).pity : Math.min(a.pity, b.pity),
    seen: union(a.seen, b.seen, Math.max),
    finish: union(a.finish, b.finish, (x, y) => (RANK[x] >= RANK[y] ? x : y)),
    authors: union(a.authors, b.authors, Math.min), // when each thinker was first met
    notes,
    reflected: union(a.reflected, b.reflected, Math.min),
    pushes: Math.max(a.pushes, b.pushes),
    milestones: [...new Set([...a.milestones, ...b.milestones])].sort((x, y) => x - y),
    oil: same ? Math.min(a.oil, b.oil) : late.oil,
    lit: 0,
    litDays: mergeDays(a.litDays, b.litDays),
    rekindle: null,
    rite: null,
    settings: { ...(a.settingsAt > b.settingsAt ? a : b).settings },
    settingsAt: Math.max(a.settingsAt, b.settingsAt),
    removed,
    introDone: a.introDone || b.introDone,
  };
  s.lit = Math.max(a.lit, b.lit, countLit(s.litDays));

  // today's small beats: the same day adds them up; otherwise the later day's
  const ra = a.rite?.day === s.day ? a.rite : null, rb = b.rite?.day === s.day ? b.rite : null;
  s.rite = ra && rb ? { day: s.day, read: ra.read || rb.read, keep: ra.keep || rb.keep, done: ra.done || rb.done } : ra || rb;

  // an offer to bring a broken run back lasts one day, and is spent once the run is back
  const offers = [a.rekindle, b.rekindle].filter((r) => r && r.day === s.day) as { prev: number; day: string }[];
  const offer = same ? offers.sort((x, y) => y.prev - x.prev)[0] : late.rekindle?.day === s.day ? late.rekindle : null;
  s.rekindle = offer && s.streak <= offer.prev ? offer : null;

  // the later lamp was lit by a device that had not heard of the earlier side's last lamp day
  if (!same && early.day && knewUpTo(late) < early.day) {
    const lamp: State = {
      ...s, day: early.day, streak: early.streak, oil: early.oil, rekindle: early.rekindle, flames: early.flames,
      lit: early.lit, litDays: [...early.litDays], milestones: [...s.milestones], reflectToday: 0, sharedToday: 0,
    };
    const r = lightLamp(lamp, late.day);
    if (r) {
      s.streak = lamp.streak;
      s.oil = lamp.oil;
      s.rekindle = lamp.rekindle;
      s.litDays = mergeDays(s.litDays, lamp.litDays);
      s.lit = Math.max(s.lit, lamp.lit, countLit(s.litDays));
      if (r.milestone) { s.milestones = lamp.milestones; s.flames = Math.min(12, s.flames + r.bonus); }
      // a reflection already written today brings an offered run back, as it would have on one device
      if (s.rekindle && Object.values(notes).some((n) => n.text.length >= REFLECT_MIN && n.updatedAt >= dayStart(s.day))) {
        s.streak = s.rekindle.prev + 1;
        s.rekindle = null;
      }
    }
  }
  s.best = Math.max(s.best, s.streak);
  return clean(s);
}

/** Midnight at the start of a day key, on this device's calendar (the one the day keys come from). */
const dayStart = (key: string) => new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)).getTime();

/** Two copies hold the same progress (key order aside): nothing to send. */
export function same(x: State, y: State) {
  const norm = (v: unknown): unknown => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])])) : v);
  return JSON.stringify(norm(x)) === JSON.stringify(norm(y));
}
