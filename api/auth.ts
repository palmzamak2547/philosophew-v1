// The account system's secrets and formats, kept free of the database so scripts/check-account.mjs can test them.
// Session tokens: 32 random bytes in an HttpOnly cookie, stored as sha256. Sign-in codes: six digits from a CSPRNG,
// stored as an HMAC keyed by SESSION_SECRET (a copy of the table can not be guessed back into codes). Device links:
// a 128-bit code for the QR and an 8-letter one to type, both single use, both stored as HMACs.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'pw_s';
export const SESSION_DAYS = 180;
export const CODE_MINUTES = 10;
export const CODE_ATTEMPTS = 5;
export const LINK_MINUTES = 5;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmac = (secret: string, ...parts: string[]) => createHmac('sha256', secret).update(parts.join('\n')).digest('hex');

/** Equal hex digests, compared in constant time (a mismatch in length is simply not equal). */
export function sameHash(a: string, b: string) {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export const newToken = () => randomBytes(32).toString('base64url');
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const newLinkCode = () => randomBytes(16).toString('base64url'); // 22 letters

// Crockford's base32 without the letters people misread (no I, L, O, U): 8 of them are 40 bits, typed once, within minutes
const SHORT = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const newShortCode = () => Array.from({ length: 8 }, () => SHORT[randomInt(0, SHORT.length)]).join('');
/** What a person typed, read the way Crockford meant: any case, spaces and dashes ignored, O as 0, I and L as 1. */
export function normShort(s: string) {
  const v = s.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(v) ? v : null;
}
export const isLinkCode = (s: string) => /^[A-Za-z0-9_-]{22}$/.test(s);

/** An address as we keep it: trimmed, lower case, plausible, no longer than the standard allows. */
export function normEmail(v: unknown) {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(e) ? e : null;
}

/** The session cookie: this site only (no Domain), sent only to the API, never readable by scripts. */
export function cookie(token: string, maxAge = SESSION_DAYS * 86400) {
  return `${COOKIE}=${token}; Path=/api; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
export const clearCookie = () => cookie('', 0);

/** A device named the way its owner would ("Safari on iPhone"), for the account export. Never the full user agent. */
export function deviceLabel(ua: string) {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  const app = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [app, os].filter(Boolean).join(' on ') || 'A browser';
}
