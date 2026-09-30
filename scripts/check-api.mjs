// node scripts/check-api.mjs  -> the account API end to end, in process (api/index.ts through Hono's app.request),
// against the database in .env.local. Every reader it makes is fake (pw-test-*@example.invalid, from TEST-NET
// addresses) and everything it made is deleted at the end, pass or fail. No mail is sent (DEV_LOG_CODES) and Google is
// stood in for by a local key (its certificate URL is answered here), so it runs offline from Google and Resend.
// Needs db/003_accounts.sql applied (node scripts/migrate.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..');
// PW_ENV_FILE: the main checkout's .env.local, for a worktree that has none (read here, never copied or printed)
for (const l of fs.readFileSync(process.env.PW_ENV_FILE || path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const RUN = Date.now().toString(36);
const mail = (who) => `pw-test-${who}-${RUN}@example.invalid`;
const ADMIN = mail('admin');
Object.assign(process.env, { DEV_LOG_CODES: '1', ADMIN_EMAILS: ADMIN, GOOGLE_CLIENT_ID: 'pw-test.apps.googleusercontent.com' });
if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET missing in .env.local');

// Google's key set, answered locally
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'pw-test', alg: 'RS256', use: 'sig' };
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => (String(url) === 'https://www.googleapis.com/oauth2/v3/certs'
  ? Promise.resolve(new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } }))
  : realFetch(url, init));
const idToken = (claims, o = {}) => new SignJWT({ email_verified: true, ...claims })
  .setProtectedHeader({ alg: 'RS256', kid: 'pw-test' }).setIssuer(o.iss ?? 'https://accounts.google.com')
  .setAudience(o.aud ?? 'pw-test.apps.googleusercontent.com').setIssuedAt().setExpirationTime(o.exp ?? '5m').sign(privateKey);

// the codes the API prints instead of mailing, and how many went to each address
const codes = new Map(), sent = new Map();
const log = console.log;
console.log = (...a) => { const m = String(a[0]).match(/^\[dev\] sign-in code for (\S+): (\d{6})$/); if (m) { codes.set(m[1], m[2]); sent.set(m[1], (sent.get(m[1]) || 0) + 1); } else log(...a); };

register('./ts-hooks.mjs', import.meta.url);
const { default: app } = await import('../api/index.ts');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, max: 2 });
const sql = (text, v = []) => db.query(text, v).then((r) => r.rows);

// a device: its own address and cookie jar
let ipN = 1;
function device(ip = `203.0.113.${ipN++}`) {
  let jar = '';
  return {
    get cookie() { return jar; },
    set cookie(v) { jar = v; },
    async call(p, { method = 'GET', body, origin = 'https://philosophew.lol', type = 'application/json', headers = {} } = {}) {
      const h = { 'x-forwarded-for': ip, 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', ...headers };
      if (method !== 'GET') { if (origin) h.origin = origin; if (type) h['content-type'] = type; }
      if (jar) h.cookie = `pw_s=${jar}`;
      const r = await app.request(p, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
      const set = r.headers.get('set-cookie');
      if (set) { const v = set.match(/^pw_s=([^;]*)/)?.[1] ?? ''; jar = v; }
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { status: r.status, json, set, cache: r.headers.get('cache-control') };
    },
  };
}

async function signInByCode(d, email) {
  const s = await d.call('/api/auth/email/start', { method: 'POST', body: { email } });
  assert.equal(s.status, 200);
  const code = codes.get(email);
  assert.ok(code, 'a code was made');
  return d.call('/api/auth/email/verify', { method: 'POST', body: { email, code } });
}

let passed = 0;
const step = async (name, fn) => { await fn(); passed++; log(`ok  ${name}`); };

try {
  await step('health, and account answers are private', async () => {
    const d = device();
    assert.equal((await d.call('/api/health')).status, 200);
    const r = await d.call('/api/me');
    assert.equal(r.status, 401);
    assert.equal(r.cache, 'private, no-store');
  });

  await step('state changes need JSON and our own Origin', async () => {
    const d = device();
    assert.equal((await d.call('/api/auth/email/start', { method: 'POST', body: { email: mail('a') }, type: 'text/plain' })).status, 415);
    assert.equal((await d.call('/api/auth/email/start', { method: 'POST', body: { email: mail('a') }, origin: 'https://evil.example' })).status, 403);
    assert.equal((await d.call('/api/auth/email/start', { method: 'POST', body: { email: mail('a') }, origin: '' })).status, 403);
    assert.equal((await d.call('/api/auth/email/start', { method: 'POST', body: { email: 'not an email' } })).status, 400);
    // the Agora's public writes too: another site's simple POST (text/plain, a form) or a foreign page never gets through
    const zero = '00000000-0000-4000-8000-000000000000';
    for (const [p, body] of [['/api/posts', { quote_id: 'testquote', school: 'stoic', body: 'A post from another site' }], ['/api/reports', { quote_id: 'testquote', note: 'from elsewhere' }], [`/api/posts/${zero}/phew`, {}]]) {
      for (const type of ['text/plain', 'application/x-www-form-urlencoded', '']) assert.equal((await d.call(p, { method: 'POST', body, type })).status, 415, `${p} as ${type || 'no type'}`);
      for (const origin of ['https://evil.example', '']) assert.equal((await d.call(p, { method: 'POST', body, origin })).status, 403, `${p} from ${origin || 'no origin'}`);
    }
    assert.equal((await d.call(`/api/posts/${zero}/phew`, { method: 'POST', body: {} })).status, 404, 'our own page gets through');
  });

  await step('every JSON route has a limit: past it 413, and the rest is never read; a post not public has no phews', async () => {
    const d = device();
    const pad = 'x'.repeat(9 * 1024);
    for (const [p, body] of [['/api/auth/email/start', { email: mail('big'), pad }], ['/api/posts', { quote_id: 'testquote', school: 'stoic', body: pad }], ['/api/reports', { quote_id: 'testquote', note: pad }], ['/api/link/claim', { code: pad }]]) {
      assert.equal((await d.call(p, { method: 'POST', body })).status, 413, p);
    }
    // no length up front: read in pieces, and stopped at the limit
    let pulled = 0;
    const stream = new ReadableStream({ pull(ctl) { if (++pulled > 64) return ctl.close(); ctl.enqueue(new TextEncoder().encode(pad)); } });
    const r = await app.request('/api/reports', { method: 'POST', headers: { origin: 'https://philosophew.lol', 'content-type': 'application/json' }, body: stream, duplex: 'half' });
    assert.ok(r.status === 413 && pulled < 8, `413 after ${pulled} of 64 pieces`);
    // a post that is waiting or was turned down: no phew, no count, as if it were not there
    const [{ id }] = await sql(`insert into pw.posts (quote_id, school, body, status, ip_hash) values ($1, 'stoic', 'A test post, never public', 'rejected', 'pw-test') returning id`, [`pwtest-${RUN}`]);
    const p = await d.call(`/api/posts/${id}/phew`, { method: 'POST', body: {} });
    assert.deepEqual([p.status, p.json], [404, { error: 'not_found' }]);
  });

  await step('the same answer for any address; five codes an hour and ten a day per address', async () => {
    const d = device();
    const email = mail('limit');
    const shapes = new Set();
    for (let i = 0; i < 7; i++) shapes.add(JSON.stringify((await d.call('/api/auth/email/start', { method: 'POST', body: { email } })).json));
    assert.deepEqual([...shapes], ['{"ok":true}']);
    const [{ n }] = await sql(`select count(*)::int as n from pw.login_codes where email = $1`, [email]);
    assert.equal(n, 5, 'the 6th and 7th were not made');
    // ten a day: five sent earlier today (moved back two hours) and five this hour, then nothing
    await sql(`update pw.login_codes set created_at = now() - interval '2 hours' where email = $1`, [email]);
    for (let i = 0; i < 7; i++) await d.call('/api/auth/email/start', { method: 'POST', body: { email } });
    assert.equal((await sql(`select count(*)::int as n from pw.login_codes where email = $1`, [email]))[0].n, 10, 'ten in a day');
  });

  await step('a spent allowance answers 429 and stops counting', async () => {
    const d = device();
    const codes = [];
    for (let i = 0; i < 22; i++) codes.push((await d.call('/api/link/claim', { method: 'POST', body: { code: 'K7QM2XPA' } })).status);
    assert.deepEqual([codes[0], codes[19], codes[20], codes[21]], [400, 400, 429, 429]);
    const { createHash } = await import('node:crypto');
    const key = createHash('sha256').update((process.env.IP_SALT || 'dev-salt') + `203.0.113.${ipN - 1}`).digest('hex').slice(0, 32);
    assert.equal((await sql(`select count(*)::int as n from pw.auth_hits where kind = 'claim' and key = $1`, [key]))[0].n, 20);
  });

  let alice = device();
  await step('a wrong code counts; five wrong guesses end every code; codes are stored hashed', async () => {
    const email = mail('alice');
    await alice.call('/api/auth/email/start', { method: 'POST', body: { email } });
    const code = codes.get(email);
    const [row] = await sql(`select code_hash from pw.login_codes where email = $1`, [email]);
    assert.ok(!row.code_hash.includes(code) && /^[0-9a-f]{64}$/.test(row.code_hash), 'an HMAC, not the code');
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 4; i++) assert.equal((await alice.call('/api/auth/email/verify', { method: 'POST', body: { email, code: wrong } })).json.error, 'wrong_code');
    assert.equal((await alice.call('/api/auth/email/verify', { method: 'POST', body: { email, code: wrong } })).json.error, 'expired', 'the fifth wrong guess ends it');
    assert.equal((await alice.call('/api/auth/email/verify', { method: 'POST', body: { email, code } })).json.error, 'expired', 'even the right code is dead now');
  });

  await step('the right code signs in: an HttpOnly, Secure, Lax cookie on /api for 180 days, no Domain', async () => {
    const email = mail('alice');
    codes.delete(email);
    const r = await signInByCode(alice, email);
    assert.equal(r.status, 200);
    assert.equal(r.json.email, email);
    assert.equal(r.json.admin, false);
    assert.match(r.set, /^pw_s=[A-Za-z0-9_-]{43}; Path=\/api; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax$/);
    const [s] = await sql(`select s.token_hash, s.method, s.label from pw.sessions s join pw.users u on u.id = s.user_id where u.email = $1`, [email]);
    assert.equal(s.method, 'email');
    assert.equal(s.label, 'Safari on iPhone');
    assert.ok(!s.token_hash.includes(alice.cookie), 'only a hash of the token is kept');
    const [left] = await sql(`select count(*)::int as n, count(*) filter (where code_hash = '')::int as spent,
      count(*) filter (where attempts < 5 and expires_at > now())::int as usable from pw.login_codes where email = $1`, [email]);
    assert.ok(left.n >= 2 && left.spent >= 1 && left.usable === 0, 'used codes are spent (hash gone), and stay counted for the send limits');
    const again = await alice.call('/api/auth/email/verify', { method: 'POST', body: { email, code: codes.get(email) } });
    assert.equal(again.json.error, 'expired', 'a code works once');
    const m = await alice.call('/api/me');
    assert.equal(m.status, 200);
    assert.equal(m.json.email, email);
  });

  await step('a code that signed in still counts; one code checked four times at once signs in once; bursts never pass a limit', async () => {
    const d = device();
    const email = mail('nora');
    for (let i = 0; i < 5; i++) await d.call('/api/auth/email/start', { method: 'POST', body: { email } });
    assert.equal((await d.call('/api/auth/email/verify', { method: 'POST', body: { email, code: codes.get(email) } })).status, 200);
    await d.call('/api/auth/email/start', { method: 'POST', body: { email } });
    assert.equal(sent.get(email), 5, 'the sign-in did not reset the hour: no sixth code');
    // the same right code, four checks at the same moment: one session, the rest find it spent
    const once = mail('otto');
    await device().call('/api/auth/email/start', { method: 'POST', body: { email: once } });
    const tries = await Promise.all(Array.from({ length: 4 }, () => device().call('/api/auth/email/verify', { method: 'POST', body: { email: once, code: codes.get(once) } })));
    assert.deepEqual(tries.map((r) => r.status).sort(), [200, 400, 400, 400]);
    assert.equal(tries.filter((r) => r.set?.startsWith('pw_s=') && !r.set.startsWith('pw_s=;')).length, 1, 'one cookie');
    // eight codes asked for at once: never more than five made or sent
    const burst = mail('bea');
    await Promise.all(Array.from({ length: 8 }, () => device().call('/api/auth/email/start', { method: 'POST', body: { email: burst } })));
    const [{ n }] = await sql(`select count(*)::int as n from pw.login_codes where email = $1`, [burst]);
    assert.ok(n <= 5 && (sent.get(burst) || 0) <= 5, `made ${n}, sent ${sent.get(burst)}`);
    // twenty-five claims at once from one address against an allowance of twenty: never more than twenty get through
    const one = device();
    const claims = await Promise.all(Array.from({ length: 25 }, () => one.call('/api/link/claim', { method: 'POST', body: { code: 'K7QM2XPA' } })));
    assert.ok(claims.filter((r) => r.status === 429).length >= 5, 'at least five refused');
  });

  await step('an expired code is refused', async () => {
    const d = device();
    const email = mail('late');
    await d.call('/api/auth/email/start', { method: 'POST', body: { email } });
    await sql(`update pw.login_codes set expires_at = now() - interval '1 second' where email = $1`, [email]);
    assert.equal((await d.call('/api/auth/email/verify', { method: 'POST', body: { email, code: codes.get(email) } })).json.error, 'expired');
  });

  await step('progress: optimistic revisions, 409 with the copy to merge, 512 KB, objects only', async () => {
    let r = await alice.call('/api/state');
    assert.deepEqual([r.json.state, r.json.rev, r.json.me.email], [null, 0, mail('alice')], 'no copy yet; the reader comes along');
    assert.match(r.json.me.id, /^[0-9a-f-]{36}$/);
    const st = { v: 1, xp: 10, notes: {} };
    assert.equal((await alice.call('/api/state', { method: 'PUT', body: { state: st, rev: 0 } })).json.rev, 1);
    r = await alice.call('/api/state', { method: 'PUT', body: { state: { ...st, xp: 99 }, rev: 0 } });
    assert.equal(r.status, 409);
    assert.deepEqual([r.json.rev, r.json.state.xp], [1, 10], 'the server copy comes back');
    assert.equal((await alice.call('/api/state', { method: 'PUT', body: { state: { ...st, xp: 20 }, rev: 1 } })).json.rev, 2);
    assert.equal((await alice.call('/api/state', { method: 'PUT', body: { state: [1], rev: 2 } })).status, 400);
    assert.equal((await alice.call('/api/state', { method: 'PUT', body: { state: { v: 2 }, rev: 2 } })).status, 400);
    assert.equal((await alice.call('/api/state', { method: 'PUT', body: { state: { v: 1, big: 'x'.repeat(530 * 1024) }, rev: 2 } })).status, 413);
    assert.equal((await alice.call('/api/state', { method: 'PUT', body: { state: st, rev: 2 }, origin: 'https://evil.example' })).status, 403);
    r = await alice.call('/api/state');
    assert.deepEqual([r.json.rev, r.json.state.xp], [2, 20]);
    assert.equal((await device().call('/api/state')).status, 401, 'no cookie, no progress');
  });

  await step('a page that names another reader is refused (409 account): nothing read, nothing written', async () => {
    const mine = (await alice.call('/api/state')).json;
    const as = (who) => ({ headers: { 'x-pw-account': who } });
    const other = await alice.call('/api/state', as('00000000-0000-4000-8000-000000000000'));
    assert.deepEqual([other.status, other.json, other.cache], [409, { error: 'account' }, 'private, no-store']);
    const put = await alice.call('/api/state', { method: 'PUT', body: { state: { v: 1, xp: 1 }, rev: mine.rev }, ...as(encodeURIComponent(mail('bob'))) });
    assert.deepEqual([put.status, put.json], [409, { error: 'account' }]);
    for (const [p, method] of [['/api/auth/logout-all', 'POST'], ['/api/account', 'DELETE'], ['/api/link', 'POST'], ['/api/account/export', 'GET']]) {
      assert.equal((await alice.call(p, { method, body: method === 'GET' ? undefined : {}, ...as('someone-else') })).status, 409, p);
    }
    assert.equal((await alice.call('/api/state', as(mine.me.id))).status, 200, 'its own id');
    assert.equal((await alice.call('/api/state', as(encodeURIComponent(mail('alice'))))).status, 200, 'or its address, from a note older than ids');
    const after = (await alice.call('/api/state')).json;
    assert.deepEqual([after.rev, after.state.xp], [mine.rev, mine.state.xp], 'the refused write changed nothing');
    assert.equal((await sql(`select count(*)::int as n from pw.sessions s join pw.users u on u.id = s.user_id where u.email = $1`, [mail('alice')]))[0].n, 1, 'and nobody was signed out');
  });

  let phone = device();
  await step('a second device by QR code and by the typed code: single use, five minutes, polled status', async () => {
    const l = await alice.call('/api/link', { method: 'POST', body: {} });
    assert.equal(l.status, 200);
    assert.match(l.json.code, /^[A-Za-z0-9_-]{22}$/);
    assert.match(l.json.short, /^[0-9A-HJKMNP-TV-Z]{8}$/);
    assert.equal((await alice.call('/api/link/status')).json.status, 'waiting');
    const typed = `${l.json.short.slice(0, 4).toLowerCase()}-${l.json.short.slice(4)}`; // any case, a dash
    const c = await phone.call('/api/link/claim', { method: 'POST', body: { code: typed } });
    assert.equal(c.status, 200);
    assert.equal(c.json.email, mail('alice'));
    assert.equal((await alice.call('/api/link/status')).json.status, 'claimed');
    assert.equal((await device().call('/api/link/claim', { method: 'POST', body: { code: l.json.code } })).json.error, 'expired', 'one use for both codes');
    const l2 = await alice.call('/api/link', { method: 'POST', body: {} });
    await sql(`update pw.link_codes set expires_at = now() - interval '1 second' where user_id = (select id from pw.users where email = $1) and used_at is null`, [mail('alice')]);
    assert.equal((await device().call('/api/link/claim', { method: 'POST', body: { code: l2.json.code } })).json.error, 'expired');
    assert.equal((await alice.call('/api/link/status')).json.status, 'expired');
    const l3 = await alice.call('/api/link', { method: 'POST', body: {} });
    const laptop = device();
    assert.equal((await laptop.call('/api/link/claim', { method: 'POST', body: { code: l3.json.code } })).status, 200, 'the QR code');
    assert.equal((await laptop.call('/api/state')).json.rev, 2, 'the same progress on the new device');
    assert.equal((await device().call('/api/link/claim', { method: 'POST', body: { code: 'nope' } })).status, 400);
    const [s] = await sql(`select method from pw.sessions where token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')`, [phone.cookie]);
    assert.equal(s.method, 'link');
  });

  await step('a device link dies with the session that showed it: signed out, out everywhere, or signed in afresh', async () => {
    const email = mail('lena');
    const link = async (d) => (await d.call('/api/link', { method: 'POST', body: {} })).json;
    const claim = (code, d = device()) => d.call('/api/link/claim', { method: 'POST', body: { code } }).then((r) => [r.status, r.json.error ?? r.json.email]);
    const d = device(), e = device(), f = device(), g = device();
    await signInByCode(d, email);
    assert.deepEqual(await claim((await link(d)).code, e), [200, email]);
    const byE = await link(e), byD = await link(d);
    await e.call('/api/auth/logout', { method: 'POST', body: {} });
    assert.deepEqual(await claim(byE.code), [400, 'expired'], 'a link shown by a device that signed out');
    assert.deepEqual(await claim(byE.short), [400, 'expired'], 'and its typed code');
    assert.deepEqual(await claim(byD.code, f), [200, email], "another device's link still works");
    const byF = await link(f), byD2 = await link(d);
    await d.call('/api/auth/logout-all', { method: 'POST', body: {} });
    assert.deepEqual([await claim(byF.code), await claim(byD2.short)], [[400, 'expired'], [400, 'expired']], 'signed out everywhere: every link');
    const [{ n }] = await sql(`select count(*)::int as n from pw.link_codes l join pw.users u on u.id = l.user_id where u.email = $1 and l.used_at is null`, [email]);
    assert.equal(n, 0, 'none left to claim');
    await signInByCode(g, email);
    const byG = await link(g);
    await g.call('/api/auth/google', { method: 'POST', body: { credential: await idToken({ sub: `lena-${RUN}`, email }) } });
    assert.deepEqual(await claim(byG.code), [400, 'expired'], 'the showing device signed in afresh: its old session and links end');
  });

  await step('export: the account, the progress and the devices, never a token or its hash', async () => {
    const r = await alice.call('/api/account/export');
    assert.equal(r.status, 200);
    assert.equal(r.json.user.email, mail('alice'));
    assert.equal(r.json.progress.rev, 2);
    assert.ok(r.json.sessions.length >= 3);
    assert.equal(r.json.sessions.filter((s) => s.this_device).length, 1);
    assert.ok(!JSON.stringify(r.json).includes('token_hash') && !JSON.stringify(r.json).includes(alice.cookie));
  });

  await step('a session in use is renewed at most once a day, cookie too', async () => {
    const hash = (await sql(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h`, [alice.cookie]))[0].h;
    let r = await alice.call('/api/me');
    assert.equal(r.set, null, 'fresh: nothing to renew');
    await sql(`update pw.sessions set last_seen_at = now() - interval '2 days', expires_at = now() + interval '3 days' where token_hash = $1`, [hash]);
    r = await alice.call('/api/me');
    assert.match(r.set || '', /Max-Age=15552000/);
    const [s] = await sql(`select expires_at > now() + interval '179 days' as moved from pw.sessions where token_hash = $1`, [hash]);
    assert.ok(s.moved);
  });

  await step('sign out here, then everywhere', async () => {
    const token = phone.cookie;
    const r = await phone.call('/api/auth/logout', { method: 'POST', body: {} });
    assert.equal(r.status, 200);
    assert.match(r.set, /^pw_s=; Path=\/api; Max-Age=0/);
    phone.cookie = token; // a copy of the old cookie opens nothing now
    assert.equal((await phone.call('/api/me')).status, 401);
    const before = (await sql(`select count(*)::int as n from pw.sessions s join pw.users u on u.id = s.user_id where u.email = $1`, [mail('alice')]))[0].n;
    assert.ok(before >= 2);
    assert.equal((await alice.call('/api/auth/logout-all', { method: 'POST', body: {} })).status, 200);
    assert.equal((await sql(`select count(*)::int as n from pw.sessions s join pw.users u on u.id = s.user_id where u.email = $1`, [mail('alice')]))[0].n, 0);
  });

  await step('Google: a checked ID token signs in and links by sub; any wrong claim is refused', async () => {
    const g = device();
    const email = mail('gina');
    const ok = await g.call('/api/auth/google', { method: 'POST', body: { credential: await idToken({ sub: `sub-${RUN}`, email }) } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.email, email);
    const [u] = await sql(`select google_sub from pw.users where email = $1`, [email]);
    assert.equal(u.google_sub, `sub-${RUN}`);
    // the same Google account with another address still reaches the same reader
    const moved = await device().call('/api/auth/google', { method: 'POST', body: { credential: await idToken({ sub: `sub-${RUN}`, email: mail('gina2') }) } });
    assert.equal(moved.json.email, email);
    // an address that signed in by code gets its Google account linked
    const b = device();
    await signInByCode(b, mail('bob'));
    const linked = await device().call('/api/auth/google', { method: 'POST', body: { credential: await idToken({ sub: `bob-${RUN}`, email: mail('bob') }) } });
    assert.equal(linked.json.email, mail('bob'));
    assert.equal((await sql(`select google_sub from pw.users where email = $1`, [mail('bob')]))[0].google_sub, `bob-${RUN}`);
    // an address already linked to another Google account: never entered, never moved over, and the reader is told
    const sessions = async (who) => (await sql(`select count(*)::int as n from pw.sessions s join pw.users u on u.id = s.user_id where u.email = $1`, [who]))[0].n;
    for (const [who, sub] of [[email, `sub-${RUN}`], [mail('bob'), `bob-${RUN}`]]) {
      const before = await sessions(who), stranger = device();
      const r = await stranger.call('/api/auth/google', { method: 'POST', body: { credential: await idToken({ sub: `other-${RUN}`, email: who }) } });
      assert.deepEqual([r.status, r.json, r.set], [409, { error: 'google_other' }, null]);
      assert.equal((await sql(`select google_sub from pw.users where email = $1`, [who]))[0].google_sub, sub, 'the link stays');
      assert.deepEqual([await sessions(who), (await stranger.call('/api/me')).status], [before, 401], 'no session made');
    }
    const refuse = async (credential, why) => assert.equal((await device().call('/api/auth/google', { method: 'POST', body: { credential } })).status, 401, why);
    await refuse(await idToken({ sub: 'x', email }, { aud: 'someone-else.apps.googleusercontent.com' }), 'another audience');
    await refuse(await idToken({ sub: 'x', email }, { iss: 'https://evil.example' }), 'another issuer');
    await refuse(await idToken({ sub: 'x', email, email_verified: false }), 'an unverified address');
    await refuse(await idToken({ sub: 'x', email }, { exp: Math.floor(Date.now() / 1000) - 120 }), 'expired');
    const other = await generateKeyPair('RS256');
    await refuse(await new SignJWT({ sub: 'x', email, email_verified: true }).setProtectedHeader({ alg: 'RS256', kid: 'pw-test' }).setIssuer('https://accounts.google.com').setAudience('pw-test.apps.googleusercontent.com').setExpirationTime('5m').sign(other.privateKey), 'signed by another key');
    await refuse(await new SignJWT({ sub: 'x', email, email_verified: true }).setProtectedHeader({ alg: 'HS256', kid: 'pw-test' }).setIssuer('https://accounts.google.com').setAudience('pw-test.apps.googleusercontent.com').setExpirationTime('5m').sign(new TextEncoder().encode('x'.repeat(32))), 'HS256');
    const none = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    await refuse(`${none({ alg: 'none' })}.${none({ sub: 'x', email, email_verified: true, iss: 'https://accounts.google.com', aud: 'pw-test.apps.googleusercontent.com', exp: 9e9 })}.`, 'alg none');
    await refuse('not a token', 'garbage');
  });

  await step('moderators: on the list, signed in by email code, within 12 hours', async () => {
    const a = device();
    assert.equal((await signInByCode(a, ADMIN)).json.admin, true);
    assert.equal((await a.call('/api/admin/me')).status, 200);
    assert.equal((await a.call('/api/admin/posts?status=pending')).status, 200);
    const hash = (await sql(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h`, [a.cookie]))[0].h;
    await sql(`update pw.sessions set created_at = now() - interval '13 hours' where token_hash = $1`, [hash]);
    assert.equal((await a.call('/api/admin/me')).json.error, 'reauth', 'an old session asks again');
    const viaGoogle = device();
    await viaGoogle.call('/api/auth/google', { method: 'POST', body: { credential: await idToken({ sub: `adm-${RUN}`, email: ADMIN }) } });
    assert.equal((await viaGoogle.call('/api/admin/me')).json.error, 'reauth', 'Google never opens moderation');
    const fresh = device();
    await signInByCode(fresh, ADMIN);
    const l = await fresh.call('/api/link', { method: 'POST', body: {} });
    const linked = device();
    await linked.call('/api/link/claim', { method: 'POST', body: { code: l.json.code } });
    assert.equal((await linked.call('/api/admin/me')).json.error, 'reauth', 'nor does a linked device');
    const notAdmin = device();
    await signInByCode(notAdmin, mail('carol'));
    assert.equal((await notAdmin.call('/api/admin/me')).status, 403);
    assert.equal((await device().call('/api/admin/me')).status, 401);
    assert.equal((await fresh.call('/api/admin/posts/00000000-0000-0000-0000-000000000000', { method: 'PATCH', body: { status: 'approved' } })).status, 404, 'a decision needs a real post');
    assert.equal((await fresh.call('/api/admin/posts/00000000-0000-0000-0000-000000000000', { method: 'PATCH', body: { status: 'approved' }, origin: 'https://evil.example' })).status, 403);
  });

  await step('delete the account: sessions, progress and links go with it, cookie cleared', async () => {
    const d = device();
    const email = mail('dora');
    await signInByCode(d, email);
    await d.call('/api/state', { method: 'PUT', body: { state: { v: 1 }, rev: 0 } });
    await d.call('/api/link', { method: 'POST', body: {} });
    const [{ id }] = await sql(`select id from pw.users where email = $1`, [email]);
    const r = await d.call('/api/account', { method: 'DELETE', body: {} });
    assert.equal(r.status, 200);
    assert.match(r.set, /Max-Age=0/);
    for (const t of ['sessions', 'user_state', 'link_codes']) assert.equal((await sql(`select count(*)::int as n from pw.${t} where user_id = $1`, [id]))[0].n, 0, t);
    assert.equal((await sql(`select count(*)::int as n from pw.users where id = $1`, [id]))[0].n, 0);
    const [ledger] = await sql(`select count(*)::int as n, count(*) filter (where code_hash = '')::int as spent from pw.login_codes where email = $1`, [email]);
    assert.ok(ledger.n === 1 && ledger.spent === 1, 'the code sent stays counted for the day, spent');
  });

  log(`\nall ${passed} API checks passed`);
} catch (e) {
  log(`\nFAIL after ${passed} checks:`, e);
  process.exitCode = 1;
} finally {
  // everything this run made, gone: the readers (their sessions, progress and links go with them), their codes, the
  // attempts counted from the test addresses and against the test readers
  const test = 'pw-test-%@example.invalid';
  const ids = (await sql(`select id::text as id from pw.users where email like $1`, [test])).map((r) => r.id);
  const { createHash } = await import('node:crypto');
  const salt = process.env.IP_SALT || 'dev-salt';
  const ips = Array.from({ length: ipN }, (_, i) => createHash('sha256').update(salt + `203.0.113.${i}`).digest('hex').slice(0, 32));
  await sql(`delete from pw.auth_hits where key = any($1) or key = any($2)`, [ips, ids]);
  await sql(`delete from pw.users where email like $1`, [test]);
  await sql(`delete from pw.login_codes where email like $1`, [test]);
  await sql(`delete from pw.posts where quote_id = $1`, [`pwtest-${RUN}`]);
  const [{ n }] = await sql(`select (select count(*) from pw.users where email like $1) + (select count(*) from pw.login_codes where email like $1)
    + (select count(*) from pw.auth_hits where key = any($2) or key = any($3)) + (select count(*) from pw.posts where quote_id = $4) as n`, [test, ips, ids, `pwtest-${RUN}`]);
  log(`cleaned up: ${n} test rows left`);
  await db.end();
}
process.exit(process.exitCode || 0);
