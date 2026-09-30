// Mail sent to hello@philosophew.lol reaches the project's inbox. Resend receives it (the domain's MX record points at
// Resend) and calls this webhook for each message, signed the Svix way; we fetch the message and send it on to
// FORWARD_TO with its sender as Reply-To, so a reply goes straight back to them. Attachments stay in Resend's dashboard.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** A Svix signature over `${id}.${timestamp}.${body}` with the webhook's secret, sent at most five minutes ago. */
export function signed(raw: string, id: string, ts: string, sigs: string, secret: string, now = Date.now()) {
  if (!id || !/^\d+$/.test(ts) || !sigs || !secret || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const want = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`${id}.${ts}.${raw}`).digest();
  return sigs.split(' ').some((s) => {
    const [v, b64] = s.split(',');
    const got = v === 'v1' && b64 ? Buffer.from(b64, 'base64') : null;
    return !!got && got.length === want.length && timingSafeEqual(got, want);
  });
}

interface Received { from?: string; to?: string[]; subject?: string | null; html?: string | null; text?: string | null }

/** Sends one received message on; false when there was nothing to send (ours, or empty). Throws when Resend refuses. */
export async function forward(emailId: string, o: { key: string; to: string }) {
  const auth = { authorization: `Bearer ${o.key}` };
  const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: auth, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`receiving ${r.status}`);
  const m = (await r.json()) as Received;
  if (!m.from || /@philosophew\.lol>?\s*$/i.test(m.from)) return false; // never our own mail again (no loops)
  if (!m.html && !m.text) return false;
  const s = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: 'Philosophew <hello@philosophew.lol>', to: [o.to], reply_to: m.from,
      subject: `[hello@] ${(m.subject || '').slice(0, 200) || '(no subject)'}`,
      ...(m.html ? { html: m.html } : {}), ...(m.text ? { text: m.text } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!s.ok) throw new Error(`send ${s.status}`);
  return true;
}
