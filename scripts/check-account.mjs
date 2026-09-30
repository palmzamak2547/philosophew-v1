// node scripts/check-account.mjs -> fails loudly if accounts regress where no server is needed: the merge of two copies of
// a reader's progress (src/core/merge.ts), the store's part in it (settings times, removed notebook lines), the tokens,
// codes and cookie the API makes (api/auth.ts), and one reader per page (src/core/account.ts, its API answered here).
// The API itself, end to end: node scripts/check-api.mjs.
import assert from 'node:assert/strict';
import { register } from 'node:module';
const mem = new Map();
globalThis.localStorage ??= { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window ??= globalThis;
register('./ts-hooks.mjs', import.meta.url);
const { merge, same } = await import('../src/core/merge.ts');
const { clean, store } = await import('../src/core/store.ts');
const { shiftDay, removeNote, restoreNote } = await import('../src/core/game.ts');

const TODAY = '2026-10-10';
const D = (n) => shiftDay(TODAY, n);
const at = (n, h = 12) => new Date(`${D(n)}T${String(h).padStart(2, '0')}:00:00`).getTime(); // local time, like the app
const note = (id, text, updatedAt, extra = {}) => ({ quoteId: id, school: 'stoic', author: 'epictetus', text, savedAt: updatedAt, updatedAt, finish: 'paper', ...extra });
const make = (o = {}) => clean({ ...clean({}), createdAt: at(-100), settings: { ...clean({}).settings, lang: 'th' }, ...o });
const lampDays = (from, to) => { const out = []; for (let i = from; i <= to; i++) out.push(D(i)); return out; };

// ---------- merge: collections ----------
{
  const a = make({
    xp: 300, pulls: 30, pity: 4, lit: 20, best: 9,
    seen: { q1: 2, q2: 1 }, finish: { q1: 'foil', q2: 'paper' }, authors: { epictetus: at(-50), seneca: at(-20) },
    notes: { q1: note('q1', 'old words', at(-5), { rewarded: true, finish: 'gold' }), q2: note('q2', 'only here', at(-4)) },
    milestones: [3, 7, -10],
  });
  const b = make({
    xp: 250, pulls: 34, pity: 1, lit: 18, best: 11,
    seen: { q1: 5, q3: 1 }, finish: { q1: 'paper', q3: 'gold' }, authors: { epictetus: at(-60), laozi: at(-2) },
    notes: { q1: note('q1', 'newer words, written on the laptop', at(-1)), q3: note('q3', '', at(-2)) },
    milestones: [3, 14],
  });
  const m = merge(a, b);
  assert.deepEqual(Object.keys(m.notes).sort(), ['q1', 'q2', 'q3'], 'every notebook line from both');
  assert.equal(m.notes.q1.text, 'newer words, written on the laptop', 'the newest edit wins');
  assert.equal(m.notes.q1.finish, 'gold', 'the best finish stays');
  assert.equal(m.notes.q1.rewarded, true, 'a reflection earns its flame once, on any device');
  assert.equal(m.notes.q1.savedAt, at(-5), 'kept since the first time');
  assert.deepEqual(m.seen, { q1: 5, q2: 1, q3: 1 });
  assert.deepEqual(m.finish, { q1: 'foil', q2: 'paper', q3: 'gold' });
  assert.deepEqual(m.authors, { epictetus: at(-60), laozi: at(-2), seneca: at(-20) }, 'thinkers met, first meeting');
  assert.deepEqual([m.xp, m.pulls, m.lit, m.best], [300, 34, 20, 11], 'counters: the larger');
  assert.equal(m.pity, 1, 'pity from the side that pulled more');
  assert.deepEqual(m.milestones, [-10, 3, 7, 14]);
  assert.ok(same(merge(a, b), merge(a, b)), 'deterministic');
  assert.ok(same(merge(a, b).notes, merge(b, a).notes) && same(merge(a, b).seen, merge(b, a).seen), 'collections do not depend on the order');
  assert.ok(same(merge(m, m), m) && same(merge(m, b), m), 'merging again changes nothing');
}

// ---------- merge: removed lines ----------
{
  const kept = note('q1', 'a line', at(-3));
  const gone = make({ notes: {}, removed: { q1: at(-2) } });
  assert.deepEqual(Object.keys(merge(gone, make({ notes: { q1: kept } })).notes), [], 'removed after its last edit: stays removed');
  assert.deepEqual(Object.keys(merge(make({ notes: { q1: kept } }), gone).notes), [], 'whichever side is first');
  const again = merge(gone, make({ notes: { q1: note('q1', 'written again', at(-1)) } }));
  assert.equal(again.notes.q1.text, 'written again', 'edited after the removal: back');
  assert.equal(again.removed.q1, undefined, 'and the removal forgotten');
}

// ---------- merge: the lamp ----------
{
  // different days: the later lamp owns the day
  const early = make({ day: D(-1), streak: 5, flames: 1, oil: 1, reflectToday: 3, lit: 30, litDays: lampDays(-5, -1) });
  const late = make({ day: D(0), streak: 6, flames: 4, oil: 1, reflectToday: 0, lit: 31, litDays: lampDays(-5, 0) });
  const m = merge(early, late);
  assert.deepEqual([m.day, m.streak, m.flames, m.reflectToday, m.lit], [D(0), 6, 4, 0, 31]);
  // the same day on both: spent flames stay spent, the day's counts add up, the run is the longer
  const phone = make({ day: D(0), streak: 6, flames: 2, reflectToday: 1, lit: 31, litDays: lampDays(-5, 0), rite: { day: D(0), read: true, keep: false, done: false } });
  const laptop = make({ day: D(0), streak: 6, flames: 4, reflectToday: 2, lit: 31, litDays: lampDays(-5, 0), rite: { day: D(0), read: false, keep: true, done: false } });
  const s = merge(phone, laptop);
  assert.deepEqual([s.flames, s.reflectToday, s.streak], [2, 2, 6]);
  assert.deepEqual(s.rite, { day: D(0), read: true, keep: true, done: false });
}
{
  // a new phone lit today's lamp before signing in; the account lit yesterday, ten days in a row
  const account = make({ day: D(-1), streak: 10, best: 10, oil: 1, flames: 0, lit: 40, litDays: lampDays(-10, -1), milestones: [3, 7] });
  const phone = make({ day: D(0), streak: 1, best: 1, flames: 5, lit: 1, litDays: [D(0)], xp: 5 });
  const m = merge(phone, account);
  assert.deepEqual([m.streak, m.best, m.lit, m.flames], [11, 11, 41, 5], 'one run: today follows yesterday');
  assert.ok(m.litDays.includes(D(-1)) && m.litDays.includes(D(0)));
  // two days away from the account's lamp, with a drop of oil: the oil keeps yesterday alight
  const oily = make({ day: D(-2), streak: 6, oil: 1, lit: 26, litDays: lampDays(-7, -2) });
  const o = merge(phone, oily);
  assert.deepEqual([o.streak, o.oil], [7, 0]);
  assert.ok(o.litDays.includes(`${D(-1)}*`), 'the day oil kept is marked');
  assert.ok(o.milestones.includes(7) && o.flames === 7, 'the 7-day milestone, with its two flames');
  // two days away with no oil: the run can come back today, and a line already written today brings it back
  const dry = make({ day: D(-2), streak: 8, oil: 0, lit: 30, litDays: lampDays(-9, -2) });
  const r = merge(phone, dry);
  assert.deepEqual([r.streak, r.rekindle], [1, { prev: 8, day: D(0) }]);
  const wrote = merge(make({ ...phone, notes: { q9: note('q9', 'a reflection long enough to count', at(0, 9)) } }), dry);
  assert.deepEqual([wrote.streak, wrote.rekindle], [9, null]);
  // a device that already had the account's days is not second-guessed
  const knew = make({ day: D(0), streak: 11, lit: 41, flames: 3, litDays: lampDays(-10, 0) });
  assert.deepEqual([merge(knew, account).streak, merge(knew, account).flames], [11, 3]);
}

// ---------- merge: settings, and a device with nothing yet ----------
{
  const a = make({ settings: { ...make().settings, theme: 'dark', lang: 'en' }, settingsAt: 200 });
  const b = make({ settings: { ...make().settings, theme: 'light', lang: 'th' }, settingsAt: 100 });
  assert.equal(merge(a, b).settings.theme, 'dark', 'the newest settings');
  assert.equal(merge(b, a).settings.theme, 'dark');
  assert.equal(merge(make({ settings: { ...make().settings, lang: 'en' } }), make()).settings.lang, 'th', 'a tie: the account');
  const account = make({ xp: 900, day: D(-1), streak: 4, best: 4, lit: 12, litDays: lampDays(-4, -1), notes: { q1: note('q1', 'x', at(-9)) }, introDone: true, settingsAt: 50 });
  const blank = clean({ settings: { lang: 'en' } });
  assert.ok(same(merge(blank, account), account), 'a new device takes the account as it is');
}

// ---------- the store's part ----------
{
  store.reset();
  const t0 = store.s.settingsAt;
  store.update((s) => { s.xp += 1; });
  assert.equal(store.s.settingsAt, t0, 'progress is not a settings change');
  store.update((s) => { s.settings.theme = 'dark'; });
  assert.ok(store.s.settingsAt > 0, 'a setting changed: its time is kept');
  store.update((s) => { s.notes.q1 = note('q1', 'kept', Date.now()); });
  const n = store.s.notes.q1;
  removeNote('q1');
  assert.ok(!store.s.notes.q1 && store.s.removed.q1 > 0, 'a removal leaves a mark');
  restoreNote(n);
  assert.ok(store.s.notes.q1 && !('q1' in store.s.removed), 'undo takes the mark away');
  const big = clean({ removed: Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`q${i}`, i])) });
  assert.equal(Object.keys(big.removed).length, 1000, 'the newest thousand removals are kept');
  assert.ok('q1499' in big.removed && !('q0' in big.removed));
  // two tabs: another tab pulls a card and saves; this tab, still holding its old copy, lights a lamp. Both stay.
  const other = JSON.parse(localStorage.getItem('pw.state.v1'));
  other.authors.camus = 1; other.seen.qc = 1;
  localStorage.setItem('pw.state.v1', JSON.stringify(other));
  store.update((s) => { s.lit += 1; });
  assert.ok(store.s.authors.camus === 1 && store.s.seen.qc === 1, 'a change made in another tab survives this tab\'s next change');
  assert.equal(JSON.parse(localStorage.getItem('pw.state.v1')).authors.camus, 1, 'and is saved with it, at once');
}
console.log('merge and store: all checks passed');

// ---------- tokens, codes and the cookie (api/auth.ts) ----------
const auth = await import('../api/auth.ts');
{
  const codes = Array.from({ length: 20000 }, auth.newCode);
  assert.ok(codes.every((c) => /^\d{6}$/.test(c)), 'six digits, always');
  assert.ok(codes.some((c) => c.startsWith('0')), 'leading zeros kept');
  assert.ok(new Set(codes).size > 19000, 'spread over the million');
  const tokens = Array.from({ length: 2000 }, auth.newToken);
  assert.ok(tokens.every((x) => /^[A-Za-z0-9_-]{43}$/.test(x)) && new Set(tokens).size === 2000, '256-bit tokens, base64url');
  assert.match(auth.newLinkCode(), /^[A-Za-z0-9_-]{22}$/);
  assert.ok(Array.from({ length: 500 }, auth.newShortCode).every((x) => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(x)), 'short codes: no I, L, O or U');
  assert.equal(auth.normShort('k7qm-2xpa'), 'K7QM2XPA');
  assert.equal(auth.normShort(' K7QM 2XPA '), 'K7QM2XPA');
  assert.equal(auth.normShort('O1IL2345'), '01112345', 'O reads as 0, I and L as 1');
  assert.equal(auth.normShort('UUUU2345'), null);
  assert.equal(auth.normShort('K7QM2XP'), null);
  const h = auth.hmac('secret', 'login', 'a@b.co', '123456');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, auth.hmac('secret', 'login', 'a@b.co', '123457'));
  assert.notEqual(h, auth.hmac('secret', 'login', 'b@b.co', '123456'), 'a code is tied to its address');
  assert.notEqual(h, auth.hmac('other', 'login', 'a@b.co', '123456'), 'and to the secret');
  assert.ok(auth.sameHash(h, auth.hmac('secret', 'login', 'a@b.co', '123456')));
  assert.ok(!auth.sameHash(h, auth.hmac('secret', 'login', 'a@b.co', '000000')));
  assert.ok(!auth.sameHash(h, h.slice(0, 62)) && !auth.sameHash('', ''), 'a short or empty hash is never equal');
  assert.equal(auth.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(auth.cookie('TOKEN'), 'pw_s=TOKEN; Path=/api; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax');
  assert.equal(auth.clearCookie(), 'pw_s=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  assert.equal(auth.normEmail('  Palm@Example.COM '), 'palm@example.com');
  for (const bad of ['', 'nope', 'a@b', 'a b@c.de', '@c.de', `${'x'.repeat(250)}@c.de`, 42, null]) assert.equal(auth.normEmail(bad), null, String(bad));
  assert.equal(auth.deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'), 'Chrome on Windows');
  assert.equal(auth.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari on iPhone');
  assert.equal(auth.deviceLabel(''), 'A browser');
}
console.log('tokens, codes and the cookie: all checks passed');

// ---------- mail to hello@: Resend's webhook signature (api/inbound.ts) ----------
{
  const { signed } = await import('../api/inbound.ts');
  const { createHmac } = await import('node:crypto');
  const secret = 'whsec_' + Buffer.from('a test key, not a real one').toString('base64');
  const body = '{"type":"email.received","data":{"email_id":"e1"}}', id = 'msg_1', ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  assert.ok(signed(body, id, ts, `v1,${sig}`, secret), 'a signed call passes');
  assert.ok(signed(body, id, ts, `v1,bm90IGl0 v1,${sig}`, secret), 'any one of several signatures will do');
  assert.ok(!signed(body.replace('e1', 'e2'), id, ts, `v1,${sig}`, secret), 'a changed body fails');
  assert.ok(!signed(body, id, String(Number(ts) - 600), `v1,${sig}`, secret), 'an old call fails');
  assert.ok(!signed(body, id, ts, `v1,${sig}`, ''), 'no secret, no pass');
}
console.log('inbound mail signature: all checks passed');

// ---------- one reader per page (src/core/account.ts) ----------
// Each import of account.ts below is one tab (its own module), sharing the device's storage and store; fetch stands in
// for the API, and the account's sound and page shell are no-ops here.
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, next) {
  if (c.parentURL?.includes('/src/core/account.ts') && /\\/(audio|shell)$/.test(s)) return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export const setVolume = () => {}, switchLang = () => {}, applyTheme = () => {};') };
  return next(s, c);
}`)}`);
{
  const on = {};
  globalThis.addEventListener = (k, f) => (on[k] ??= []).push(f);
  globalThis.document = { hidden: false, addEventListener: () => {} };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, languages: ['en'] }, configurable: true });
  let reloads = 0;
  globalThis.location = { reload: () => { reloads++; } };
  const A = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.test', admin: false, created: '2026-01-01T00:00:00Z' };
  const B = { id: '22222222-2222-4222-8222-222222222222', email: 'b@example.test', admin: false, created: '2026-01-01T00:00:00Z' };
  const C = { id: '33333333-3333-4333-8333-333333333333', email: 'c@example.test', admin: false, created: '2026-01-01T00:00:00Z' };
  const acct = (me, o = {}) => JSON.stringify({ me, rev: 1, dirty: false, pulledAt: Date.now(), pushedAt: 0, ...o });
  const withNote = (text) => make({ notes: { q1: note('q1', text, at(-1)) } });
  let tabs = 0, calls = [], answer = () => Response.json({});
  /** A page opened now, with this reader's note on the device (none: signed out). */
  const tab = async (me, o) => { if (me) mem.set('pw.acct', acct(me, o)); else mem.delete('pw.acct'); calls = []; reloads = 0; return import(`../src/core/account.ts?tab=${++tabs}`); };
  globalThis.fetch = async (path, init = {}) => {
    const c = { path, method: init.method || 'GET', who: init.headers?.['x-pw-account'], body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(c);
    return answer(c);
  };
  const texts = () => Object.values(store.s.notes).map((n) => n.text).sort();
  const stored = () => JSON.parse(mem.get('pw.acct') || 'null');
  const ok = () => Response.json({ ok: true });

  // every request names the reader the page holds: the id, or the address for a note from before ids
  store.restore(withNote('A private'));
  let t = await tab(A);
  answer = () => Response.json({ state: withNote('A private'), rev: 1, me: A });
  await t.sync();
  assert.deepEqual(calls.map((c) => [c.method, c.path, c.who]), [['GET', '/api/state', A.id]]);
  t = await tab({ email: A.email, admin: false, created: A.created });
  await t.sync();
  assert.equal(calls[0].who, 'a%40example.test', 'an older note names the address (any address fits in a header)');
  assert.equal(stored().me.id, A.id, 'and keeps the id the answer brings');

  // another tab signed out and in as B, its storage event not here yet: this page sends and saves nothing for B
  store.restore(withNote('A private'));
  t = await tab(A);
  await t.boot();
  mem.set('pw.acct', acct(B));
  store.update((s) => { s.xp++; });
  await t.sync();
  assert.deepEqual(calls, [], 'no request at all');
  assert.equal(stored().me.email, B.email, "B's note is never overwritten or removed");
  assert.ok(reloads >= 1 && t.account.me === null, 'the page stops and starts again');

  // the storage event alone stops a page; a note for the same reader does not
  t = await tab(A);
  await t.boot();
  mem.set('pw.acct', acct(A, { rev: 9 }));
  on.storage.forEach((f) => f({ key: 'pw.acct' }));
  assert.ok(reloads === 0 && t.account.me?.email === A.email, 'the same reader: nothing happens');
  mem.set('pw.acct', acct(A, { logout: true }));
  on.storage.forEach((f) => f({ key: 'pw.acct' }));
  assert.ok(reloads === 1 && t.account.me === null, 'signed out in another tab: this page stops');
  assert.ok(stored().logout, "the other tab's pending sign-out stays for the next visit online");

  // the API says the session is another reader's: nothing of the answer applied, no retry, this page's own note goes
  store.restore(withNote('A private'));
  t = await tab(A);
  answer = () => Response.json({ error: 'account', state: withNote('B private'), rev: 3 }, { status: 409 });
  assert.equal((await t.sync().catch((e) => e)).code, 'account');
  assert.deepEqual(texts(), ['A private'], 'nothing applied');
  assert.ok(calls.length === 1 && reloads === 1 && !mem.has('pw.acct'), 'one request, no retry; the dead note goes');
  t = await tab(A, { dirty: true }); // a write refused the same way is never merged, and never sent again
  await t.boot();
  assert.deepEqual([calls.map((c) => c.method), texts(), reloads], [['PUT'], ['A private'], 1]);

  // a 401 that lands after another tab signed B in: this page signs itself out, and B's note stays
  t = await tab(A);
  answer = () => { mem.set('pw.acct', acct(B)); return Response.json({ error: 'unauthorized' }, { status: 401 }); };
  await t.sync();
  assert.ok(t.account.me === null && stored().me.email === B.email);

  // signing out tells the truth: refused, the reader is still signed in; offline, it finishes on the next visit online
  t = await tab(A);
  answer = () => Response.json({ error: 'server' }, { status: 500 });
  assert.equal((await t.signOut().catch((e) => e)).code, 'signout');
  assert.ok(t.account.me?.email === A.email && stored().me.email === A.email, 'still signed in, here and on the device');
  answer = () => Response.json({ error: 'unauthorized' }, { status: 401 });
  assert.equal(await t.signOut(), 'out', 'a session that had already ended');
  assert.ok(t.account.me === null && !mem.has('pw.acct'));
  t = await tab(A);
  answer = () => Promise.reject(new TypeError('Failed to fetch'));
  navigator.onLine = false;
  assert.equal((await t.signOut(true).catch((e) => e)).code, 'offline', 'everywhere needs the server');
  assert.equal(t.account.me?.email, A.email);
  assert.equal(await t.signOut(), 'later');
  assert.ok(t.account.me === null && stored().logout === true, 'out on this device now');
  navigator.onLine = true;
  t = await tab(A, { logout: true });
  assert.equal(t.account.me, null, 'a sign-out waiting to reach the server is out already');
  answer = ok;
  await t.boot();
  assert.ok(!mem.has('pw.acct') && calls.map((c) => c.path).join() === '/api/auth/logout', 'and it reaches the server at the next visit');

  // signed out for real, the device is left clean (the account has it all): its preferences stay, the reader's go
  store.restore(withNote('A private'));
  store.update((s) => { s.settings.theme = 'dark'; s.settings.lang = 'en'; s.settings.name = 'Athens'; s.xp = 900; });
  t = await tab(A);
  answer = ok;
  assert.equal(await t.signOut(), 'out');
  assert.ok(!store.s.notes.q1 && store.s.xp === 0 && store.s.settings.name === '', 'no notebook, level or Agora name left');
  assert.ok(store.s.settings.theme === 'dark' && store.s.settings.lang === 'en', 'the device keeps its theme and language');
  // a change the account never took stays on the device, and the reader is told so
  store.restore(withNote('A unsent'));
  t = await tab(A, { dirty: true });
  answer = (c) => (c.method === 'PUT' ? Response.json({ error: 'server' }, { status: 500 }) : ok());
  assert.equal(await t.signOut(), 'kept');
  assert.ok(store.s.notes.q1?.text === 'A unsent' && !mem.has('pw.acct'), 'out, with the unsent line still here');
  // another tab's change, not in the account yet, reaches it before this page signs out and cleans the device
  store.restore(withNote('A from the other tab'));
  t = await tab(A);
  mem.set('pw.acct', acct(A, { dirty: true })); // written by the other tab after this page loaded
  answer = (c) => (c.method === 'PUT' ? Response.json({ rev: 2 }) : ok());
  assert.equal(await t.signOut(), 'out');
  assert.ok(calls.some((c) => c.method === 'PUT' && c.body.state.notes.q1?.text === 'A from the other tab'), "the other tab's line went to the account first");

  // a reader who signs in where another reader's progress is (kept after a refused write, or a session ended elsewhere)
  // never receives it: it is set aside whole, and comes back when its own reader signs in here again
  const cloud = { [A.email]: { state: null, rev: 0 }, [B.email]: { state: null, rev: 0 } };
  const as = (who) => (c) => {
    if (c.path === '/api/auth/email/verify') return Response.json(who);
    const box = cloud[who.email];
    if (c.path === '/api/state' && c.method === 'GET') return Response.json({ ...box, me: who });
    if (c.path === '/api/state' && c.method === 'PUT') { box.state = c.body.state; box.rev++; return Response.json({ rev: box.rev }); }
    return ok();
  };
  store.restore(withNote('A kept'));
  mem.set('pw.owner', A.id);
  t = await tab(null);
  answer = as(B);
  await t.emailVerify(B.email, '000000');
  assert.deepEqual([texts(), Object.keys(cloud[B.email].state?.notes ?? {})], [[], []], "B's page and B's account hold nothing of A");
  assert.ok(JSON.parse(mem.get('pw.left'))[A.id].notes.q1.text === 'A kept' && mem.get('pw.owner') === B.id, "A's progress waits aside");
  answer = as(B);
  assert.equal(await t.signOut(), 'out');
  t = await tab(null);
  answer = as(A);
  await t.emailVerify(A.email, '000000');
  assert.ok(texts().includes('A kept') && cloud[A.email].state?.notes.q1?.text === 'A kept', 'A gets it back, here and in the account');
  assert.ok(!mem.has('pw.left'), 'nothing left aside');
  answer = as(A);
  await t.signOut();
  // progress made before ever signing in is the reader's own: it goes into the account they open
  store.restore(withNote('played first'));
  mem.delete('pw.owner');
  t = await tab(null);
  cloud[B.email] = { state: null, rev: 0 };
  answer = as(B);
  await t.emailVerify(B.email, '000000');
  assert.equal(cloud[B.email].state?.notes.q1?.text, 'played first');
  answer = as(B);
  await t.signOut();

  // an answer that set out for A lands after A signed out and C signed in: dropped, never applied, never retried
  store.restore(withNote('A private'));
  t = await tab(A);
  let release, cloudC = { state: null, rev: 5 };
  answer = (c) => {
    if (c.path === '/api/state' && c.who === A.id) {
      const late = c.method === 'GET' ? Response.json({ state: withNote('OLD A ANSWER'), rev: 77, me: A })
        : Response.json({ error: 'conflict', state: withNote('OLD A ANSWER'), rev: 78 }, { status: 409 });
      return new Promise((r) => { release = () => r(late); });
    }
    if (c.path === '/api/auth/logout') return ok();
    if (c.path === '/api/auth/email/verify') return Response.json(C);
    if (c.path === '/api/state' && c.method === 'GET') return Response.json({ ...cloudC, me: C });
    if (c.path === '/api/state' && c.method === 'PUT') {
      if (c.body.rev !== cloudC.rev) return Response.json({ error: 'conflict', ...cloudC }, { status: 409 });
      cloudC = { state: c.body.state, rev: cloudC.rev + 1 };
      return Response.json({ rev: cloudC.rev });
    }
    throw new Error(`unexpected ${c.method} ${c.path}`);
  };
  const old = t.sync();
  await t.signOut();
  store.reset();
  await t.emailVerify(C.email, '000000');
  assert.deepEqual([texts(), Object.keys(cloudC.state.notes)], [[], []], 'C starts empty, here and in the account');
  release();
  assert.equal((await old.catch((e) => e)).code, 'gone', 'the old answer is dropped');
  assert.deepEqual(texts(), [], "C's page holds nothing of A");
  assert.ok(stored().me.email === C.email && stored().rev !== 77, "nor A's revision");
  store.update((s) => { s.xp++; });
  await t.sync();
  assert.deepEqual(Object.keys(cloudC.state.notes), [], "and C's account never receives A's notebook");
  answer = ok;
  await t.signOut();
  // signed out, a late answer for A is dropped too: the API's word on it (409 account) neither reloads nor drops a note
  t = await tab(A);
  answer = (c) => (c.path === '/api/state' ? new Promise((r) => { release = () => r(Response.json({ error: 'account' }, { status: 409 })); }) : ok());
  const late = t.sync();
  await t.signOut();
  mem.set('pw.acct', acct(B)); // (signed in again in another tab meanwhile)
  release();
  assert.deepEqual([(await late.catch((e) => e)).code, reloads, stored().me.email], ['gone', 0, B.email]);
  // a link claimed while this page holds A (a QR opened on a signed-in device): A's late answer never reaches B's page
  store.restore(withNote('A private'));
  t = await tab(A);
  answer = (c) => {
    if (c.path === '/api/state' && c.who === A.id) return new Promise((r) => { release = () => r(Response.json({ state: withNote('OLD A ANSWER'), rev: 77, me: A })); });
    if (c.path === '/api/link/claim') return Response.json(B);
    if (c.path === '/api/state' && c.method === 'GET') return Response.json({ state: null, rev: 0, me: B });
    return Response.json({ rev: 1 });
  };
  const held = t.sync();
  await t.claimLink('K7QM2XPA');
  release();
  assert.equal((await held.catch((e) => e)).code, 'gone');
  assert.ok(!texts().includes('OLD A ANSWER') && stored().me.email === B.email && stored().rev !== 77);
  answer = ok;
  await t.signOut();
  // the same for a write: A's conflict answer lands after another tab signed C in, and is neither merged nor retried
  store.restore(withNote('A private'));
  t = await tab(A, { dirty: true });
  answer = (c) => (c.who === A.id ? new Promise((r) => { release = () => r(Response.json({ error: 'conflict', state: withNote('OLD A ANSWER'), rev: 78 }, { status: 409 })); }) : ok());
  const writing = t.boot();
  await new Promise((r) => setTimeout(r, 0));
  mem.set('pw.acct', acct(C));
  on.storage.forEach((f) => f({ key: 'pw.acct' }));
  release();
  await writing;
  assert.deepEqual([calls.map((c) => c.method), texts(), stored().me.email], [['PUT'], ['A private'], C.email]);
}
console.log('one reader per page: all checks passed');
process.exit(0); // pages leave timers behind (the next sync); nothing else is waiting
