import './styles/fonts.css';
import './styles/base.css';
import './styles/app.css';
import './styles/pages.css';
import { route, startRouter, resolve, onFail, type Load } from './core/router';
import { mountShell, markNav, screen, unpre } from './ui/shell';
import { needsCheckIn } from './core/game';
import { dawn } from './ui/dawn';
import { sfx } from './core/audio';
import { registerSW } from './core/pwa';
import { typeset, protectWords, retypeset } from './core/thai';
import { SCHOOL, isSchool } from './content/schools';
import { titles } from './content/seo';
import { couldNotLoad, cannotOpen } from './ui/offline';
import { beforeLamp } from './core/store';

type ViewFn = (p: Record<string, string>, ctx?: { from: string | null }) => void | (() => void) | Promise<void | (() => void)>;

// The hall and the lamp load on demand too, and three.js with them (581 KB of the 680 KB the first page used to
// ship): a shared link to a quote or a philosopher opens without the 3D engine. index.html preloads them for the
// hall itself (vite.config.ts hallPreload), so the hall is as quick as before; a flat page warms them while idle,
// so walking into the hall from it does not wait on the network.
type HallModule = typeof import('./ui/hall');
let hallModule: HallModule | null = null;
const loadHall = () => import('./ui/hall').then((m) => (hallModule = m));
const sleepHall = () => hallModule?.sleepHall(); // a hall never built has nothing to put to sleep
const prepareHall = (p: { school?: string }) => loadHall().then((m) => m.prepareHall(p));
let warmed = false;
const warmHall = () => {
  if (warmed) return;
  warmed = true;
  // not at once: a slow phone spends its first seconds on the page the reader came for
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));
  setTimeout(() => idle(() => void loadHall().catch(() => {})), 5000); // offline and never saved: the hall says so when asked for
};

// A page that does not exist leaves a noindex behind (src/ui/missing.ts); the next page takes it away.
const indexable = () => document.head.querySelector('meta[data-noindex]')?.remove();

// Flat pages load on demand so the first paint only ships the hall. The router fetches a page's code first (the
// Load), so the hall only goes to sleep once the next page is ready to draw. Every page is titled in the reader's
// language with the title its prerendered HTML carries (src/content/seo.ts); quote and philosopher pages title
// themselves from their data.
const page = (loader: () => Promise<unknown>, name: string, title?: () => string): [ViewFn, Load] => [
  async (p, ctx) => {
    const m = (await loader()) as Record<string, ViewFn>;
    // the same page drawn again (a language switch): it keeps its place and does not enter again
    const same = ctx?.from === location.pathname;
    dawn(); // never on the lamp's dark paint (theme.js guesses from the address, as for /s/<not a school>)
    sleepHall();
    screen.classList.toggle('is-redraw', same);
    if (!same) { sfx.page(); scrollTo({ top: 0 }); }
    indexable();
    if (title) document.title = title();
    warmHall();
    const done = await m[name](p);
    unpre();
    return done;
  },
  loader,
];

// The daily breath lights the lamp before the first machine of the day. The hall is built behind the
// light, and the ritual steps aside only once it is ready (and the reader has read today's line).
// Shared links (/q, /p) open straight to their content; the lamp waits for the hall.
const hall: ViewFn = async (p) => {
  const s = p.school && isSchool(p.school) ? SCHOOL[p.school] : null;
  // the hall does not scroll: a page's scroll (and the header's frosted ground with it) must not follow the reader in
  scrollTo({ top: 0 });
  document.documentElement.classList.remove('is-scrolled');
  indexable();
  document.title = s ? titles.school(s) : titles.home();
  if (!needsCheckIn()) {
    dawn(); // theme.js guessed a lamp day; the clock disagreed
    const done = await (await loadHall()).hallView(p);
    unpre();
    return done;
  }
  const r = await (await import('./ui/ritual')).ritual();
  await r.settled; // the lamp's words slide in first, undisturbed: the hall's build stalled that slide
  try {
    const m = await loadHall();
    // once the page after the breath stands still, the first card also plays its entrance unseen, so that its real
    // flight never stalls (hall.ts rehearseCard). Never after a Skip or once the reader has moved on (the room does it
    // then), and the lamp never waits for it.
    void r.quiet.then((still) => { if (still) void m.rehearseCard(s?.id); });
    const done = await m.hallView(p);
    unpre();
    return done;
  } finally {
    r.reveal(); // even when the hall could not be built: the lamp never stays up over nothing
  }
};

const [notFound, notFoundCode] = page(() => import('./ui/missing'), 'missingView', titles.notFound);
route('/', hall, prepareHall);
// only the five schools have rooms: anything else under /s/ is a page that does not exist
route('/s/:school', (p) => (isSchool(p.school) ? hall(p) : notFound(p)), (p) => (isSchool(p.school) ? prepareHall(p) : notFoundCode(p)));
route('/notes', ...page(() => import('./ui/notes'), 'notesView', titles.notes));
route('/me', ...page(() => import('./ui/me'), 'meView', titles.me));
route('/agora', ...page(() => import('./ui/agora'), 'agoraView', titles.agora));
route('/library', ...page(() => import('./ui/library'), 'libraryView', titles.library));
route('/p/:id', ...page(() => import('./ui/philosopher'), 'philosopherView'));
route('/q/:id', ...page(() => import('./ui/quote'), 'quoteView'));
route('/about', ...page(() => import('./ui/about'), 'aboutView', titles.about));
route('/privacy', ...page(() => import('./ui/privacy'), 'privacyView', titles.privacy));
route('/admin', ...page(() => import('./ui/admin'), 'adminView', titles.admin));
route('/link', ...page(() => import('./ui/link'), 'linkView', titles.link));
route('/.*', notFound, notFoundCode);

// A page whose code cannot be fetched (offline and not saved on this device yet, or a file of an older build):
// the page on screen stays and the reader is told why. A page that fails while drawing says so in its place.
const room = /^\/s\/([^/]+)\/?$/;
onFail({
  load: (_, path) => couldNotLoad(path === '/' || isSchool(path.match(room)?.[1]) ? 'machine' : 'page'),
  view: (err) => {
    sleepHall();
    if (!document.documentElement.classList.contains('has-ritual')) dawn(); // the lamp hands the page back itself
    void cannotOpen(err);
  },
});

mountShell(() => void resolve());
// signed in on this device: sync in the background, and today's lamp waits for the account's copy (briefly). A reader
// without an account never loads any of it.
try { if (localStorage.getItem('pw.acct')) beforeLamp.pending = import('./core/account').then((m) => m.boot()); } catch { /* storage blocked */ }
// Another tab signed in, out, or in as someone else: what this page holds was read for another reader, so it starts
// again from what the device holds now (src/core/account.ts stops its own sync first), never syncing one reader's copy
// as another's.
const reader = (v: string | null) => { try { const n = JSON.parse(v || 'null'); return n?.me?.email && !n.logout ? String(n.me.email) : ''; } catch { return ''; } };
addEventListener('storage', (e) => { if (e.key === 'pw.acct' && reader(e.oldValue) !== reader(e.newValue)) location.reload(); });
const push = history.pushState.bind(history);
const replace = history.replaceState.bind(history);
history.pushState = (...a: Parameters<History['pushState']>) => { push(...a); markNav(location.pathname); };
history.replaceState = (...a: Parameters<History['replaceState']>) => { replace(...a); markNav(location.pathname); };
addEventListener('popstate', () => markNav(location.pathname));
markNav(location.pathname);
typeset(); // Thai joined where lines must not break; phrases and headings fitted, now and after a rotation
// the dictionary words the browser would split (เศร้า|หมอง): small, cached, and set into the page when they arrive
void fetch('/data/thai-words.json').then((r) => (r.ok ? r.json() : [])).then((w: string[]) => { protectWords(w); retypeset(); }).catch(() => {});
startRouter();
registerSW();
screen.focus({ preventScroll: true });
