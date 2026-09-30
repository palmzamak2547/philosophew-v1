// Moderation. A moderator is an account on the API's list (ADMIN_EMAILS) signed in on this device with a code sent to
// that address in the last 12 hours (api/index.ts requireAdmin): Google and linked devices never count. An older
// session is asked for a fresh code. Then approve or reject Agora posts.
import { html, raw } from '../core/dom';
import { adminApi, ApiError, type Post } from '../core/api';
import { loadAllQuotes, loadAuthors, type Author, type Quote } from '../core/data';
import { screen, setTone, chrome, toast } from './shell';
import { ICON } from './icons';
import { toneStyle, authorName, quoteLines } from './card';
import { t } from '../core/i18n';
import { account, signOut } from '../core/account';
import { capsules } from './capsules';
import { phrases } from '../core/thai';

/** Sign out, then the gate again; refused, the moderator is still signed in and is told so. */
async function out() {
  try { await signOut(); } catch (e) { return void import('./signin').then((m) => toast(m.accountError(e), ICON.info, 4200)); }
  void adminView();
}

export async function adminView() {
  setTone(null);
  chrome('full');
  screen.innerHTML = html`<section class="page admin"><div class="notes__loading"><span class="spinner"></span></div></section>`.s;
  let who: { email: string };
  try {
    who = await adminApi.me();
  } catch (x) {
    const code = x instanceof ApiError ? x.code : '';
    return gate(code === 'reauth' ? 'reauth' : code === 'forbidden' ? 'forbidden' : code === 'unauthorized' ? 'signin' : 'down', x instanceof ApiError ? x.message : '');
  }
  return queue(who.email);
}

/** Why the queue is not showing, and the one thing to do about it. */
function gate(why: 'signin' | 'reauth' | 'forbidden' | 'down', message: string) {
  const email = account.me?.email || '';
  screen.innerHTML = html`
    <section class="page admin admin--login">
      <div class="glass glass--page">
        ${capsules(why === 'signin' ? 'waiting' : 'joined', 'glass__mark')}
        <p class="label th">${t('ผู้ดูแล', 'Moderators')}</p>
        <h1 class="glass__h">${why === 'reauth' ? t('ยืนยันตัวตนอีกครั้ง', 'Confirm it is you') : why === 'forbidden' ? t('บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแล', 'This account is not a moderator') : why === 'down' ? t('ตรวจสิทธิ์ไม่สำเร็จ', 'Could not check access') : t('เข้าสู่ระบบผู้ดูแล', 'Moderator sign-in')}</h1>
        <p class="glass__sub">${why === 'reauth' ? phrases(t('หน้าผู้ดูแลเปิดได้ด้วยรหัสจากอีเมล ที่ได้รับภายใน 12 ชั่วโมงที่ผ่านมา เราจะส่งรหัสใหม่ไปให้', 'Moderation opens with a code from your email received in the last 12 hours. We will send a fresh one.'))
          : why === 'forbidden' ? email : why === 'down' ? message : phrases(t('ผู้ดูแลเข้าได้ด้วยรหัสทางอีเมลอย่างเดียว เฉพาะอีเมลที่อยู่ในรายชื่อ', 'Moderators sign in with a code sent by email, and only addresses on the list can.'))}</p>
        ${why === 'forbidden' ? html`<button class="glass__ghost" data-signout>${t('ออกจากระบบ', 'Sign out')}</button>`
          : why === 'down' ? html`<button class="glass__btn" data-retry>${t('ลองอีกครั้ง', 'Try again')}</button>`
          : html`<button class="glass__btn" data-code>${why === 'reauth' ? t('ส่งรหัสใหม่ทางอีเมล', 'Email me a fresh code') : t('ส่งรหัสเข้าอีเมล', 'Email me a code')}</button>`}
      </div>
    </section>`.s;
  screen.querySelector('[data-signout]')?.addEventListener('click', () => void out());
  screen.querySelector('[data-retry]')?.addEventListener('click', () => void adminView());
  screen.querySelector('[data-code]')?.addEventListener('click', async () => {
    const m = await import('./signin');
    const j = await m.openSignIn({ emailOnly: true, email, title: t('รหัสสำหรับผู้ดูแล', 'A code for moderators') });
    if (j) void adminView();
  });
}

async function queue(email: string) {
  const [quotes, authors] = await Promise.all([loadAllQuotes(), loadAuthors()]);
  const qmap = new Map(quotes.map((q) => [q.id, q]));
  let status: 'pending' | 'approved' | 'rejected' = 'pending';
  const load = async () => {
    let data: { posts: Post[]; counts?: Record<string, number> };
    try { data = await adminApi.queue(status); } catch (x) {
      if (x instanceof ApiError && (x.code === 'reauth' || x.code === 'unauthorized')) return void adminView();
      toast(x instanceof ApiError ? x.message : t('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', 'Something went wrong. Try again.'));
      return;
    }
    screen.innerHTML = html`
      <section class="page admin">
        <header class="page__head admin__head">
          <div><p class="label th">${t('ผู้ดูแล', 'Moderation')}</p><h1 class="h1">${t('คิวอะกอรา', 'Agora queue')}</h1></div>
          <div class="admin__me"><span class="muted small">${email}</span><button class="btn btn--ghost btn--sm" data-signout>${t('ออกจากระบบ', 'Sign out')}</button></div>
        </header>
        <div class="seg">${(['pending', 'approved', 'rejected'] as const).map((s) => html`<button class="seg__b ${status === s ? 'is-on' : ''}" data-st="${s}">${s === 'pending' ? t('รออ่าน', 'Pending') : s === 'approved' ? t('อนุมัติแล้ว', 'Approved') : t('ไม่ผ่าน', 'Rejected')} <span class="num">${data.counts?.[s] ?? ''}</span></button>`)}</div>
        <p class="muted small">${t('เลือกการ์ดแล้วกด A เพื่ออนุมัติ หรือกด R ถ้าไม่ให้ผ่าน', 'Select a card, then press A to approve or R to reject.')}</p>
        <ol class="mod">${data.posts.length ? data.posts.map((p) => modCard(p, qmap.get(p.quote_id), authors[qmap.get(p.quote_id)?.author || ''])) : html`<li class="empty"><p class="h2">${t('ไม่มีโพสต์ในหมวดนี้', 'Nothing here')}</p></li>`}</ol>
      </section>`.s;
    screen.querySelector<HTMLElement>('.modc')?.focus();
  };
  const decide = async (card: HTMLElement, to: 'approved' | 'rejected' | 'pending') => {
    card.classList.add('is-leaving', `to-${to}`);
    try {
      await adminApi.decide(card.dataset.id!, to as 'approved' | 'rejected');
      const next = (card.nextElementSibling || card.previousElementSibling) as HTMLElement | null;
      setTimeout(() => { card.remove(); next?.focus(); }, 250);
    } catch (x) {
      card.classList.remove('is-leaving', `to-${to}`);
      if (x instanceof ApiError && (x.code === 'reauth' || x.code === 'unauthorized')) return void adminView();
      toast(x instanceof ApiError ? x.message : t('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', 'Something went wrong. Try again.'));
    }
  };
  await load();
  const click = async (e: Event) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-signout]')) return void out();
    const st = el.closest<HTMLElement>('[data-st]');
    if (st) { status = st.dataset.st as typeof status; return void load(); }
    const act = el.closest<HTMLElement>('[data-decide]');
    if (act) void decide(act.closest<HTMLElement>('.modc')!, act.dataset.decide as 'approved' | 'rejected' | 'pending');
  };
  const key = (e: KeyboardEvent) => {
    const card = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.modc');
    if (!card || (e.target as Element).closest('input, textarea')) return;
    if (e.key === 'a' || e.key === 'A') void decide(card, 'approved');
    if (e.key === 'r' || e.key === 'R') void decide(card, 'rejected');
    if (e.key === 'ArrowDown') (card.nextElementSibling as HTMLElement | null)?.focus();
    if (e.key === 'ArrowUp') (card.previousElementSibling as HTMLElement | null)?.focus();
  };
  screen.addEventListener('click', click);
  addEventListener('keydown', key);
  return () => { screen.removeEventListener('click', click); removeEventListener('keydown', key); };
}

function modCard(p: Post, q: Quote | undefined, a: Author | undefined) {
  return html`
    <li class="modc" tabindex="0" data-id="${p.id}" style="${toneStyle(q?.school || 'stoic')}">
      <div class="modc__q"><b>${authorName(a)}</b> “${q ? quoteLines(q).main : p.quote_id}”</div>
      <p class="modc__body hand">${p.body}</p>
      <p class="modc__meta muted small">${p.name || t('ไม่ระบุชื่อ', 'Anonymous')}, ${new Date(p.created_at).toLocaleString()}</p>
      <div class="modc__acts">
        ${p.status !== 'approved' ? html`<button class="btn btn--sm" style="--b:var(--ok)" data-decide="approved">${raw(ICON.check)}${t('อนุมัติ', 'Approve')}</button>` : ''}
        ${p.status !== 'rejected' ? html`<button class="btn btn--sm btn--light" data-decide="rejected">${raw(ICON.close)}${t('ไม่ผ่าน', 'Reject')}</button>` : ''}
      </div>
    </li>`;
}
