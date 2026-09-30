// Titles made from a quote or a thinker, shared with scripts/prerender.mjs like the ones in seo.ts, and the noindex a
// missing page sets. Only the pages that need them load this.
import { t } from '../core/i18n';
import type { Author } from '../core/data';
import { named } from './seo';

let words: Intl.Segmenter | null | undefined; // built on first use: a Thai word breaker is not free
const segmenter = () => (words === undefined ? (words = 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null) : words);

/** The start of a line for a title, at most `max` letters: whole phrases, or whole words when the first phrase runs long. */
export function titleLine(line: string, max = 60) {
  if (line.length <= max) return line;
  let cut = line.slice(0, max).replace(/\s+\S*$/, '');
  const w = cut.length < max / 2 ? segmenter() : null; // a two-word opening, or none: stop between words instead (Thai has no spaces there)
  if (w) {
    cut = '';
    for (const s of w.segment(line)) {
      if ((cut + s.segment).length > max) break;
      cut += s.segment;
    }
  }
  return `${(cut || line.slice(0, max)).trimEnd()}…`;
}

export const personTitle = (a: Author) => named(t(`${a.th} (${a.en}) | คำคมและที่มา`, a.en));
/** `line` and `name` in the reader's language. */
export const quoteTitle = (line: string, name: string) => named(`“${titleLine(line)}” ${name}`);

/**
 * A page that does not exist says so to search engines. The server answers every address with the app (status 200),
 * so this is how a crawler that runs scripts learns it is a 404. A tag of its own, so the page's robots tag stays;
 * main.ts takes it away when the next page opens.
 */
export function noindex() {
  if (document.head.querySelector('meta[data-noindex]')) return;
  const n = document.createElement('meta');
  n.name = 'robots';
  n.content = 'noindex';
  n.setAttribute('data-noindex', '');
  document.head.append(n);
}
