// An account on this device: who is signed in, and the sync that keeps this device's progress and the account's copy
// one. The session itself is an HttpOnly cookie no script can read; what the page knows is a small note kept here
// (pw.acct: the address, and where the sync stands). Playing without an account never loads this file.
// Light on the database, so it can sleep between visits:
//   pull  at sign-in, and when the app comes back to the front after ten minutes or more
//   push  10 s after the last change (60 s into a long run of them), at most once a minute, and once more as the
//         page goes away (a keepalive request)
// No polling, except the device-link status while its QR code is on screen (src/ui/signin.ts).
// One reader per page: the cookie is the browser's, shared by every tab. So every request names the reader this page
// holds (the API refuses it for another reader's session), the page stops the moment the device's note names someone
// else, and an answer that set out for a reader the page has since left is dropped: never applied, never retried.
import { store, emit, clean, type State } from './store';
import { merge, same } from './merge';
import { t } from './i18n';
import { setVolume } from './audio';
import { switchLang, applyTheme } from '../ui/shell';

export interface Me { id?: string; email: string; admin: boolean; created: string; unlimited?: boolean }
export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';
interface Note { me: Me; rev: number; dirty: boolean; pulledAt: number; pushedAt: number; logout?: boolean }

const KEY = 'pw.acct';
// Whose progress this device holds: the account it last synced as (its id, or its address for a note from before ids).
// A reader who signs in here as anyone else never receives it: it is set aside whole (LEFT, keyed by that owner) and
// comes back when its own reader signs in here again. A reader once signed out, signed in with a new account and found
// the old account's whole notebook merged into it.
const OWNER = 'pw.owner', LEFT = 'pw.left';
const PULL_EVERY = 10 * 60e3, PUSH_AFTER = 10e3, PUSH_GAP = 60e3, KEEPALIVE_MAX = 60 * 1024;

/** A refusal from the account API, by its code: the page says it in the reader's language (src/ui/signin.ts). */
export class AcctError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}

let note: Note | null = read();
let stored = !!note; // this page's note is on the device (a write can fail in private mode: then only this page knows it)
let status: SyncStatus = 'synced';
let ver = 0, syncedVer = note?.dirty ? -1 : 0; // changes made on this device, and how many of them the account has
let gen = 0; // moves on whenever this page signs in, signs out or leaves its reader: answers from before are dropped
let firstChange = 0, timer = 0, listening = false, applying = false;
let chain: Promise<void> = Promise.resolve(); // one write at a time
const subs = new Set<() => void>();

function read(): Note | null {
  try { const n = JSON.parse(localStorage.getItem(KEY) || 'null'); return n?.me?.email ? n : null; } catch { return null; }
}
/** One reader: by id when both notes know it (an account deleted and made again is someone new), else by address. */
const sameReader = (a?: Me | null, b?: Me | null) => !!a && !!b && a.email === b.email && (!a.id || !b.id || a.id === b.id);
/** The device's note still names this page's reader: no other tab has signed out, or in as someone else, since. */
function mine() {
  if (!note) return false;
  const n = read();
  return n ? !n.logout && sameReader(n.me, note.me) : !stored;
}
function save(force = false) {
  if (!note) return;
  if (!force && !mine()) return stale(); // another tab's reader holds the device now: their note is never overwritten
  note.dirty = dirty();
  try {
    localStorage.setItem(KEY, JSON.stringify(note));
    stored = true;
    localStorage.setItem(OWNER, note.me.id || note.me.email);
  } catch { /* private mode: this visit still syncs */ }
}
const tell = () => subs.forEach((f) => f());
function setStatus(s: SyncStatus) { if (s !== status) { status = s; tell(); } }
const dirty = () => ver !== syncedVer;

export const account = {
  get me() { return note && !note.logout ? note.me : null; }, // signed out offline: out, though the server hears it later
  get status(): SyncStatus { return status; },
  get syncedAt() { return Math.max(note?.pulledAt ?? 0, note?.pushedAt ?? 0); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};

// ---------- the API ----------
async function api<T>(path: string, method = 'GET', body?: unknown, keepalive = false) {
  const g = gen, me = note?.me;
  const ctl = new AbortController();
  const stop = setTimeout(() => ctl.abort(), 15000); // a sleeping database takes a moment to wake
  let r: Response, data: T & { error?: string };
  try {
    r = await fetch('/api' + path, {
      method, keepalive, signal: keepalive ? undefined : ctl.signal, credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(me ? { 'x-pw-account': me.id || encodeURIComponent(me.email) } : {}), // the reader this page speaks for
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    data = (await r.json().catch(() => ({}))) as T & { error?: string };
  } catch {
    throw new AcctError(g !== gen ? 'gone' : navigator.onLine ? 'network' : 'offline');
  } finally {
    clearTimeout(stop);
  }
  if (g !== gen) throw new AcctError('gone'); // set out for a reader this page has since left: dropped, never retried
  if (r.status === 409 && data.error === 'account') { stale(true); throw new AcctError('account'); } // the cookie is someone else's now
  return { status: r.status, data };
}
async function must<T>(path: string, method = 'GET', body?: unknown) {
  const r = await api<T>(path, method, body);
  if (r.status >= 400) throw new AcctError(r.data.error || 'server');
  return r.data;
}

// ---------- sync ----------
/** A copy from the account (or a merge with it) becomes this device's, without counting as a change made here. */
function apply(next: State) {
  const was = store.s.settings;
  applying = true;
  try { store.restore(next); } finally { applying = false; }
  const now = store.s.settings;
  if (now.lang !== was.lang) switchLang(now.lang);
  if (now.theme !== was.theme) applyTheme();
  if (now.volume !== was.volume) setVolume(now.volume);
}

/** The account's copy, fetched, and merged with this device's when both changed. Resolves whether the account had one. */
async function pull(): Promise<boolean> {
  if (!note || note.logout) return false;
  if (!mine()) { stale(); return false; }
  setStatus('syncing');
  const r = await api<{ state: unknown; rev: number; me?: Me }>('/state');
  if (r.status === 401) { lost(); return false; }
  if (r.status !== 200) throw new AcctError(r.data.error || 'server');
  if (!note) return false;
  note.pulledAt = Date.now();
  note.rev = r.data.rev;
  const granted = note.me.unlimited === true;
  if (r.data.me && sameReader(r.data.me, note.me)) note.me = r.data.me; // a grant made since sign-in; the id an older note lacked
  // a grant that arrives with this pull shows at once: the header and the room repaint their flames (they read pw.acct)
  if ((note.me.unlimited === true) !== granted) { save(); dispatchEvent(new Event('pw:grant')); }
  if (!r.data.state) { save(); await push(); return false; } // a new account: this device's progress is its first copy
  const theirs = clean(r.data.state);
  if (!dirty()) {
    if (!same(store.s, theirs)) apply(theirs); // nothing changed here since the last sync: the account's copy, as it is
  } else {
    const both = merge(store.s, theirs);
    apply(both);
    if (same(both, theirs)) syncedVer = ver; // this device had nothing the account lacked
  }
  save();
  if (dirty()) await push();
  else setStatus('synced');
  return true;
}

/** This device's progress to the account, one write at a time; a keepalive write goes at once (the page is leaving). */
function push(keepalive = false): Promise<void> {
  const g = gen; // queued for this reader: a write that only gets its turn after the page has left them never goes
  if (keepalive) return write(true, g);
  chain = chain.then(() => write(false, g), () => write(false, g));
  return chain;
}

async function write(keepalive: boolean, g: number, tries = 3): Promise<void> {
  if (g !== gen) return;
  if (!note || !dirty()) { if (!keepalive) setStatus('synced'); return; }
  if (!mine()) { if (!keepalive) stale(); return; } // (a page on its way out simply sends nothing)
  if (!keepalive) { clearTimeout(timer); setStatus('syncing'); }
  const sent = ver;
  const body = JSON.stringify({ state: store.s, rev: note.rev });
  if (keepalive && body.length > KEEPALIVE_MAX) return; // too big to send as the page closes: the next visit sends it
  const r = await api<{ rev: number; state: unknown }>('/state', 'PUT', body, keepalive);
  if (!note) return;
  if (r.status === 200) {
    note.rev = r.data.rev;
    note.pushedAt = Date.now();
    syncedVer = sent;
    if (!dirty()) firstChange = 0;
    save();
    if (dirty()) schedule(); else setStatus('synced');
    return;
  }
  if (r.status === 409 && tries > 1) {
    // another device wrote first: take its copy in, then send the two together
    note.rev = r.data.rev;
    apply(r.data.state ? merge(store.s, r.data.state) : store.s);
    save();
    return write(keepalive, g, tries - 1);
  }
  if (r.status === 401) return lost();
  throw new AcctError(r.data.error || 'server');
}

/** The next write: 10 s after the last change, 60 s into a run of changes, never sooner than a minute after the last. */
function schedule() {
  if (!note) return;
  const now = Date.now();
  if (!firstChange) firstChange = now;
  const at = Math.max(Math.min(now + PUSH_AFTER, firstChange + PUSH_GAP), note.pushedAt + PUSH_GAP);
  clearTimeout(timer);
  timer = window.setTimeout(() => void push().catch(fault), Math.max(0, at - now));
  if (status !== 'syncing') setStatus('pending');
}
function fault(e: unknown) {
  if (!note || (e instanceof AcctError && (e.code === 'gone' || e.code === 'account'))) return; // (another reader's answer)
  setStatus(e instanceof AcctError && e.code === 'offline' ? 'offline' : 'error');
  clearTimeout(timer);
  timer = window.setTimeout(() => void sync().catch(fault), 2 * PUSH_GAP);
}

/** Now (the reader asked, or a retry): the account's copy in, this device's changes out. */
export const sync = () => pull().then(() => {});

function listen() {
  if (listening) return;
  listening = true;
  store.subscribe(() => {
    if (applying || !note) return;
    ver++;
    if (ver === syncedVer + 1) save(); // the first change after a sync is remembered, in case the page closes first
    schedule();
  });
  const leave = () => { if (note && dirty()) void push(true).catch(() => {}); };
  addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return leave();
    if (note && Date.now() - note.pulledAt >= PULL_EVERY) void pull().catch(fault);
  });
  addEventListener('online', () => { if (note && dirty()) schedule(); });
  // another tab signed out, or in as someone else (src/main.ts starts every other page again too)
  addEventListener('storage', (e) => { if ((e.key === KEY || e.key === null) && note && !mine()) stale(); });
}

/** The session is gone (signed out elsewhere, or expired): this device keeps its progress, and says so once. */
function lost() {
  forget();
  emit({ type: 'toast', text: t('ออกจากระบบในเครื่องนี้แล้ว ข้อมูลในเครื่องยังอยู่ครบ', 'Signed out on this device. Everything here is still here.') });
}

function forget() {
  const was = note?.me;
  gen++;
  note = null;
  clearTimeout(timer);
  firstChange = 0;
  drop(was);
  status = 'synced';
  tell();
}
/** The device's note goes with this page's reader: never the note of a reader another tab has signed in since. */
function drop(me?: Me) {
  try { if (sameReader(read()?.me, me)) localStorage.removeItem(KEY); } catch { /* nothing kept */ }
}

/**
 * This page no longer speaks for the device's reader: another tab signed out or in as someone else, or the API says
 * the session is another reader's (`server`: then this page's own note, if the device still holds it, is dead too). It
 * stops at once, sends, applies and saves nothing more, and starts again from what the device holds now.
 */
function stale(server = false) {
  const was = note?.me;
  gen++;
  note = null;
  clearTimeout(timer);
  firstChange = 0;
  if (server) drop(was);
  location.reload();
}

/** Signed in at startup: sync if it is due. Today's lamp waits for this (store.ts beforeLamp), briefly. */
export async function boot() {
  if (!note) return;
  if (note.logout) {
    // signed out while offline: the session ends now
    const r = await api('/auth/logout', 'POST', {}).catch(() => null);
    if (r && r.status < 500) forget();
    return;
  }
  listen();
  try {
    if (Date.now() - note.pulledAt >= PULL_EVERY) await pull();
    else if (dirty()) await push();
  } catch (e) {
    fault(e);
  }
}

// ---------- signing in ----------
export interface Joined { me: Me; had: boolean } // had: the account already held progress (from another device)

/** The account whose progress the device holds now, if any: the mark, else the note on the device or on this page. */
function owner() {
  const n = note?.me;
  try { return localStorage.getItem(OWNER) || (read()?.me ? read()!.me.id || read()!.me.email : null) || (n ? n.id || n.email : null); } catch { return n ? n.id || n.email : null; }
}
const isOf = (id: string, me: Me) => id === me.id || id === me.email;

/**
 * Another reader's progress on this device goes aside, whole, until that reader signs in here again (bringBack). If it
 * cannot be kept (storage full or blocked) the device stays as it is: better merged than lost.
 */
function setAside(id: string) {
  try {
    const left: Record<string, unknown> = JSON.parse(localStorage.getItem(LEFT) || '{}');
    left[id] = left[id] ? merge(clean(left[id]), store.s) : store.s;
    localStorage.setItem(LEFT, JSON.stringify(left));
  } catch { return; }
  leaveDevice();
}
/** This reader's own progress, set aside when someone else signed in here, is back on the device and goes to the account. */
function bringBack(me: Me) {
  try {
    const left: Record<string, unknown> = JSON.parse(localStorage.getItem(LEFT) || '{}');
    const id = Object.keys(left).find((k) => isOf(k, me));
    if (!id) return;
    store.restore(merge(store.s, clean(left[id])));
    delete left[id];
    if (Object.keys(left).length) localStorage.setItem(LEFT, JSON.stringify(left)); else localStorage.removeItem(LEFT);
  } catch { /* nothing aside, or unreadable: nothing to bring */ }
}

async function begin(me: Me): Promise<Joined> {
  gen++; // a new reader: whatever is still on its way for the last one is dropped
  clearTimeout(timer);
  firstChange = 0;
  const was = owner();
  note = null; // what happens to the device now is nobody's change
  if (was && !isOf(was, me)) setAside(was);
  bringBack(me);
  note = { me, rev: 0, dirty: true, pulledAt: 0, pushedAt: 0 };
  stored = false;
  syncedVer = ver - 1; // everything on this device goes into the account
  save(true);
  listen();
  tell();
  let had = false;
  try { had = await pull(); } catch (e) { fault(e); }
  return { me, had };
}

export const emailStart = (email: string) => must<{ ok: true }>('/auth/email/start', 'POST', { email });
export const emailVerify = (email: string, code: string) => must<Me>('/auth/email/verify', 'POST', { email, code }).then(begin);
export const googleSignIn = (credential: string) => must<Me>('/auth/google', 'POST', { credential }).then(begin);
export const claimLink = (code: string) => must<Me>('/link/claim', 'POST', { code }).then(begin);

// ---------- this device, and the account ----------
export const createLink = () => must<{ code: string; short: string; expires: number }>('/link', 'POST', {});
export const linkStatus = () => must<{ status: 'waiting' | 'claimed' | 'expired' | 'none' }>('/link/status').then((r) => r.status);

/**
 * The device keeps nothing of a reader: a shared phone must not show the next person someone's notebook, level or Agora
 * name (a reader signed out and found theirs still there). Its own preferences stay: language, theme, sound.
 */
function leaveDevice() {
  const { lang, theme, sound, volume, haptics } = store.s.settings;
  store.reset();
  store.update((s) => { Object.assign(s.settings, { lang, theme, sound, volume, haptics }); });
  try { localStorage.removeItem(OWNER); } catch { /* nothing marked */ }
}

/**
 * Sign out here (or everywhere). Every change on the device reaches the account first, another tab's too; then the device
 * is left clean. 'out': signed out, the device clean. 'kept': signed out, but changes the account never took stay here
 * (the device is not cleaned, nothing is lost). 'later': offline, this device stops now and the session ends on its next
 * visit online. Refused, it throws 'signout' and the reader is still signed in; everywhere needs the server, so offline
 * it throws that too.
 */
export async function signOut(everywhere = false): Promise<'out' | 'kept' | 'later'> {
  if (!note) return 'out';
  if (!dirty() && read()?.dirty) syncedVer = ver - 1; // another tab's change is on the device, not yet in the account
  if (dirty()) await push().catch(() => {});
  if (!note) return 'out'; // the session ended meanwhile, or another tab signed this reader out
  try {
    await must(everywhere ? '/auth/logout-all' : '/auth/logout', 'POST', {});
  } catch (e) {
    const code = e instanceof AcctError ? e.code : '';
    if (code === 'unauthorized') return done(); // the session had already ended
    if (code !== 'offline' && code !== 'network') throw new AcctError('signout');
    if (everywhere || !note) throw e;
    note.logout = true; // the cookie outlives this page: the session ends on the next visit online
    save();
    gen++;
    note = null;
    tell();
    return 'later';
  }
  return done();
}
/** Out: the device is left clean when the account has everything it holds, else what it never took stays here. */
function done(): 'out' | 'kept' {
  const synced = !dirty();
  forget();
  if (!synced) return 'kept';
  leaveDevice();
  return 'out';
}

/** Everything the account holds, as a file for the reader to keep. */
export async function exportAccount() {
  const data = await must<Record<string, unknown>>('/account/export');
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export async function deleteAccount() {
  await must('/account', 'DELETE', {});
  forget();
  try { localStorage.removeItem(OWNER); } catch { /* nothing marked */ } // the device's progress is simply the reader's own now
}

/** Erase everything (src/ui/me.ts): nothing of any reader stays on the device, not even progress set aside. */
export function forgetDevice() {
  try { localStorage.removeItem(OWNER); localStorage.removeItem(LEFT); } catch { /* nothing kept */ }
}
