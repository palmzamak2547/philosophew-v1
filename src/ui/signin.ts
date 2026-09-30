// Signing in, drawn as the design board has it (docs/design/accounts.html): a sheet of frosted light with the mark
// as two capsules (one here, one waiting on the next device), Google's own button, or a code by email typed into six
// small lamps that light as the digits come, then the second capsule falling into place. Also the gentle invitation
// (once, at a moment worth keeping) and the sheet that shows a QR code to light the lamp on another device.
// Loaded only when one of them opens.
import { html, raw, reducedMotion, type Html } from '../core/dom';
import { capsule, capsules } from './capsules';
import { sheet, toast, type SheetHandle } from './shell';
import { store } from '../core/store';
import { t, lang } from '../core/i18n';
import { sfx, haptic } from '../core/audio';
import { phrases, fitPhrases } from '../core/thai';
import { ICON } from './icons';
import { account, emailStart, emailVerify, googleSignIn, createLink, linkStatus, sync, AcctError, type Joined } from '../core/account';

// ---------- words for the API's refusals ----------
function why(e: unknown) {
  const code = e instanceof AcctError ? e.code : 'network';
  switch (code) {
    case 'wrong_code': return t('รหัสไม่ตรง ลองอีกครั้ง', "That code doesn't match. Try again.");
    case 'expired': return t('รหัสนี้หมดอายุหรือลองครบ 5 ครั้งแล้ว ขอรหัสใหม่ได้เลย', 'That code has expired or run out of tries. Ask for a new one.');
    case 'invalid': return t('อีเมลนี้ดูไม่ถูกต้อง ลองตรวจอีกครั้ง', "That email doesn't look right. Check it once more.");
    case 'rate_limited': return t('ลองถี่ไปนิด พักสักครู่แล้วลองใหม่', 'That was a lot of tries. Take a breath and try again.');
    case 'invalid_token': return t('Google ยืนยันตัวตนไม่สำเร็จ ลองอีกครั้ง หรือใช้อีเมลแทน', "Google couldn't confirm it's you. Try again, or use your email.");
    case 'google_other': return t('อีเมลนี้ผูกกับบัญชี Google อื่นไว้แล้ว ลองบัญชี Google นั้น หรือใช้อีเมลแทน', 'This email is linked to another Google account. Try that one, or use your email.');
    case 'accounts_off': return t('ระบบบัญชียังไม่เปิดให้ใช้ ลองใหม่ภายหลัง', "Accounts aren't open yet. Try again later.");
    case 'signout': return t('ออกจากระบบไม่สำเร็จ ยังอยู่ในระบบ ลองใหม่อีกครั้ง', "Couldn't sign out. You're still signed in. Try again.");
    case 'offline': return t('ตอนนี้ออฟไลน์อยู่ ต่อเน็ตแล้วลองใหม่', "You're offline. Reconnect and try again.");
    default: return t('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง', "Couldn't connect. Try again.");
  }
}
export const accountError = why;

// ---------- Google's own button ----------
// Google Identity Services, loaded only when a sign-in sheet opens; the button is theirs, drawn in their frame. No One
// Tap: nothing appears unless the reader asks. Without a client ID in the build, the email path stands alone.
const CLIENT = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
type Gis = { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void; cancel: () => void };
let gis: Promise<Gis> | null = null;
let onCredential: (credential: string) => void = () => {};
function loadGis() {
  return (gis ??= new Promise<Gis>((ok, no) => {
    const s = document.createElement('script');
    s.src = `https://accounts.google.com/gsi/client?hl=${lang()}`;
    s.async = true;
    s.onload = () => {
      const id = (window as unknown as { google?: { accounts?: { id?: Gis } } }).google?.accounts?.id;
      if (!id) return no(new Error('gsi'));
      id.initialize({ client_id: CLIENT, callback: (r: { credential?: string }) => r.credential && onCredential(r.credential), auto_select: false, cancel_on_tap_outside: true, ux_mode: 'popup', context: 'signin', itp_support: true });
      ok(id);
    };
    s.onerror = () => { gis = null; s.remove(); no(new Error('gsi')); };
    document.head.append(s);
  }));
}
const darkTheme = () => {
  const th = document.documentElement.dataset.theme;
  return th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
async function googleButton(box: HTMLElement, done: (credential: string) => void) {
  if (!CLIENT) return void box.remove();
  onCredential = done;
  try {
    const id = await loadGis();
    if (!box.isConnected) return;
    box.replaceChildren();
    id.renderButton(box, {
      type: 'standard', theme: darkTheme() ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'continue_with',
      logo_alignment: 'center', width: Math.max(200, Math.min(400, Math.round(box.clientWidth || 320))), locale: lang(),
    });
    box.classList.add('is-ready');
  } catch {
    box.remove(); // offline, or blocked: the email path is right below
    box.parentElement?.querySelector('.glass__or')?.remove();
  }
}

// ---------- the sheet ----------
type Step = 'invite' | 'choose' | 'code' | 'joined';
export interface SignInOpts { step?: 'invite' | 'choose'; reason?: string; email?: string; emailOnly?: boolean; title?: string; onJoined?: (j: Joined) => void }

const privacy = () => html`<a href="/privacy" data-close>${t('นโยบายความเป็นส่วนตัว', 'Privacy policy')}</a>`;

/** The sign-in sheet (or the invitation that leads to it). Resolves when the reader is signed in, or null if they close it. */
export function openSignIn(o: SignInOpts = {}): Promise<Joined | null> {
  return new Promise((resolve) => {
    let email = o.email || '';
    let joined: Joined | null = null;
    let tick = 0;
    const h: SheetHandle = sheet(html`<div class="glass" data-glass></div>`, {
      label: t('เข้าสู่ระบบ', 'Sign in'), cls: 'sheet--glass',
      onClose: () => { clearInterval(tick); onCredential = () => {}; resolve(joined); },
    });
    const box = h.el.querySelector<HTMLElement>('[data-glass]')!;
    const show = (step: Step, focus = true) => {
      clearInterval(tick);
      box.dataset.step = step;
      box.innerHTML = String(view(step));
      fitPhrases(box);
      wire(step);
      if (focus) box.querySelector<HTMLElement>('[data-first]')?.focus({ preventScroll: true });
    };

    const view = (step: Step): Html => {
      if (step === 'invite') return html`
        ${capsules('waiting', 'glass__mark')}
        <h2 class="glass__h">${phrases(t('พาตะเกียงไปทุกเครื่อง', 'Take your lamp everywhere'))}</h2>
        <p class="glass__sub">${o.reason ? html`<b>${o.reason}</b> ` : ''}${phrases(t('เก็บไว้ในบัญชี แล้วสมุด คอลเลกชัน และตะเกียงจะตามคุณไปทุกเครื่อง ไม่ต้องจำรหัสผ่าน', 'Keep them in an account and your notebook, collection and lamp follow you to every device. No password to remember.'))}</p>
        <button class="glass__btn" data-go-choose data-first>${t('เข้าสู่ระบบ', 'Sign in')}</button>
        <button class="glass__ghost" data-close>${t('ไว้ก่อน', 'Not now')}</button>
        <p class="glass__fine">${phrases(t('ไม่บังคับ ไม่มีบัญชีก็เล่นได้เหมือนเดิม', 'Optional. Everything works without one.'))} ${privacy()}</p>`;
      if (step === 'choose') return html`
        ${capsules('waiting', 'glass__mark')}
        <h2 class="glass__h">${phrases(o.title || t('พาตะเกียงไปทุกเครื่อง', 'Take your lamp everywhere'))}</h2>
        <p class="glass__sub">${phrases(o.emailOnly ? t('ผู้ดูแลเข้าด้วยรหัสที่ส่งไปทางอีเมลเท่านั้น', 'Moderators sign in with a code sent by email, and only that.') : t('สมุด คอลเลกชัน และตะเกียงที่จุดติดกัน ตามคุณไปทุกเครื่อง ไม่ต้องจำรหัสผ่าน', 'Your notebook, your collection and your lamp follow you to every device. No password to remember.'))}</p>
        ${o.emailOnly || !CLIENT ? '' : html`<div class="glass__google" data-google aria-label="${t('ดำเนินการต่อด้วย Google', 'Continue with Google')}"><span class="glass__google-wait"></span></div><p class="glass__or"><span>${t('หรือ', 'or')}</span></p>`}
        <form class="glass__form" data-email-form novalidate>
          <label class="sr" for="acct-email">${t('อีเมล', 'Email')}</label>
          <input class="glass__field" id="acct-email" type="email" name="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" required
            placeholder="${t('อีเมลของคุณ', 'Your email')}" value="${email}" aria-describedby="acct-err" data-first>
          <button class="glass__btn" type="submit">${t('ส่งรหัสเข้าอีเมล', 'Email me a code')}</button>
          <p class="glass__err" id="acct-err" role="alert" aria-live="assertive" data-err></p>
        </form>
        <p class="glass__fine">${phrases(t('เก็บอีเมลกับความคืบหน้าไว้ในบัญชีของคุณ ไม่ขายต่อ ลบบัญชีได้ทุกเมื่อ', 'We keep your email and your progress in your account. Never sold. Delete it any time.'))} ${privacy()}</p>
        ${o.emailOnly ? '' : html`<p class="glass__alt"><a href="/link" data-close>${t('เข้าบัญชีไว้ในอีกเครื่องแล้ว? ใช้รหัสเชื่อมเครื่อง', 'Signed in on another device? Use a link code')}</a></p>`}`;
      if (step === 'code') return html`
        <h2 class="glass__h">${t('เช็กอีเมลของคุณ', 'Check your email')}</h2>
        <p class="glass__sub">${t('เราส่งรหัส 6 หลักไปที่', 'We sent a 6-digit code to')} <b class="glass__to">${email}</b><br>${phrases(t('พิมพ์แล้วตะเกียงเล็กๆ จะติดทีละดวง', 'Each digit lights a small lamp.'))}</p>
        <form class="glass__form" data-code-form novalidate>
          <div class="cells" data-cells>
            <input class="cells__input" data-code inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" enterkeyhint="done"
              aria-label="${t('รหัส 6 หลักจากอีเมล', 'The 6-digit code from the email')}" aria-describedby="acct-err" data-first>
            ${Array.from({ length: 6 }, () => html`<span class="cells__cell" aria-hidden="true"><i></i></span>`)}
          </div>
          <p class="glass__err" id="acct-err" role="alert" aria-live="assertive" data-err></p>
          <p class="glass__timer" data-timer aria-live="off"></p>
          <button class="glass__btn" type="submit" data-verify disabled>${t('ยืนยัน', 'Confirm')}</button>
        </form>
        <p class="glass__fine" data-resend></p>
        <p class="glass__alt"><button type="button" data-go-choose>${t('ใช้อีเมลอื่น', 'Use another email')}</button></p>`;
      const s = store.s, met = Object.keys(s.authors).length, kept = Object.keys(s.notes).length;
      return html`
        ${capsules('joined', 'glass__mark glass__mark--joined')}
        <h2 class="glass__h">${joined?.had ? t('สองเครื่องเจอกันแล้ว', 'Your devices have met') : t('เก็บไว้ในบัญชีแล้ว', 'Kept in your account')}</h2>
        <p class="glass__sub">${joined?.had ? html`${phrases(t('แคปซูลอีกเม็ดตกลงมาครบเป็นเครื่องหมายคำพูด', 'The second capsule fell into place.'))}<br>${phrases(t('ทุกอย่างของคุณตามมาครบ', 'Everything of yours came along.'))}` : phrases(t('ต่อไปเข้าจากเครื่องไหน ตะเกียงดวงนี้ก็ตามไปด้วย', 'Sign in on any device and this lamp comes along.'))}</p>
        <ul class="glass__kept">
          <li><i></i>${kept ? t(`สมุดและความคิดที่เขียนไว้ ${kept} ประโยค`, `Your notebook: ${kept} ${kept === 1 ? 'line' : 'lines'}`) : t('สมุดและความคิดที่จะเขียน', 'Your notebook, and what you write in it')}</li>
          <li><i></i>${met ? t(`นักปรัชญาที่เจอแล้ว ${met} คน และการ์ดทุกใบ`, `${met} ${met === 1 ? 'thinker' : 'thinkers'} met, and every card`) : t('คนที่จะได้เจอ และการ์ดทุกใบ', 'Everyone you meet, and every card')}</li>
          <li><i></i>${s.streak ? t(`ตะเกียงที่จุดติดกัน ${s.streak} วัน ไม่เริ่มนับใหม่`, `Your ${s.streak}-day lamp, still counting`) : t('ตะเกียงของคุณ นับต่อได้ทุกเครื่อง', 'Your lamp, counted on every device')}</li>
        </ul>
        <p class="glass__who">${joined?.me.email || ''}</p>
        <button class="glass__btn" data-close data-first>${t('เรียบร้อย', 'Done')}</button>`;
    };

    const done = (j: Joined) => {
      joined = j;
      show('joined');
      const land = reducedMotion() ? 0 : 520; // the second capsule lands
      setTimeout(() => { sfx.drop(); haptic([10, 30, 14]); }, land);
      setTimeout(() => sfx.flame(), land + 260);
      o.onJoined?.(j);
    };

    const wire = (step: Step) => {
      box.querySelector('[data-go-choose]')?.addEventListener('click', () => show('choose'));
      if (step === 'invite') return;
      if (step === 'choose') {
        const g = box.querySelector<HTMLElement>('[data-google]');
        if (g) void googleButton(g, async (credential) => {
          try { done(await googleSignIn(credential)); } catch (e) { box.querySelector('[data-err]')!.textContent = why(e); }
        });
        const f = box.querySelector<HTMLFormElement>('[data-email-form]')!;
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = f.querySelector<HTMLInputElement>('input')!, err = f.querySelector('[data-err]')!, btn = f.querySelector<HTMLButtonElement>('button')!;
          const v = input.value.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(v)) { err.textContent = why(new AcctError('invalid')); input.focus(); return; }
          btn.disabled = true;
          btn.classList.add('is-busy');
          try {
            await emailStart(v);
            email = v.toLowerCase();
            show('code');
          } catch (x) {
            err.textContent = why(x);
            btn.disabled = false;
            btn.classList.remove('is-busy');
          }
        });
        return;
      }
      if (step === 'code') return wireCode();
    };

    const wireCode = () => {
      const f = box.querySelector<HTMLFormElement>('[data-code-form]')!;
      const input = f.querySelector<HTMLInputElement>('[data-code]')!, cells = [...f.querySelectorAll<HTMLElement>('.cells__cell')];
      const err = f.querySelector<HTMLElement>('[data-err]')!, verify = f.querySelector<HTMLButtonElement>('[data-verify]')!;
      const timer = f.querySelector<HTMLElement>('[data-timer]')!, resend = box.querySelector<HTMLElement>('[data-resend]')!;
      const until = Date.now() + 10 * 60e3;
      let again = Date.now() + 45e3, busy = false, lit = 0;
      const paint = () => {
        const v = input.value;
        cells.forEach((c, i) => {
          c.firstElementChild!.textContent = v[i] || '';
          c.classList.toggle('is-lit', i < v.length);
          c.classList.toggle('is-here', i === v.length && document.activeElement === input);
        });
        if (v.length > lit) { sfx.tick(); } // a small lamp catching
        lit = v.length;
        verify.disabled = v.length !== 6 || busy;
      };
      const clock = () => {
        const left = Math.max(0, until - Date.now()), wait = Math.ceil((again - Date.now()) / 1000);
        const mm = Math.floor(left / 60e3), ss = String(Math.floor((left % 60e3) / 1000)).padStart(2, '0');
        timer.textContent = left ? t(`รหัสหมดอายุใน ${mm}:${ss} นาที`, `The code expires in ${mm}:${ss}`) : t('รหัสนี้หมดอายุแล้ว ขอรหัสใหม่ได้เลย', 'This code has expired. Ask for a new one.');
        if (wait > 0) resend.textContent = t(`ไม่ได้รับ? ส่งใหม่ได้ใน ${wait} วินาที`, `Didn't get it? Send again in ${wait} s`);
        else if (!resend.querySelector('button')) resend.innerHTML = String(html`${t('ไม่ได้รับ? ดูในจดหมายขยะด้วย หรือ', "Didn't get it? Check your spam folder, or")} <button type="button" data-resend-now>${t('ส่งรหัสใหม่', 'send a new code')}</button>`);
      };
      clock();
      tick = window.setInterval(clock, 1000);
      const submit = async () => {
        if (busy || input.value.length !== 6) return;
        busy = true;
        f.classList.add('is-checking');
        paint();
        try {
          done(await emailVerify(email, input.value));
        } catch (e) {
          busy = false;
          f.classList.remove('is-checking');
          err.textContent = why(e);
          haptic([20, 40, 20]);
          if (!reducedMotion()) f.querySelector('.cells')!.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 360, easing: 'ease-out' });
          input.value = '';
          lit = 0;
          paint();
          input.focus();
        }
      };
      input.addEventListener('input', () => {
        const v = input.value.replace(/\D/g, '').slice(0, 6); // a pasted "482 913" or "Code: 482913" still lands
        if (v !== input.value) input.value = v;
        if (v) err.textContent = '';
        paint();
        if (v.length === 6) void submit();
      });
      // the caret always sits after the last digit: the six lamps are one field
      const toEnd = () => requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
      input.addEventListener('focus', () => { paint(); toEnd(); });
      input.addEventListener('blur', paint);
      input.addEventListener('click', toEnd);
      input.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') toEnd(); });
      f.addEventListener('submit', (e) => { e.preventDefault(); void submit(); });
      resend.addEventListener('click', async (e) => {
        if (!(e.target as Element).closest('[data-resend-now]')) return;
        again = Date.now() + 45e3;
        resend.textContent = '';
        try { await emailStart(email); toast(t('ส่งรหัสใหม่ไปแล้ว', 'A new code is on its way'), ICON.check); } catch (x) { err.textContent = why(x); }
        clock();
      });
      paint();
    };

    show(o.step || 'choose');
  });
}

/**
 * Once, at a moment worth keeping (the lamp's third day, or the third line kept), after anything else on screen has
 * finished: an invitation, never repeated. Signed-in readers never see it.
 */
export async function invite(reason: 'lamp' | 'notes') {
  const calm = () => { const c = document.documentElement.classList; return !document.querySelector('.sheet') && !c.contains('has-reveal') && !c.contains('has-ritual') && !c.contains('is-pulling'); };
  for (let i = 0; i < 40 && !calm(); i++) await new Promise((r) => setTimeout(r, 700));
  if (!calm() || account.me) return;
  try {
    if (localStorage.getItem('pw.invited')) return;
    localStorage.setItem('pw.invited', String(Date.now()));
  } catch { return; }
  const n = Object.keys(store.s.notes).length;
  void openSignIn({
    step: 'invite',
    reason: reason === 'lamp' ? t(`จุดตะเกียงติดกันครบ ${store.s.streak} วันแล้ว`, `${store.s.streak} days of lamplight.`) : t(`สมุดของคุณมี ${n} ประโยคแล้ว`, `Your notebook holds ${n} lines now.`),
  });
}

// ---------- another device ----------
/** A QR code (and an 8-letter code) that signs another device into this account, watched until it is used or expires. */
export async function openLinkSheet() {
  const { qr, qrPath } = await import('../core/qr');
  let poll = 0, clock = 0, closed = false;
  const stop = () => { clearInterval(poll); clearInterval(clock); };
  const h = sheet(html`<div class="glass" data-glass data-step="link"><div class="glass__wait"><span class="spinner"></span></div></div>`, {
    label: t('เชื่อมอีกเครื่อง', 'Link another device'), cls: 'sheet--glass', onClose: () => { closed = true; stop(); },
  });
  const box = h.el.querySelector<HTMLElement>('[data-glass]')!;
  const make = async () => {
    stop();
    let link: { code: string; short: string; expires: number };
    try { link = await createLink(); } catch (e) {
      box.innerHTML = String(html`<h2 class="glass__h">${t('สร้างรหัสไม่สำเร็จ', "Couldn't make a code")}</h2><p class="glass__sub">${why(e)}</p><button class="glass__btn" data-again data-first>${t('ลองอีกครั้ง', 'Try again')}</button>`);
      box.querySelector('[data-again]')!.addEventListener('click', () => void make());
      return;
    }
    if (closed) return;
    const url = `${location.origin}/link#${link.code}`;
    const sym = qr(url, 'Q');
    const heart = Math.round(sym.size * 0.2) | 1; // the mark sits in a clearing of about a fifth: well inside what level Q recovers
    const p = qrPath(sym, 2, heart);
    const until = Date.now() + link.expires * 1000;
    box.innerHTML = String(html`
      <h2 class="glass__h">${phrases(t('จุดตะเกียงต่อบนอีกเครื่อง', 'Light your lamp on another device'))}</h2>
      <p class="glass__sub">${phrases(t('สแกนด้วยกล้องของอีกเครื่อง ไม่ต้องพิมพ์อะไร', "Scan it with the other device's camera. Nothing to type."))}</p>
      <figure class="qrbox" style="--k:${(heart / p.view).toFixed(4)}">
        <svg viewBox="0 0 ${p.view} ${p.view}" shape-rendering="crispEdges" role="img" aria-label="${t('คิวอาร์โค้ดสำหรับเชื่อมอีกเครื่อง', 'QR code to link another device')}"><path d="${p.d}"/></svg>
        <span class="qrbox__heart" aria-hidden="true">${raw(`<svg viewBox="0 0 64 64">${capsule(20)}${capsule(45)}</svg>`)}</span>
      </figure>
      <p class="glass__timer" data-timer></p>
      <p class="glass__or"><span>${t('หรือ', 'or')}</span></p>
      <p class="glass__sub glass__sub--tight">${phrases(t('เปิด philosophew.lol/link บนเครื่องใหม่ แล้วพิมพ์รหัสนี้', 'Open philosophew.lol/link on the new device and type this code'))}</p>
      <p class="glass__short" aria-label="${link.short.split('').join(' ')}">${link.short.slice(0, 4)}<span></span>${link.short.slice(4)}</p>
      <button class="glass__ghost" data-close data-first>${t('ปิด', 'Close')}</button>`);
    fitPhrases(box);
    box.querySelector<HTMLElement>('[data-first]')?.focus({ preventScroll: true });
    const timer = box.querySelector<HTMLElement>('[data-timer]')!;
    const expired = () => {
      stop();
      box.querySelector('.qrbox')?.classList.add('is-expired');
      timer.textContent = t('รหัสนี้หมดอายุแล้ว', 'This code has expired');
      const again = document.createElement('button');
      again.className = 'glass__btn';
      again.textContent = t('สร้างรหัสใหม่', 'Make a new code');
      again.addEventListener('click', () => void make());
      box.querySelector('[data-close]')!.before(again);
      again.focus();
    };
    const tickClock = () => {
      const left = until - Date.now();
      if (left <= 0) return expired();
      const mm = Math.floor(left / 60e3), ss = String(Math.floor((left % 60e3) / 1000)).padStart(2, '0');
      timer.textContent = t(`ใช้ได้ครั้งเดียว ภายใน ${mm}:${ss} นาที`, `Works once, within ${mm}:${ss}`);
    };
    tickClock();
    clock = window.setInterval(tickClock, 1000);
    // every 2 s while the code is on screen and the page is in front; never after it expires
    poll = window.setInterval(async () => {
      if (document.hidden || Date.now() > until) return;
      const s = await linkStatus().catch(() => 'waiting');
      if (closed) return;
      if (s === 'expired') expired();
      if (s !== 'claimed') return;
      stop();
      box.innerHTML = String(html`
        ${capsules('joined', 'glass__mark glass__mark--joined')}
        <h2 class="glass__h">${t('สองเครื่องเจอกันแล้ว', 'Your devices have met')}</h2>
        <p class="glass__sub">${phrases(t('อีกเครื่องเข้าบัญชีเดียวกับคุณแล้ว', 'The other device is in your account now.'))}<br>${phrases(t('สมุดและตะเกียงตามไปครบ', 'Your notebook and lamp went along.'))}</p>
        <button class="glass__btn" data-close data-first>${t('เรียบร้อย', 'Done')}</button>`);
      fitPhrases(box);
      box.querySelector<HTMLElement>('[data-first]')?.focus({ preventScroll: true });
      const land = reducedMotion() ? 0 : 520;
      setTimeout(() => { sfx.drop(); haptic([10, 30, 14]); }, land);
      setTimeout(() => sfx.flame(), land + 260);
      setTimeout(() => void sync().catch(() => {}), 8000); // what the new device brought, once it has sent it
    }, 2000);
  };
  await make();
}
