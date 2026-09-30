import { protect } from './thai';
import type { SchoolId } from '../content/schools';
import { t } from './i18n';

export type Verify = 'primary' | 'sourced' | 'attributed';

export interface Quote {
  id: string;
  author: string;
  school: SchoolId;
  th: string;
  en: string;
  orig: { lang: string; text: string } | null;
  source: { work: string | null; locator: string | null; translator: string | null; url: string | null };
  verify: Verify;
  tags: string[];
  mood: string[];
}

export interface Author {
  id: string;
  en: string;
  th: string;
  schools: SchoolId[];
  born: number | null;
  died: number | null;
  circa: boolean;
  era: string | null;
  bio: string | null;
  bioEn: string | null;
  works: string[];
  wiki: { en: string | null; th: string | null };
  portrait: { file: string | null; thumb: string | null; kind: string; artist: string | null; license: string | null; source: string | null } | null;
}

export interface Myth { author: string; en: string; th: string; why_th: string; real_source?: string; url?: string; school: SchoolId }

export const verifyLabel = (v: Verify) => ({
  primary: { th: t('จากต้นฉบับ', 'Primary source'), long: t('เจอประโยคนี้ในตัวบทต้นฉบับ พร้อมระบุเล่มและบทให้ตรวจได้', 'Found in the primary text itself, with the work and section given.') },
  sourced: { th: t('มีแหล่งอ้างอิง', 'Sourced'), long: t('มีแหล่งอ้างอิงที่ตรวจสอบได้ว่าเป็นคำพูดของท่าน', 'A checkable source ties these words to the author.') },
  attributed: { th: t('เล่าต่อกันมา', 'Attributed'), long: t('เล่าต่อกันมาว่าเป็นคำพูดของท่าน แต่เรายังหาต้นฉบับไม่เจอ', 'Widely attributed to the author, but we have not found the original yet.') },
})[v];

const cache = new Map<string, Promise<unknown>>();
function getJson<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(url)); // let a later call retry after a network blip
    cache.set(url, p);
  }
  return p;
}

// every part of every Thai name is protected from line breaks inside it (src/core/thai.ts)
export const loadAuthors = () => getJson<Record<string, Author>>('/data/authors.json').then((all) => {
  protect(Object.values(all).flatMap((a) => a.th.split(/\s+/)));
  return all;
});
export const loadSchool = (id: SchoolId) => getJson<Quote[]>(`/data/quotes/${id}.json`);
export const loadPrompts = () => getJson<Record<SchoolId, { th: string[]; en: string[] }>>('/data/prompts.json');
export const loadMyths = () => getJson<Myth[]>('/data/myths.json');
/** rooms: the thinkers each machine holds lines of (a thinker in two schools is in both). */
export const loadMeta = () => getJson<{ total: number; counts: Record<SchoolId, number>; generated: string; rooms?: Record<SchoolId, string[]> }>('/data/meta.json');

const ALL: SchoolId[] = ['stoic', 'existential', 'eastern', 'absurd', 'socratic'];
export async function loadAllQuotes() {
  const lists = await Promise.all(ALL.map(loadSchool));
  return lists.flat();
}

// The school a prerendered page was written for (scripts/prerender.mjs tones a quote's, a thinker's and a room's own
// HTML), read once as the app starts, before any page retunes the colours: a shared quote then needs one school's
// file, not all five (about 160 KB on a slow phone before the card could draw).
const start = typeof document === 'undefined' ? null : { path: location.pathname, school: document.documentElement.dataset.school as SchoolId | undefined };
const hint = () => (start && start.path === location.pathname && ALL.includes(start.school!) ? start.school! : null);

/** A quote by its id: from a school this visit has already loaded, else from the page's own school, else from all. */
export async function findQuote(id: string) {
  const find = (list: Quote[]) => list.find((q) => q.id === id);
  for (const s of ALL) {
    const loading = cache.get(`/data/quotes/${s}.json`) as Promise<Quote[]> | undefined;
    const q = loading && find(await loading.catch(() => []));
    if (q) return q;
  }
  const s = hint();
  const q = s && find(await loadSchool(s));
  return q || find(await loadAllQuotes()) || null;
}

/** Start fetching the page's own school now (a thinker's page needs it once the thinkers have arrived). */
export const warmSchool = () => { const s = hint(); if (s) loadSchool(s).catch(() => {}); };

/** Every curated line of one thinker, in the schools' order: only the files of the schools they belong to. */
export async function quotesBy(a: Author) {
  const lists = await Promise.all(ALL.filter((s) => a.schools.includes(s)).map(loadSchool));
  return lists.flat().filter((q) => q.author === a.id);
}

// ---- the big library (lazy) ----
export interface LibraryIndex {
  generated: string;
  total: number;
  authors: Record<string, { count: number; sourced: number }>;
  sources: { key: string; name: string; url: string; license: string; rows_read: number; rows_kept: number }[];
}
export interface LibQuote { t: string; v: 'sourced' | 'attributed'; c: string | null; s: string[] }
export const loadLibraryIndex = () => getJson<LibraryIndex>('/data/library/index.json');
export const loadLibraryAuthor = (id: string) => getJson<{ author: string; quotes: LibQuote[] }>(`/data/library/${id}.json`);

// Fallback prompts when a school's curated file has none yet (and for English mode).
export const DEFAULT_PROMPTS_EN = [
  'Which part of your life does this touch right now?',
  'If you truly believed this, what would you do differently tomorrow?',
  'Where do you agree, and where do you push back?',
  'How would you explain this line to your closest friend?',
];
export const DEFAULT_PROMPTS = [
  'ประโยคนี้ตรงกับเรื่องไหนในชีวิตคุณตอนนี้',
  'ถ้าเชื่อประโยคนี้จริงๆ พรุ่งนี้คุณจะทำอะไรต่างไปจากเดิม',
  'คุณเห็นด้วยตรงไหน และไม่เห็นด้วยตรงไหน',
  'ถ้าต้องอธิบายประโยคนี้ให้เพื่อนสนิทฟัง คุณจะพูดว่าอะไร',
];
