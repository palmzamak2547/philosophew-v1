// History-API router: path patterns like '/s/:school'. Views return a cleanup.
export type Params = Record<string, string>;
export type View = (params: Params, ctx: { from: string | null }) => void | (() => void) | Promise<void | (() => void)>;
/** What a route fetches before anything on screen changes (its code): if that fails, the page stays as it was. */
export type Load = (params: Params) => Promise<unknown>;

interface Route { re: RegExp; keys: string[]; view: View; load?: Load }
const routes: Route[] = [];
let cleanup: (() => void) | void;
let current: string | null = null; // the path on screen
let shownAt = 0; // its history entry
let leaving = ''; // the address go() left, to put back if the next page cannot load
let restoring = false; // the popstate that putting it back causes
let token = 0;

export function route(pattern: string, view: View, load?: Load) {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => (keys.push(k), '/([^/]+)')) + '/?$');
  routes.push({ re, keys, view, load });
}

// What the app does when a page will not open. A load failure resolves true when a fresh page load is on its way.
let loadFailed: (err: unknown, path: string) => boolean | Promise<boolean> = () => false;
let viewFailed: (err: unknown, path: string) => void = (err) => console.error(err);
export function onFail(fns: { load?: typeof loadFailed; view?: typeof viewFailed }) {
  if (fns.load) loadFailed = fns.load;
  if (fns.view) viewFailed = fns.view;
}

const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export async function resolve() {
  const path = location.pathname;
  const from = current;
  const my = ++token;
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params: Params = {};
    r.keys.forEach((k, i) => (params[k] = decode(m[i + 1])));
    // Moving inside the app, the next page's code comes first: the page on screen is left untouched until it has.
    // (The first page has nothing to keep; it loads inside its view.)
    if (r.load && from !== null) {
      try {
        await r.load(params);
      } catch (err) {
        if (my !== token || (await loadFailed(err, path)) || my !== token) return;
        putBack();
        return;
      }
      if (my !== token) return;
    }
    current = path;
    shownAt = idx();
    try { cleanup?.(); } catch (e) { console.error(e); }
    cleanup = undefined;
    try {
      const c = await r.view(params, { from });
      if (my === token) cleanup = c;
      else if (typeof c === 'function') c(); // a newer navigation already won
    } catch (err) {
      if (my === token) viewFailed(err, path);
      else console.error(err);
    }
    return;
  }
}

/** The page on screen stays: its address comes back, by moving through history or by rewriting the entry. */
function putBack() {
  const delta = shownAt - idx();
  if (delta) { restoring = true; history.go(delta); }
  else if (location.pathname !== current) history.replaceState(history.state, '', leaving || current || '/');
}

const idx = () => (history.state as { idx?: number } | null)?.idx ?? 0;

export function go(path: string, opts: { replace?: boolean } = {}) {
  if (path === location.pathname + location.search) return;
  leaving = location.pathname + location.search;
  if (opts.replace) history.replaceState({ idx: idx() }, '', path);
  else history.pushState({ idx: idx() + 1 }, '', path);
  void resolve();
}

/** Back inside the app when there is history, otherwise to a sensible parent. */
export function back(fallback = '/') {
  if (idx() > 0) history.back();
  else go(fallback, { replace: true });
}

export function startRouter() {
  if (!history.state) history.replaceState({ idx: 0 }, '');
  addEventListener('popstate', () => {
    if (restoring) {
      restoring = false;
      if (location.pathname === current) return; // back where we were: nothing to draw
    }
    void resolve();
  });
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const url = new URL(a.href);
    if (url.origin !== location.origin || a.hasAttribute('download') || a.dataset.external != null) return;
    e.preventDefault();
    go(url.pathname + url.search);
  });
  void resolve();
}
