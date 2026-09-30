// Typewriter marks to typeset ones, for display only (the data stays as its sources wrote it, and search still
// matches what people type): “double” and ‘single’ quotes, ’ for apostrophes, … and —. Also repairs what copy and
// paste leaves behind: Windows-1252 quotes decoded as control characters, PDF ligatures, odd hyphens and bars.
const CP1252: Record<string, string> = { '\u0091': '‘', '\u0092': '’', '\u0093': '“', '\u0094': '”', '\u0096': '–', '\u0097': '—', '\u0085': '…' };

export function smart(s: string) {
  if (!s) return s;
  // NFC first: an "a" followed by a combining macron becomes the one letter ā, which the fonts draw as designed
  // (our serif has no mark positioning, so a loose combining mark floats beside its letter)
  return s.normalize('NFC')
    .replace(/[\u0085\u0091-\u0097]/g, (c) => CP1252[c] ?? '')
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/‐/g, '-').replace(/―/g, '—').replace(/ː/g, ':')
    .replace(/\.\.\./g, '…')
    .replace(/--/g, '—')
    .replace(/(^|[\s([{—–/-])"/g, '$1“') // a double quote after a space or an opening mark opens
    .replace(/"/g, '”') // every other one closes
    .replace(/(^|[\s([{—–/-])'(?=[^\s'])/g, '$1‘') // a single quote before a word opens
    .replace(/'/g, '’'); // the rest are apostrophes or closing quotes
}
