// Talks to the Neon Function behind /api (Vercel rewrite in production, Vite proxy in dev).
import { t } from './i18n';

export class ApiError extends Error {
  constructor(message: string, readonly status = 0, readonly code = '') { super(message); }
}

const MESSAGES: Record<string, () => string> = {
  invalid: () => t('ข้อมูลไม่ครบหรือไม่ถูกต้อง', 'Something in the form is missing or invalid'),
  rate_limited: () => t('ส่งถี่ไปนิด พักสักครู่แล้วลองใหม่', 'That was a lot at once. Take a breath and try again.'),
  busy: () => t('ตอนนี้คนส่งเยอะมาก ลองใหม่อีกสักพัก', 'Lots of posts right now. Try again in a while.'),
  unauthorized: () => t('ต้องเข้าสู่ระบบผู้ดูแลก่อน', 'Please sign in as a moderator'),
  reauth: () => t('ยืนยันตัวตนด้วยรหัสจากอีเมลอีกครั้งก่อน', 'Confirm it is you with a fresh code from your email'),
  forbidden: () => t('บัญชีนี้ไม่มีสิทธิ์เข้าถึง', 'This account has no access'),
  not_found: () => t('ไม่พบรายการนี้', 'Not found'),
  server: () => t('เซิร์ฟเวอร์สะดุด ลองใหม่อีกครั้ง', 'The server hiccupped. Try again.'),
};

async function call<T>(path: string, init: RequestInit & { timeout?: number } = {}): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init.timeout ?? 12000); // first call may wake a sleeping database
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.body) headers['content-type'] = 'application/json';
    const r = await fetch('/api' + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal: ctl.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = (data as { error?: string }).error || '';
      throw new ApiError((MESSAGES[code] || MESSAGES.server)(), r.status, code);
    }
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(navigator.onLine ? t('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง', 'Could not connect. Try again.') : t('ตอนนี้ออฟไลน์อยู่ ต่อเน็ตแล้วลองใหม่', 'You are offline. Reconnect and try again.'));
  } finally {
    clearTimeout(timer);
  }
}

export interface Post {
  id: string;
  quote_id: string;
  school: string;
  body: string;
  name: string | null;
  phew: number;
  created_at: string;
  status?: 'pending' | 'approved' | 'rejected';
}

export const agoraApi = {
  feed: (o: { school?: string; before?: string } = {}) => {
    const p = new URLSearchParams();
    if (o.school) p.set('school', o.school);
    if (o.before) p.set('before', o.before);
    return call<{ posts: Post[]; more: boolean }>(`/posts?${p}`);
  },
  submit: (b: { quote_id: string; school: string; body: string; name: string | null; hp?: string }) =>
    call<{ id: string; status: 'pending' }>('/posts', { method: 'POST', body: JSON.stringify(b) }),
  phew: (id: string) => call<{ phew: number }>(`/posts/${encodeURIComponent(id)}/phew`, { method: 'POST', body: '{}' }), // JSON, like every write (the API refuses anything else)
  report: (b: { quote_id: string; note: string }) => call<{ ok: true }>('/reports', { method: 'POST', body: JSON.stringify(b) }),
};

// moderation rides on the account's session cookie (api/index.ts requireAdmin)
export const adminApi = {
  queue: (status = 'pending') => call<{ posts: Post[]; counts: Record<string, number> }>(`/admin/posts?status=${status}`),
  decide: (id: string, status: 'approved' | 'rejected') =>
    call<{ ok: true }>(`/admin/posts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  me: () => call<{ admin: boolean; email: string }>('/admin/me'),
};
