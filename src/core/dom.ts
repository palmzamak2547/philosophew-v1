// Tiny DOM toolkit: auto-escaping html`` templates, element creation, delegation.
export class Html {
  readonly s: string; // a plain field, not a parameter property, so Node can run the checks on this file as-is
  constructor(s: string) { this.s = s; }
  toString() { return this.s; }
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function render(v: unknown): string {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Html) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(str: TemplateStringsArray, ...vals: unknown[]): Html {
  let out = str[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + str[i + 1];
  return new Html(out);
}

/** Trusted markup only (our own SVG strings), never user text. */
export const raw = (s: string) => new Html(s);

export function el<T extends HTMLElement = HTMLElement>(h: Html | string): T {
  const t = document.createElement('template');
  t.innerHTML = String(h).trim();
  return t.content.firstElementChild as T;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/** Delegated listener; returns an unsubscribe. */
export function on<K extends keyof HTMLElementEventMap>(
  root: HTMLElement | Document,
  type: K,
  sel: string,
  fn: (e: HTMLElementEventMap[K], target: HTMLElement) => void,
) {
  const h = (e: Event) => {
    const t = (e.target as Element | null)?.closest?.(sel) as HTMLElement | null;
    if (t && root.contains(t)) fn(e as HTMLElementEventMap[K], t);
  };
  root.addEventListener(type, h as EventListener);
  return () => root.removeEventListener(type, h as EventListener);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Thai-aware number formatting (Western digits, grouping). */
export const fmt = (n: number) => n.toLocaleString('en-US');
