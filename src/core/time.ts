import { isEn } from './i18n';

// Day keys follow the device's local calendar: a Thai user's day ends at their midnight.
const dayFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const dayKey = (d = new Date()) => dayFmt.format(d); // "2026-09-28"

/** Whole days from key a to key b (b later = positive). */
export function daysBetween(a: string, b: string) {
  const t = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86400000);
}

export function niceDate(ts: number) {
  return new Date(ts).toLocaleDateString(isEn() ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Years for a philosopher: negative = BCE. */
export function lifespan(born: number | null, died: number | null, circa = false) {
  if (born == null && died == null) return '';
  if (isEn()) {
    const y = (n: number) => (n < 0 ? `${-n} BCE` : `${n}`);
    const c = circa ? 'c. ' : '';
    if (born != null && died == null) return `${c}${y(born)}–`;
    if (born == null) return `d. ${c}${y(died!)}`;
    if (born < 0 && died! < 0) return `${c}${-born}–${-died!} BCE`;
    if (born < 0) return `${c}${-born} BCE–${died} CE`;
    return `${c}${born}–${died}`;
  }
  const c = circa ? 'ราว ' : '';
  const y = (n: number) => (n < 0 ? `${-n} ปีก่อน ค.ศ.` : `ค.ศ. ${n}`);
  if (born != null && died == null) return `${c}${y(born)} ถึงปัจจุบัน`;
  if (born == null) return `เสียชีวิต${circa ? 'ราว' : ''} ${y(died!)}`;
  if (born < 0 && died! < 0) return `${c}${-born} ถึง ${-died!} ปีก่อน ค.ศ.`;
  if (born < 0) return `${c}${-born} ปีก่อน ค.ศ. ถึง ค.ศ. ${died}`;
  return `${c}ค.ศ. ${born} ถึง ${died}`;
}
