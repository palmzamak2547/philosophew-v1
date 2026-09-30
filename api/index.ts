// Philosophew API on Neon Functions: the Agora (posts, phews, reports), optional accounts, and moderation.
// Public reads are cached at Vercel's edge; writes are validated and rate-limited by a salted IP hash; every post
// waits for a moderator. Accounts are our own: a code sent by email or a Google ID token opens a session held in an
// HttpOnly cookie (only its sha256 is stored); the reader's progress is one JSON document with a revision number.
// Moderators are accounts on ADMIN_EMAILS that signed in with an emailed code less than 12 hours ago.
import { Hono, type Context, type Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { Pool } from 'pg';
import { attachDatabasePool, waitUntil } from '@neon/functions';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomUUID } from 'node:crypto';
import {
  COOKIE, SESSION_DAYS, CODE_MINUTES, CODE_ATTEMPTS, LINK_MINUTES, sha256, hmac, sameHash, newToken, newCode, newLinkCode,
  newShortCode, normShort, isLinkCode, normEmail, cookie, clearCookie, deviceLabel,
} from './auth';
import { codeEmail, type Gift } from './email';
import { signed, forward } from './inbound';

// Small pool that lets go quickly, so Postgres can scale to zero between visitors.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 4000, allowExitOnIdle: true });
attachDatabasePool(pool);

const ADMINS = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const SALT = process.env.IP_SALT || 'dev-salt';
const SECRET = process.env.SESSION_SECRET || ''; // no secret, no accounts (the routes answer 503): never a guessable key
const RESEND = process.env.RESEND_API_KEY || '';
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || '';
const HOOK = process.env.RESEND_WEBHOOK_SECRET || '', FORWARD_TO = process.env.FORWARD_TO || ''; // mail to hello@ (api/inbound.ts)
const DEV_CODES = process.env.DEV_LOG_CODES === '1'; // local development only: print codes instead of sending mail
const SITE = 'https://philosophew.lol';
const google = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const SCHOOLS = new Set(['stoic', 'existential', 'eastern', 'absurd', 'socratic']);
const ORIGINS = new Set([
  'https://philosophew.lol', 'https://www.philosophew.lol', 'https://philosophew.vercel.app',
  'http://localhost:5178', 'http://127.0.0.1:5178', 'http://localhost:4199', 'http://127.0.0.1:4199',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QID = /^[A-Za-z0-9_-]{4,40}$/;
const BODY_MAX = 8 * 1024; // a post, a report, an address and code, a Google credential: a few KB at most
const STATE_MAX = 512 * 1024; // a reader's whole progress
const ADMIN_HOURS = 12;
// codes sent: per address an hour and a day (5 wrong guesses per code: at most 50 guesses a day at one address), per
// visitor an hour, and in all an hour (our sender's allowance, kept for real readers)
const CODES = { hour: 5, day: 10, ip: 20, all: 150 };

interface User { id: string; email: string; created_at: string; unlimited: boolean }
interface Session { hash: string; method: 'email' | 'google' | 'link'; created_at: string }
type Env = { Variables: { email: string; user: User; session: Session; body: Record<string, unknown> | null } };
const api = new Hono<Env>();

const ipHash = (c: Context) => {
  const ip = (c.req.header('x-forwarded-for') || '').split(',')[0].trim() || c.req.header('x-real-ip') || 'unknown';
  return createHash('sha256').update(SALT + ip).digest('hex').slice(0, 32);
};
// strip control characters and collapse runs of blank lines; keep Thai and emoji intact
const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const q = <T = Record<string, unknown>>(text: string, values: unknown[] = []) => pool.query(text, values).then((r) => r.rows as T[]);
const fail = (c: Context, status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 503, error: string) => c.json({ error }, status);
/** Work after the answer (mail, housekeeping): kept alive by the runtime, never an unhandled rejection. */
const later = (p: Promise<unknown>) => waitUntil(p.catch((e) => console.error(e)));

/** At most max bytes of the request's body, and not a byte more read: null when it is longer. */
async function upTo(c: Context, max: number) {
  if (Number(c.req.header('content-length') || 0) > max) return null;
  const reader = c.req.raw.body?.getReader(), parts: Uint8Array[] = [];
  for (let n = 0; reader;) {
    const { done, value } = await reader.read();
    if (done) break;
    if ((n += value.byteLength) > max) { void reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/**
 * A change of state comes from our own pages only: a JSON body of at most `max` bytes (413 past it, never read further)
 * and an Origin we know. A form or a simple request from another site is neither, so it never gets this far. The body
 * is read here, once, for the route (body(c)).
 */
const sized = (max: number) => async (c: Context<Env>, next: Next) => {
  const type = (c.req.header('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return fail(c, 415, 'invalid');
  if (!ORIGINS.has(c.req.header('origin') || '')) return fail(c, 403, 'forbidden');
  const raw = await upTo(c, max);
  if (!raw) return fail(c, 413, 'too_big');
  let b: unknown = null;
  try { b = JSON.parse(raw.toString('utf8')); } catch { /* not JSON: the route answers 400 */ }
  c.set('body', b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null);
  await next();
};
const guard = sized(BODY_MAX);
/** The JSON object the guard read (null: none, or not an object). */
const body = async (c: Context<Env>) => c.get('body');

// ---------- public ----------
api.get('/health', (c) => c.json({ ok: true }));

api.get('/posts', async (c) => {
  const school = c.req.query('school');
  const before = c.req.query('before');
  const s = school && SCHOOLS.has(school) ? school : null;
  const b = before && !Number.isNaN(Date.parse(before)) ? before : null;
  const rows = await q(
    `select id, quote_id, school, body, name, phew, created_at from pw.posts
     where status = 'approved' and ($1::text is null or school = $1) and ($2::timestamptz is null or created_at < $2)
     order by created_at desc limit 25`, [s, b]);
  c.header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=600');
  c.header('CDN-Cache-Control', 'max-age=60, stale-while-revalidate=600');
  return c.json({ posts: rows.slice(0, 24), more: rows.length > 24 });
});

api.post('/posts', guard, async (c) => {
  const b = await body(c);
  if (!b) return fail(c, 400, 'invalid');
  if (typeof b.hp === 'string' && b.hp.length > 0) return c.json({ id: randomUUID(), status: 'pending' }, 201); // bots fill the hidden field
  const quote = String(b.quote_id || ''), school = String(b.school || '');
  const text = clean(b.body, 500);
  const name = b.name == null ? null : clean(b.name, 32).replace(/\s+/g, ' ') || null;
  if (!QID.test(quote) || !SCHOOLS.has(school) || text.length < 10) return fail(c, 400, 'invalid');
  const ip = ipHash(c);
  const [{ mine }] = await q<{ mine: number }>(`select count(*)::int as mine from pw.posts where ip_hash = $1 and created_at > now() - interval '1 hour'`, [ip]);
  if (mine >= 5) return fail(c, 429, 'rate_limited');
  const [{ all }] = await q<{ all: number }>(`select count(*)::int as all from pw.posts where status = 'pending' and created_at > now() - interval '1 hour'`);
  if (all >= 300) return fail(c, 503, 'busy');
  const [row] = await q<{ id: string }>(`insert into pw.posts (quote_id, school, body, name, ip_hash) values ($1, $2, $3, $4, $5) returning id`, [quote, school, text, name, ip]);
  return c.json({ id: row.id, status: 'pending' }, 201);
});

api.post('/posts/:id/phew', guard, async (c) => {
  const id = c.req.param('id') || '';
  if (!UUID.test(id)) return fail(c, 400, 'invalid');
  const ip = ipHash(c);
  const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from pw.phews where ip_hash = $1 and created_at > now() - interval '1 hour'`, [ip]);
  if (n >= 60) return fail(c, 429, 'rate_limited');
  const added = await q(`insert into pw.phews (post_id, ip_hash) select id, $2 from pw.posts where id = $1 and status = 'approved' on conflict do nothing returning 1`, [id, ip]);
  const [row] = added.length
    ? await q<{ phew: number }>(`update pw.posts set phew = phew + 1 where id = $1 returning phew`, [id])
    : await q<{ phew: number }>(`select phew from pw.posts where id = $1 and status = 'approved'`, [id]); // a post not public is not there
  if (!row) return fail(c, 404, 'not_found');
  return c.json({ phew: row.phew });
});

api.post('/reports', guard, async (c) => {
  const b = await body(c);
  const quote = String(b?.quote_id || ''), note = clean(b?.note, 500);
  if (!QID.test(quote) || note.length < 3) return fail(c, 400, 'invalid');
  const ip = ipHash(c);
  const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from pw.reports where ip_hash = $1 and created_at > now() - interval '1 hour'`, [ip]);
  if (n >= 10) return fail(c, 429, 'rate_limited');
  await q(`insert into pw.reports (quote_id, note, ip_hash) values ($1, $2, $3)`, [quote, note, ip]);
  return c.json({ ok: true }, 201);
});

// ---------- accounts: guards ----------
/** Every account answer is private to its reader: no shared cache may keep it. */
async function account(c: Context, next: Next) {
  c.header('Cache-Control', 'private, no-store');
  if (!SECRET) return fail(c, 503, 'accounts_off');
  await next();
}

/** The reader behind the cookie, or 401. A session in use is kept alive: its expiry moves on at most once a day. */
async function session(c: Context<Env>, next: Next) {
  const token = getCookie(c, COOKIE) || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return fail(c, 401, 'unauthorized');
  const hash = sha256(token);
  const [s] = await q<{ method: Session['method']; created_at: string; stale: boolean; id: string; email: string; user_created: string; unlimited: boolean }>(
    `select s.method, s.created_at, s.last_seen_at < now() - interval '1 day' as stale, u.id, u.email, u.created_at as user_created, u.unlimited
     from pw.sessions s join pw.users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`, [hash]);
  if (!s) {
    c.header('Set-Cookie', clearCookie());
    return fail(c, 401, 'unauthorized');
  }
  // the page names the reader it speaks for (src/core/account.ts): the browser's cookie, shared by every tab, may be
  // another reader's by now, and nothing is read or written for them on this page's behalf
  const want = c.req.header('x-pw-account');
  if (want && want !== s.id && want !== encodeURIComponent(s.email)) return fail(c, 409, 'account');
  if (s.stale) {
    await q(`update pw.sessions set last_seen_at = now(), expires_at = now() + make_interval(days => $2) where token_hash = $1`, [hash, SESSION_DAYS]);
    await q(`update pw.users set last_seen_at = now() where id = $1`, [s.id]);
    c.header('Set-Cookie', cookie(token)); // the browser's copy lives as long as ours
  }
  c.set('user', { id: s.id, email: s.email, created_at: s.user_created, unlimited: s.unlimited });
  c.set('session', { hash, method: s.method, created_at: s.created_at });
  await next();
}

/**
 * An attempt counted against an hourly allowance; true when the allowance is spent (and then nothing more is written).
 * Written, it is counted again: attempts at the same moment all saw room in the first count, the second one sees them
 * all, so never more than the allowance passes.
 */
async function limited(kind: string, key: string, max: number) {
  const [{ n }] = await q<{ n: number }>(
    `with seen as (select count(*)::int as n from pw.auth_hits where kind = $1 and key = $2 and at > now() - interval '1 hour'),
     hit as (insert into pw.auth_hits (kind, key) select $1, $2 from seen where seen.n < $3)
     select n from seen`, [kind, key, max]);
  if (n >= max) return true;
  const [{ m }] = await q<{ m: number }>(`select count(*)::int as m from pw.auth_hits where kind = $1 and key = $2 and at > now() - interval '1 hour'`, [kind, key]);
  return m > max;
}

/** Old codes, spent attempts and expired sessions go; run after a sign-in code or a link is made (rare, and indexed). */
const sweep = () => pool.query(`
  delete from pw.login_codes where created_at < now() - interval '1 day';
  delete from pw.link_codes where created_at < now() - interval '1 day';
  delete from pw.auth_hits where at < now() - interval '1 day';
  delete from pw.sessions where expires_at < now();`);

const me = (u: User) => ({ id: u.id, email: u.email, admin: ADMINS.includes(u.email), created: u.created_at, unlimited: u.unlimited });

/** A session ends, and the device links it showed with it: a copied link never outlives the session that made it. */
const endSession = (hash: string) => q(`with s as (delete from pw.sessions where token_hash = $1) delete from pw.link_codes where session_hash = $1`, [hash]);

/** A new session for this device. A session this device already held (another account, or an old one) ends first. */
async function signIn(c: Context, u: User, method: Session['method']) {
  const old = getCookie(c, COOKIE);
  if (old) await endSession(sha256(old));
  const token = newToken();
  await q(`insert into pw.sessions (token_hash, user_id, method, label, expires_at) values ($1, $2, $3, $4, now() + make_interval(days => $5))`,
    [sha256(token), u.id, method, deviceLabel(c.req.header('user-agent') || ''), SESSION_DAYS]);
  await q(`update pw.users set last_seen_at = now() where id = $1`, [u.id]);
  c.header('Set-Cookie', cookie(token));
  return c.json(me(u));
}

const userByEmail = async (email: string) => (await q<User>(
  `insert into pw.users (email) values ($1) on conflict (email) do update set last_seen_at = now() returning id, email, created_at, unlimited`, [email]))[0];

// ---------- accounts: an emailed code ----------
api.use('/auth/*', account);
api.use('/me', account);
api.use('/state', account);
api.use('/account/*', account);
api.use('/account', account);
api.use('/link', account);
api.use('/link/*', account);
api.use('/admin/*', account);

api.post('/auth/email/start', guard, async (c) => {
  const b = await body(c);
  const email = normEmail(b?.email);
  if (!email) return fail(c, 400, 'invalid');
  const ok = c.json({ ok: true }); // the same answer whether or not the address has an account, or was sent one
  const ip = ipHash(c);
  // the code is written first and the limits counted after, with it: requests at the same moment can not all see room,
  // and one past a limit goes again, unsent. A code sent stays counted for the day, used or not (verify only spends it)
  const code = newCode();
  const [{ id }] = await q<{ id: string }>(`insert into pw.login_codes (email, code_hash, expires_at, ip_hash) values ($1, $2, now() + make_interval(mins => $3), $4) returning id`,
    [email, hmac(SECRET, 'login', email, code), CODE_MINUTES, ip]);
  const [n] = await q<{ hour: number; day: number; here: number; all: number }>(
    `select count(*) filter (where email = $1 and created_at > now() - interval '1 hour')::int as hour,
            count(*) filter (where email = $1)::int as day,
            count(*) filter (where ip_hash = $2 and created_at > now() - interval '1 hour')::int as here,
            count(*) filter (where created_at > now() - interval '1 hour')::int as all
     from pw.login_codes where created_at > now() - interval '1 day'`, [email, ip]);
  if (n.hour > CODES.hour || n.day > CODES.day || n.here > CODES.ip || n.all > CODES.all) {
    await q(`delete from pw.login_codes where id = $1`, [id]);
    return ok;
  }
  if (DEV_CODES) console.log(`[dev] sign-in code for ${email}: ${code}`);
  else later(sendCode(email, code));
  later(sweep());
  return ok;
});

api.post('/auth/email/verify', guard, async (c) => {
  const b = await body(c);
  const email = normEmail(b?.email);
  const code = String(b?.code ?? '').replace(/\s/g, '');
  if (!email || !/^\d{6}$/.test(code)) return fail(c, 400, 'invalid');
  if (await limited('verify', ipHash(c), 60)) return fail(c, 429, 'rate_limited');
  const live = await q<{ id: string; code_hash: string }>(
    `select id, code_hash from pw.login_codes where email = $1 and expires_at > now() and attempts < $2 order by created_at desc limit 5`, [email, CODE_ATTEMPTS]);
  if (!live.length) return fail(c, 400, 'expired');
  const want = hmac(SECRET, 'login', email, code);
  const hit = live.find((r) => sameHash(r.code_hash, want));
  if (!hit) {
    // every live code for this address loses an attempt: five wrong guesses in all, however many codes were sent
    const left = await q(`update pw.login_codes set attempts = attempts + 1 where email = $1 and expires_at > now() returning attempts`, [email]);
    return fail(c, 400, left.some((r) => (r.attempts as number) < CODE_ATTEMPTS) ? 'wrong_code' : 'expired');
  }
  // used: every live code for the address is spent in one statement, so of two checks at the same moment one signs in.
  // The rows stay (their hashes gone) and keep counting the day's sends until the sweep
  const spent = await q<{ id: string }>(
    `update pw.login_codes set code_hash = '', attempts = $2 where email = $1 and expires_at > now() and attempts < $2 returning id`, [email, CODE_ATTEMPTS]);
  if (!spent.some((r) => r.id === hit.id)) return fail(c, 400, 'expired');
  return signIn(c, await userByEmail(email), 'email');
});

// ---------- accounts: Google ----------
api.post('/auth/google', guard, async (c) => {
  const b = await body(c);
  const credential = typeof b?.credential === 'string' ? b.credential : '';
  if (!GOOGLE_ID) return fail(c, 503, 'accounts_off');
  if (!credential || credential.length > 4096) return fail(c, 400, 'invalid');
  if (await limited('google', ipHash(c), 30)) return fail(c, 429, 'rate_limited');
  let p: JWTPayload & { email?: unknown; email_verified?: unknown };
  try {
    ({ payload: p } = await jwtVerify(credential, google, {
      algorithms: ['RS256'], issuer: ['accounts.google.com', 'https://accounts.google.com'], audience: GOOGLE_ID, clockTolerance: 30,
    }));
  } catch {
    return fail(c, 401, 'invalid_token');
  }
  const email = normEmail(p.email);
  if (p.email_verified !== true || !email || typeof p.sub !== 'string' || !p.sub) return fail(c, 401, 'invalid_token');
  // the Google account first; else the account of the address Google has verified (linked from now on); else a new one.
  // An address already linked to another Google account is neither entered nor moved over: the reader is told
  let [u] = await q<User>(`update pw.users set last_seen_at = now() where google_sub = $1 returning id, email, created_at, unlimited`, [p.sub]);
  if (!u) {
    [u] = await q<User>(
      `insert into pw.users (email, google_sub) values ($1, $2)
       on conflict (email) do update set google_sub = excluded.google_sub, last_seen_at = now() where pw.users.google_sub is null
       returning id, email, created_at, unlimited`, [email, p.sub]);
    if (!u) return fail(c, 409, 'google_other');
  }
  return signIn(c, u, 'google');
});

// ---------- accounts: this device, the reader, their progress ----------
api.post('/auth/logout', guard, session, async (c) => {
  await endSession(c.get('session').hash);
  c.header('Set-Cookie', clearCookie());
  return c.json({ ok: true });
});

api.post('/auth/logout-all', guard, session, async (c) => {
  await q(`with s as (delete from pw.sessions where user_id = $1) delete from pw.link_codes where user_id = $1`, [c.get('user').id]);
  c.header('Set-Cookie', clearCookie());
  return c.json({ ok: true });
});

api.get('/me', session, (c) => c.json(me(c.get('user'))));

api.get('/state', session, async (c) => {
  const [row] = await q<{ state: unknown; rev: number }>(`select state, rev from pw.user_state where user_id = $1`, [c.get('user').id]);
  return c.json({ state: row?.state ?? null, rev: row?.rev ?? 0, me: me(c.get('user')) }); // me: a grant (unlimited) reaches a signed-in device
});

/** The reader's progress, replaced only by a writer who had seen the latest revision; anyone else gets 409 and the copy to merge. */
api.put('/state', sized(STATE_MAX), session, async (c) => {
  const b = await body(c);
  const st = b?.state, rev = b?.rev;
  if (!st || typeof st !== 'object' || Array.isArray(st) || (st as { v?: unknown }).v !== 1 || !Number.isInteger(rev) || (rev as number) < 0) return fail(c, 400, 'invalid');
  const uid = c.get('user').id, json = JSON.stringify(st);
  const done = rev === 0
    ? await q<{ rev: number }>(`insert into pw.user_state (user_id, state, rev) values ($1, $2::jsonb, 1) on conflict (user_id) do nothing returning rev`, [uid, json])
    : await q<{ rev: number }>(`update pw.user_state set state = $2::jsonb, rev = rev + 1, updated_at = now() where user_id = $1 and rev = $3 returning rev`, [uid, json, rev]);
  if (done.length) return c.json({ rev: done[0].rev });
  const [cur] = await q<{ state: unknown; rev: number }>(`select state, rev from pw.user_state where user_id = $1`, [uid]);
  return c.json({ error: 'conflict', state: cur?.state ?? null, rev: cur?.rev ?? 0 }, 409);
});

/** Everything we hold about the reader (PDPA): the account, the progress, the devices (never a token or its hash). */
api.get('/account/export', session, async (c) => {
  const u = c.get('user');
  const [[user], [st], devices] = await Promise.all([
    q(`select id, email, google_sub, created_at, last_seen_at from pw.users where id = $1`, [u.id]),
    q(`select state, rev, updated_at from pw.user_state where user_id = $1`, [u.id]),
    q(`select method, label, created_at, last_seen_at, expires_at, token_hash = $2 as this_device from pw.sessions where user_id = $1 order by created_at`, [u.id, c.get('session').hash]),
  ]);
  return c.json({ exported_at: new Date().toISOString(), user, progress: st ?? null, sessions: devices });
});

/**
 * The account and everything under it, now: sessions, progress and links go with it (on delete cascade). Codes sent to
 * the address are spent, their rows kept a day for the send limits (deleting them would reset the limits for anyone
 * who signs in and deletes, again and again).
 */
api.delete('/account', guard, session, async (c) => {
  const u = c.get('user');
  await q(`update pw.login_codes set code_hash = '', attempts = $2 where email = $1`, [u.email, CODE_ATTEMPTS]);
  await q(`delete from pw.users where id = $1`, [u.id]);
  c.header('Set-Cookie', clearCookie());
  return c.json({ ok: true });
});

// ---------- accounts: another device ----------
api.post('/link', guard, session, async (c) => {
  const u = c.get('user');
  if (await limited('link', u.id, 10)) return fail(c, 429, 'rate_limited');
  const code = newLinkCode(), short = newShortCode();
  await q(`insert into pw.link_codes (code_hash, short_hash, user_id, session_hash, expires_at) values ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
    [hmac(SECRET, 'link', code), hmac(SECRET, 'short', short), u.id, c.get('session').hash, LINK_MINUTES]);
  later(sweep());
  return c.json({ code, short, expires: LINK_MINUTES * 60 });
});

api.post('/link/claim', guard, async (c) => {
  const b = await body(c);
  const raw = String(b?.code ?? '').trim();
  const short = isLinkCode(raw) ? null : normShort(raw);
  if (!isLinkCode(raw) && !short) return fail(c, 400, 'invalid');
  if (await limited('claim', ipHash(c), 20)) return fail(c, 429, 'rate_limited');
  // single use, within its minutes, and only while the session that showed it is still signed in
  const [row] = await q<{ user_id: string }>(
    `update pw.link_codes l set used_at = now() from pw.sessions s
     where ${short ? 'l.short_hash' : 'l.code_hash'} = $1 and l.used_at is null and l.expires_at > now()
       and s.token_hash = l.session_hash and s.user_id = l.user_id and s.expires_at > now()
     returning l.user_id`, [short ? hmac(SECRET, 'short', short) : hmac(SECRET, 'link', raw)]);
  if (!row) return fail(c, 400, 'expired');
  const [u] = await q<User>(`select id, email, created_at, unlimited from pw.users where id = $1`, [row.user_id]);
  if (!u) return fail(c, 400, 'expired');
  return signIn(c, u, 'link');
});

/** The device showing a code asks whether it was used (every 2 s, only while the code is on screen). */
api.get('/link/status', session, async (c) => {
  const [row] = await q<{ used: boolean; live: boolean }>(
    `select used_at is not null as used, expires_at > now() as live from pw.link_codes where user_id = $1 and session_hash = $2 order by created_at desc limit 1`,
    [c.get('user').id, c.get('session').hash]);
  return c.json({ status: !row ? 'none' : row.used ? 'claimed' : row.live ? 'waiting' : 'expired' });
});

// ---------- moderation ----------
/**
 * A moderator: an address on ADMIN_EMAILS, signed in on this device with a code sent to it (a Google or device-link
 * session never counts), less than 12 hours ago. An older session is asked for a fresh code ('reauth').
 */
async function requireAdmin(c: Context<Env>, next: Next) {
  const u = c.get('user'), s = c.get('session');
  if (!ADMINS.includes(u.email)) return fail(c, 403, 'forbidden');
  if (s.method !== 'email' || Date.now() - new Date(s.created_at).getTime() > ADMIN_HOURS * 3600e3) return fail(c, 401, 'reauth');
  c.set('email', u.email);
  await next();
}
const admin = [session, requireAdmin] as const;

api.get('/admin/me', ...admin, (c) => c.json({ admin: true, email: c.get('email') }));

api.get('/admin/posts', ...admin, async (c) => {
  const status = ['pending', 'approved', 'rejected'].includes(c.req.query('status') || '') ? c.req.query('status') : 'pending';
  const rows = await q(`select id, quote_id, school, body, name, phew, status, created_at, reviewed_at, reviewed_by from pw.posts where status = $1 order by created_at ${status === 'pending' ? 'asc' : 'desc'} limit 100`, [status]);
  const [counts] = await q(`select count(*) filter (where status = 'pending')::int as pending, count(*) filter (where status = 'approved')::int as approved, count(*) filter (where status = 'rejected')::int as rejected from pw.posts`);
  return c.json({ posts: rows, counts });
});

api.patch('/admin/posts/:id', guard, ...admin, async (c) => {
  const id = c.req.param('id') || '';
  const b = await body(c);
  const status = String(b?.status || '');
  if (!UUID.test(id) || !['approved', 'rejected', 'pending'].includes(status)) return fail(c, 400, 'invalid');
  const rows = await q(`update pw.posts set status = $2, reviewed_at = now(), reviewed_by = $3 where id = $1 returning id`, [id, status, c.get('email')]);
  if (!rows.length) return fail(c, 404, 'not_found');
  return c.json({ ok: true });
});

api.get('/admin/reports', ...admin, async (c) => {
  const rows = await q(`select id, quote_id, note, status, created_at from pw.reports where status = 'open' order by created_at asc limit 100`);
  return c.json({ reports: rows });
});

api.patch('/admin/reports/:id', guard, ...admin, async (c) => {
  const id = Number(c.req.param('id') || 'x');
  if (!Number.isInteger(id)) return fail(c, 400, 'invalid');
  await q(`update pw.reports set status = 'done' where id = $1`, [id]);
  return c.json({ ok: true });
});

// ---------- the sign-in email ----------
// Today's line as a small gift at the foot of the mail: the lamp's own choice (src/core/daily.ts), for the date in
// Thailand, read from the site's published data. Never needed: without it (slow, or anything odd) the code still goes.
const BY_WEEKDAY = ['existential', 'absurd', null, 'eastern', 'stoic', 'socratic', null];
const ALL = ['stoic', 'existential', 'eastern', 'absurd', 'socratic'];
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
let gift: { key: string; value: Gift | null; at: number } | null = null;
async function todaysGift(): Promise<Gift | null> {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (gift?.key === key && (gift.value || Date.now() - gift.at < 600e3)) return gift.value; // a miss is tried again after 10 minutes
  let value: Gift | null = null;
  try {
    const school = BY_WEEKDAY[new Date(`${key}T12:00:00Z`).getUTCDay()] ?? ALL[fnv(key) % ALL.length];
    const get = (p: string) => fetch(SITE + p, { signal: AbortSignal.timeout(1500) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${p}`))));
    const [list, authors] = await Promise.all([get(`/data/quotes/${school}.json`), get('/data/authors.json')]) as [
      { th: string; author: string; verify: string; source?: { work?: string | null } }[], Record<string, { th: string }>];
    const pool = list.filter((x) => x.verify !== 'attributed' && x.th.length <= 150);
    if (pool.length >= 20) {
      const line = pool[fnv(`${key}:${school}`) % pool.length];
      value = { th: line.th, by: authors[line.author]?.th || '', work: line.source?.work || null };
    }
  } catch (e) {
    console.error('gift', e);
  }
  gift = { key, value, at: Date.now() };
  return value;
}

async function sendCode(email: string, code: string) {
  if (!RESEND) throw new Error('RESEND_API_KEY is not set: no sign-in mail can go out');
  const mail = codeEmail(code, await todaysGift());
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' },
    // no Reply-To: a brand's From with a free-mail Reply-To is a phishing pattern, and Yahoo filed the code as spam; a reply
    // goes to hello@, which forwards (api/inbound.ts)
    body: JSON.stringify({ from: 'Philosophew <hello@philosophew.lol>', to: [email], subject: mail.subject, html: mail.html, text: mail.text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) console.error('resend', r.status, (await r.text()).slice(0, 300)); // never the address or the code
}

/** Resend's webhook for mail received at hello@philosophew.lol: verified, answered at once, forwarded in the background. */
api.post('/inbound', async (c) => {
  const raw = await c.req.text();
  if (raw.length > 64 * 1024) return fail(c, 413, 'too_big');
  if (!signed(raw, c.req.header('svix-id') || '', c.req.header('svix-timestamp') || '', c.req.header('svix-signature') || '', HOOK)) return fail(c, 401, 'unauthorized');
  let ev: { type?: string; data?: { email_id?: string } };
  try { ev = JSON.parse(raw); } catch { return fail(c, 400, 'invalid'); }
  if (ev?.type === 'email.received' && ev.data?.email_id && FORWARD_TO && RESEND) later(forward(ev.data.email_id, { key: RESEND, to: FORWARD_TO }));
  return c.json({ ok: true });
});

// ---------- app: CORS for direct calls in dev, then the routes at / and /api ----------
const app = new Hono();
app.use('*', async (c, next) => {
  const o = c.req.header('origin');
  if (o && ORIGINS.has(o)) {
    c.header('Access-Control-Allow-Origin', o);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Headers', 'content-type, x-pw-account');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Max-Age', '86400');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
});
app.route('/api', api);
app.route('/', api);
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'server' }, 500);
});
app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
