// The mark as two capsules (the geometry of icons.ts mark()): each device holds one, and signing in brings the two
// together into the quotation mark (docs/design/accounts.html). Used by the account sheets, /link and /me.
import { raw } from '../core/dom';
import '../styles/accounts.css'; // the account screens' own styles, loaded with them

export const capsule = (cx: number, cls = '') => `<g class="${cls}">
  <path d="M${cx - 10.7} 42.5C${cx - 11.2} 28.5 ${cx - 5.2} 18 ${cx + 8.8} 11.6C${cx + 9.3} 12.6 ${cx + 9.6} 13.6 ${cx + 9.7} 14.4C${cx + 1.8} 19.2 ${cx - 2} 25.4 ${cx - 1.6} 31.6Z" class="cap__top"/>
  <path d="M${cx - 11} 42.5a11 11 0 0 1 22 0Z" class="cap__top"/><path d="M${cx - 11} 43.9a11 11 0 0 0 22 0Z" class="cap__bottom"/></g>`;

/** 'waiting': this device's capsule and a dashed ghost for the next. 'joined': the second falls in beside the first. */
export const capsules = (state: 'waiting' | 'joined', cls = '') =>
  raw(`<svg class="caps caps--${state} ${cls}" viewBox="0 0 64 64" aria-hidden="true">${capsule(20)}${capsule(45, state === 'waiting' ? 'cap--ghost' : 'cap--fall')}</svg>`);
