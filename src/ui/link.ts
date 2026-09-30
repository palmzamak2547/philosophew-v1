// /link: this device joins an account another device is signed in to. From the QR code the code arrives in the
// address's hash (never sent to a server, so never in a log); it is taken out of the address at once, claimed, and the
// reader lands on their page. Without one, the 8-letter code is typed here. Offline, the page says so and waits.
import { html, reducedMotion } from '../core/dom';
import { screen, setTone, chrome } from './shell';
import { go } from '../core/router';
import { t } from '../core/i18n';
import { sfx, haptic } from '../core/audio';
import { phrases, fitPhrases } from '../core/thai';
import { noindex } from '../content/seo-pages';
import { account, claimLink, AcctError, type Joined } from '../core/account';
import { capsules } from './capsules';
import { openSignIn } from './signin';

export async function linkView() {
  setTone(null);
  chrome('full');
  noindex();
  const fromQr = location.hash.slice(1);
  if (fromQr) history.replaceState(history.state, '', '/link'); // the code leaves the address before anything else
  let busy = false, back: (() => void) | null = null;

  const page = (body: ReturnType<typeof html>) => {
    screen.innerHTML = html`<section class="page linkpage"><div class="glass glass--page" data-glass>${body}</div></section>`.s;
    fitPhrases(screen);
  };
  const form = (err = '') => {
    page(html`
      ${capsules('waiting', 'glass__mark')}
      <h1 class="glass__h">${t('เชื่อมเครื่องนี้', 'Link this device')}</h1>
      <p class="glass__sub">${phrases(t('บนเครื่องที่เข้าบัญชีอยู่แล้ว เปิดหน้า “ฉัน” แล้วเลือก “เชื่อมอีกเครื่อง” จะมีคิวอาร์ให้สแกน และรหัส 8 ตัวให้พิมพ์ตรงนี้', 'On the device that is already signed in, open Me and choose Link another device. Scan its QR code, or type its 8-letter code here.'))}</p>
      <form class="glass__form" data-claim novalidate>
        <label class="sr" for="link-code">${t('รหัส 8 ตัว', 'The 8-letter code')}</label>
        <input class="glass__field glass__field--code" id="link-code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="11"
          placeholder="K7QM 2XPA" aria-describedby="link-err" required>
        <button class="glass__btn" type="submit">${t('เชื่อมเครื่อง', 'Link this device')}</button>
        <p class="glass__err" id="link-err" role="alert" aria-live="assertive">${err}</p>
      </form>
      <p class="glass__alt"><button type="button" data-signin>${t('หรือเข้าสู่ระบบด้วย Google หรืออีเมล', 'Or sign in with Google or email')}</button></p>`);
    const f = screen.querySelector<HTMLFormElement>('[data-claim]')!;
    const input = f.querySelector('input')!;
    if (!err) input.focus({ preventScroll: true });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (v.replace(/[\s-]/g, '').length !== 8) { f.querySelector('[role=alert]')!.textContent = t('รหัสมี 8 ตัว ลองดูอีกครั้ง', 'The code has 8 letters. Check it once more.'); return; }
      void claim(v);
    });
    screen.querySelector('[data-signin]')!.addEventListener('click', () => void openSignIn().then((j) => { if (j) go('/me', { replace: true }); }));
  };

  const joined = (j: Joined) => {
    page(html`
      ${capsules('joined', 'glass__mark glass__mark--joined')}
      <h1 class="glass__h">${t('สองเครื่องเจอกันแล้ว', 'Your devices have met')}</h1>
      <p class="glass__sub">${phrases(t('แคปซูลอีกเม็ดตกลงมาครบเป็นเครื่องหมายคำพูด', 'The second capsule fell into place.'))}<br>${phrases(t('สมุด คอลเลกชัน และตะเกียงตามมาที่เครื่องนี้แล้ว', 'Your notebook, collection and lamp are on this device now.'))}</p>
      <p class="glass__who">${j.me.email}</p>`);
    const land = reducedMotion() ? 0 : 520;
    setTimeout(() => { sfx.drop(); haptic([10, 30, 14]); }, land);
    setTimeout(() => sfx.flame(), land + 260);
    setTimeout(() => go('/me', { replace: true }), reducedMotion() ? 1400 : 2600);
  };

  const claim = async (code: string) => {
    if (busy) return;
    busy = true;
    page(html`${capsules('waiting', 'glass__mark glass__mark--pulse')}<h1 class="glass__h">${t('กำลังเชื่อมเครื่อง', 'Linking this device')}</h1><p class="glass__sub" role="status">${t('รอสักครู่', 'One moment')}</p>`);
    try {
      joined(await claimLink(code));
    } catch (e) {
      busy = false;
      const c = e instanceof AcctError ? e.code : 'network';
      if (c === 'offline' || c === 'network') return offline(code);
      form(c === 'rate_limited' ? t('ลองถี่ไปนิด พักสักครู่แล้วลองใหม่', 'That was a lot of tries. Take a breath and try again.')
        : t('รหัสนี้ใช้ไม่ได้แล้ว อาจหมดอายุหรือถูกใช้ไปแล้ว ขอรหัสใหม่จากอีกเครื่องได้เลย', 'That code no longer works: it may have expired or been used. Ask the other device for a new one.'));
    }
  };

  // offline: the code stays in memory only, for a few minutes, and the page waits calmly
  const offline = (code: string) => {
    page(html`
      ${capsules('waiting', 'glass__mark')}
      <h1 class="glass__h">${t('ตอนนี้ออฟไลน์อยู่', "You're offline")}</h1>
      <p class="glass__sub">${phrases(t('ต่อเน็ตแล้วลองอีกครั้ง รหัสยังใช้ได้อีกไม่กี่นาที', 'Reconnect and try again. The code still works for a few minutes.'))}</p>
      <button class="glass__btn" data-retry>${t('ลองอีกครั้ง', 'Try again')}</button>`);
    screen.querySelector('[data-retry]')!.addEventListener('click', () => void claim(code));
    back = () => { removeEventListener('online', back!); back = null; void claim(code); };
    addEventListener('online', back);
  };

  if (account.me && !fromQr) {
    page(html`
      ${capsules('joined', 'glass__mark')}
      <h1 class="glass__h">${t('เครื่องนี้เข้าบัญชีอยู่แล้ว', 'This device is signed in')}</h1>
      <p class="glass__sub">${account.me.email}</p>
      <a class="glass__btn" href="/me">${t('ไปหน้าของฉัน', 'Go to Me')}</a>`);
    return;
  }
  if (fromQr) void claim(fromQr);
  else form();
  return () => { if (back) removeEventListener('online', back); };
}
