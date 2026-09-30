// Hand-set 24px line icons (1.8 stroke, round joins) plus the Philosophew mark.
// Trusted static markup: returned through raw() by callers.
const i = (body: string, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICON = {
  flame: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.6 2.2c.4 2.9-1 4.6-2.4 6.3C8.7 10.3 7 12.3 7 15.4 7 18.8 9.3 21.5 12.5 21.5c3.4 0 5.8-2.6 5.8-6.2 0-2.5-1.1-4.2-2.2-5.6.1 1.5-.4 2.7-1.4 3.3.3-3.9-.8-7.2-2.1-10.8Z"/><path fill="#fff" fill-opacity=".55" d="M12.3 13.2c.2 1.4-.5 2.2-1.1 3-.6.8-1 1.5-1 2.4 0 1.3 1 2.3 2.2 2.3 1.3 0 2.3-1 2.3-2.6 0-1.8-1-3.4-2.4-5.1Z"/></svg>`,
  lamp: i('<path d="M4 15.5c0 2 2.7 3.5 7.5 3.5S20 17.5 20 15.5H4Z"/><path d="M20 15.5c1.4 0 2.2-.8 2.2-1.8"/><path d="M4 15.5 3 14"/><path d="M11 12.5c-1.5-1.5-1-3.2.4-4.8.3 1.3 1.2 1.6 1.2 1.6s.9-.6.6-2.3c1.3 1.1 2 2.9.6 5.5"/>'),
  home: i('<path d="M3 10.5 12 4l9 6.5"/><path d="M5 10v9.5h14V10"/><path d="M9.5 19.5v-5h5v5"/><path d="M7.5 10v7M16.5 10v7"/>'),
  book: i('<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5c-.8 0-1.5-.7-1.5-1.5v-13Z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5v-13Z"/><path d="M7 8h1.5M15.5 8H17M15.5 11H17"/>'),
  agora: i('<path d="M3 20h18"/><path d="M4 8h16L12 3.5 4 8Z"/><path d="M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7"/>'),
  stars: i('<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="m5.5 15 .6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4L3.5 17l1.4-.6.6-1.4Z"/>'),
  bust: i('<path d="M8.5 9.5a3.5 3.5 0 1 1 7 0c0 2.3-1.6 4-3.5 4s-3.5-1.7-3.5-4Z"/><path d="M8.2 7.2c.7-2 2.2-3.2 3.8-3.2 2 0 3.4 1.3 3.9 3.4"/><path d="M5 20.5c.6-3.8 3.5-6 7-6s6.4 2.2 7 6H5Z"/>'),
  back: i('<path d="M15 5 8 12l7 7"/>'),
  close: i('<path d="M6 6l12 12M18 6 6 18"/>'),
  share: i('<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 12v6.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V12"/>'),
  save: i('<path d="M6.5 3.8h11c.4 0 .7.3.7.7v15.7l-6.2-4-6.2 4V4.5c0-.4.3-.7.7-.7Z"/>'),
  saved: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.5 3.8h11c.4 0 .7.3.7.7v15.7l-6.2-4-6.2 4V4.5c0-.4.3-.7.7-.7Z"/></svg>`,
  pen: i('<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z"/><path d="M13.5 7l3 3"/>'),
  again: i('<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9"/><path d="M19.5 4.5V9H15"/><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15"/><path d="M4.5 19.5V15H9"/>'),
  soundOn: i('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: i('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
  seal: i('<path d="M12 3l2.1 1.5 2.6-.1.8 2.5 2.1 1.5-.8 2.5.8 2.5-2.1 1.5-.8 2.5-2.6-.1L12 21l-2.1-1.5-2.6.1-.8-2.5-2.1-1.5.8-2.5-.8-2.5 2.1-1.5.8-2.5 2.6.1L12 3Z"/><path d="m8.8 12.2 2.2 2.2 4.2-4.4"/>'),
  info: i('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>'),
  link: i('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  download: i('<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>'),
  search: i('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
  moon: i('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>'),
  sun: i('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  check: i('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  heart: i('<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10Z"/>'),
  breath: i('<path d="M3 12h9.5a3 3 0 1 0-3-3"/><path d="M3 16h13a3 3 0 1 1-3 3"/><path d="M3 8h4"/>'),
  eye: i('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: i('<path d="M3 3l18 18"/><path d="M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.5 4.3-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  shield: i('<path d="M12 3.5 5 6v5.5c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6l-7-2.5Z"/><path d="m9 12 2 2 4-4"/>'),
  more: i('<circle cx="5.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>'),
  arrow: i('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  stop: i('<rect x="7" y="7" width="10" height="10" rx="2"/>'),
};

/**
 * The mark: a quotation mark made of two falling gacha capsules.
 * Each capsule is the dot of a comma; its motion trail is the comma's tail.
 */
export function mark(opts: { top?: string; bottom?: string; size?: number; cls?: string } = {}) {
  const top = opts.top || 'var(--ember)';
  const bottom = opts.bottom || 'currentColor';
  const g = (cx: number) => `
    <path d="M${cx - 10.7} 42.5 C${cx - 11.2} 28.5 ${cx - 5.2} 18 ${cx + 8.8} 11.6 C${cx + 9.3} 12.6 ${cx + 9.6} 13.6 ${cx + 9.7} 14.4 C${cx + 1.8} 19.2 ${cx - 2} 25.4 ${cx - 1.6} 31.6 Z" fill="${top}"/>
    <path d="M${cx - 11} 42.5 a11 11 0 0 1 22 0 Z" fill="${top}"/>
    <path d="M${cx - 11} 43.9 a11 11 0 0 0 22 0 Z" fill="${bottom}"/>
    <ellipse cx="${cx - 4.2}" cy="37.4" rx="2.6" ry="1.7" fill="#fff" fill-opacity=".55" transform="rotate(-24 ${cx - 4.2} 37.4)"/>`;
  return `<svg class="${opts.cls || 'mark'}" viewBox="0 0 64 64" width="${opts.size || 32}" height="${opts.size || 32}" aria-hidden="true">${g(20)}${g(45)}</svg>`;
}

/** Dharma wheel, drawn for the Buddha instead of a statue photo. */
export const DHARMA_WHEEL = `<svg viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3"><circle cx="50" cy="50" r="34"/><circle cx="50" cy="50" r="9"/><circle cx="50" cy="50" r="41" stroke-width="1.5"/>${Array.from({ length: 8 }, (_, k) => { const a = (k * Math.PI) / 4; const x1 = 50 + Math.cos(a) * 9, y1 = 50 + Math.sin(a) * 9, x2 = 50 + Math.cos(a) * 34, y2 = 50 + Math.sin(a) * 34, x3 = 50 + Math.cos(a) * 44, y3 = 50 + Math.sin(a) * 44; return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/><circle cx="${x3.toFixed(1)}" cy="${y3.toFixed(1)}" r="2.6" fill="currentColor" stroke="none"/>`; }).join('')}</svg>`;
