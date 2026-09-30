// Today's line: one checked quote for everyone, the same on every device, chosen from the date alone.
// The weekday picks the school so the Thai colour of the day and the school accent agree:
// Sunday red (existential), Monday yellow (absurd, boulder day), Wednesday green (eastern),
// Thursday orange (stoic), Friday blue (socratic). Tuesday and Saturday are open.
import { dayKey } from './time';
import { loadSchool, loadAuthors, type Quote, type Author } from './data';
import type { SchoolId } from '../content/schools';

const BY_WEEKDAY: (SchoolId | null)[] = ['existential', 'absurd', null, 'eastern', 'stoic', 'socratic', null];
const ALL: SchoolId[] = ['stoic', 'existential', 'eastern', 'absurd', 'socratic'];

/** FNV-1a: tiny, stable across devices. */
export function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export interface Daily { quote: Quote; author: Author | null; school: SchoolId; key: string }

const good = (q: Quote) => q.verify !== 'attributed' && q.th.length <= 150;

export async function todaysLine(key = dayKey()): Promise<Daily | null> {
  const weekday = new Date(`${key}T12:00:00`).getDay();
  const school = BY_WEEKDAY[weekday] ?? ALL[fnv(key) % ALL.length];
  const [list, authors] = await Promise.all([loadSchool(school), loadAuthors()]);
  let pool = list.filter(good);
  // a school still on seed quotes: borrow from everyone rather than repeat five lines
  if (pool.length < 20) pool = (await Promise.all(ALL.map(loadSchool))).flat().filter(good);
  if (!pool.length) return null;
  const quote = pool[fnv(`${key}:${school}`) % pool.length];
  return { quote, author: authors[quote.author] || null, school: quote.school, key };
}
