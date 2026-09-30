// When part of the app will not load. Offline, it is a part this device has not saved yet: the service worker
// (public/sw.js) saves every page and machine once it is installed, so this is rare (a first visit cut short).
// Online, it is almost always a file of an older build that the server no longer has: a fresh page fixes that.
import { html } from '../core/dom';
import { t } from '../core/i18n';
import { phrases } from '../core/thai';
import { toast, screen, setTone, chrome } from './shell';
import { ICON } from './icons';

type What = 'page' | 'machine' | 'part';
const NAME: Record<What, [th: string, en: string]> = { page: ['หน้านี้', 'This page'], machine: ['ตู้นี้', 'This machine'], part: ['ส่วนนี้', 'This part'] };

/** Can we reach our own server? navigator.onLine only knows whether there is a network, not whether it works. */
export async function reachable(ms = 3000) {
  if (!navigator.onLine) return false;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    await fetch('/', { method: 'HEAD', cache: 'no-store', signal: stop.signal }); // HEAD: the service worker lets it through
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Load this address fresh, once: the same address again within a minute means a fresh page did not help. */
function freshPage() {
  try {
    const here = location.pathname + location.search;
    const last = JSON.parse(sessionStorage.getItem('pw.fresh') || 'null') as { url: string; at: number } | null;
    if (last?.url === here && Date.now() - last.at < 60_000) return false;
    sessionStorage.setItem('pw.fresh', JSON.stringify({ url: here, at: Date.now() }));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** A page, machine or panel did not load. Resolves true when a fresh page load is on its way instead of a message. */
export async function couldNotLoad(what: What): Promise<boolean> {
  const online = await reachable();
  if (online && freshPage()) return true;
  const [th, en] = NAME[what];
  toast(online
    ? t(`โหลด${th}ไม่สำเร็จ ลองใหม่อีกครั้ง`, `${en} didn't load. Try again.`)
    : t(`ตอนนี้ออฟไลน์อยู่ ${th}ยังไม่ได้โหลดเก็บไว้ในเครื่อง ต่อเน็ตแล้วลองใหม่อีกครั้ง`, `You're offline, and ${en.toLowerCase()} isn't saved on this device yet. Reconnect and try again.`), ICON.info, 5200);
  return false;
}

/** A page that failed while opening, with nothing left on screen to keep: say so where the page would be. */
export async function cannotOpen(err: unknown) {
  console.error(err);
  const online = await reachable();
  setTone(null);
  chrome('full');
  document.title = `${online ? t('เปิดไม่สำเร็จ', "Couldn't open") : t('ออฟไลน์อยู่', 'Offline')} | Philosophew`;
  screen.innerHTML = html`
    <section class="page">
      <div class="empty empty--paper">
        <h1 class="h2">${online ? t('เปิดหน้านี้ไม่สำเร็จ', "This page didn't open") : t('ตอนนี้ออฟไลน์อยู่', "You're offline")}</h1>
        <p class="muted">${phrases(online ? t('ลองใหม่อีกครั้ง หรือกลับไปที่ตู้ก่อนก็ได้', 'Try again, or head back to the machines.') : t('หน้านี้ยังไม่ได้โหลดเก็บไว้ในเครื่อง ต่อเน็ตแล้วลองใหม่อีกครั้ง', "This page isn't saved on this device yet. Reconnect and try again."))}</p>
        <div class="row-actions">
          <button class="btn btn--ember" data-retry>${t('ลองใหม่', 'Try again')}</button>
          <a class="btn btn--ghost" href="/">${t('กลับไปที่ตู้', 'Back to the machines')}</a>
        </div>
      </div>
    </section>`.s;
  screen.querySelector('[data-retry]')!.addEventListener('click', () => location.reload());
}
