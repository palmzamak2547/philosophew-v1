import { html, raw } from '../core/dom';
import type { Author, Quote } from '../core/data';
import type { Finish } from '../core/store';
import { renderShareCard, canvasBlob, type Format } from '../core/sharecard';
import { markShared } from '../core/game';
import { sheet, toast, type SheetHandle } from './shell';
import { ICON } from './icons';
import { authorName, quoteLines } from './card';
import { t, lang } from '../core/i18n';
import { couldNotLoad } from './offline';

export function quoteUrl(q: Quote) { return `${location.origin}/q/${q.id}`; }

/**
 * The picture in a share sheet. Its frame is a post's size from the first frame (a story stands inside it at the same
 * height), so nothing in the sheet moves when the image lands or the format changes: the sheet once opened on a short
 * "drawing" box and jumped 200 px taller, and every Post or Story tap collapsed and regrew it. Drawing (a 100 to 200 ms
 * task on a phone) waits until the sheet has slid in, and a new format keeps the last picture, dimmed under a
 * spinner, until the new one is ready.
 */
export function imagePreview(s: SheetHandle, box: HTMLElement, render: (f: Format) => Promise<HTMLCanvasElement>, alt: string, failed: string) {
  let blob: Blob | null = null, url = '', turn = 0;
  box.innerHTML = html`<div class="share__frame is-busy"><div class="share__loading"><span class="spinner"></span>${t('กำลังวาดการ์ด', 'Drawing your card')}</div></div>`.s;
  const frame = box.firstElementChild as HTMLElement;
  const slid = new Promise<void>((done) => {
    const end = (e: TransitionEvent) => { if (e.target === s.el && e.propertyName === 'transform') finish(); };
    const finish = () => { clearTimeout(timer); s.el.removeEventListener('transitionend', end); done(); };
    const timer = setTimeout(finish, 700); // no transition to wait for (reduced motion, a hidden tab)
    s.el.addEventListener('transitionend', end);
  });
  const show = (el: Element) => { frame.querySelector('.share__img, .share__fail')?.remove(); frame.prepend(el); };
  const draw = async (f: Format) => {
    const my = ++turn;
    blob = null; // Share and Save wait for this format's picture
    frame.classList.add('is-busy');
    await slid;
    await new Promise(requestAnimationFrame); // the spinner shows before the drawing holds the page
    try {
      const b = await canvasBlob(await render(f));
      const next = URL.createObjectURL(b);
      const img = new Image();
      img.className = 'share__img';
      img.alt = alt;
      img.src = next;
      await img.decode().catch(() => {});
      if (my !== turn) return URL.revokeObjectURL(next);
      show(img);
      if (url) URL.revokeObjectURL(url);
      url = next;
      blob = b;
    } catch {
      if (my !== turn) return;
      const p = document.createElement('p');
      p.className = 'share__fail muted';
      p.textContent = failed;
      show(p);
    }
    frame.classList.remove('is-busy');
  };
  return { draw, blob: () => blob, url: () => url, revoke: () => { if (url) URL.revokeObjectURL(url); } };
}

/** A browser inside another app (Instagram's, LINE's, Facebook's, TikTok's...): it passes words on, never pictures. */
export function inApp(ua = navigator.userAgent) {
  return /Instagram|FBA[NV]|FB_IAB|Line\/|Twitter|TikTok|musical_ly|Bytedance|KAKAOTALK|Snapchat|MicroMessenger|Pinterest|LinkedInApp|Barcelona|; wv\)/i.test(ua)
    || (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)); // an iOS web view leaves Safari's token out
}

/** The same address in the phone's own browser: LINE's documented switch, Android's intent, Safari's scheme on iOS. */
function outside(u: URL) {
  const ua = navigator.userAgent;
  if (/Line\//i.test(ua)) { u.searchParams.set('openExternalBrowser', '1'); return u.href; }
  if (/Android/i.test(ua)) return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;end`;
  return `x-safari-${u.href}`;
}

export function openShare(q: Quote, a: Author | undefined, finish: Finish, start: Format = 'post') {
  let format: Format = start;
  const s = sheet(html`
    <div class="share">
      <p class="label th">${t('แชร์การ์ดนี้', 'Share this card')}</p>
      <div class="seg" role="tablist" aria-label="${t('ขนาดรูป', 'Image size')}">
        <button class="seg__b${start === 'post' ? ' is-on' : ''}" role="tab" aria-selected="${String(start === 'post')}" data-fmt="post">${t('โพสต์', 'Post')} 4:5</button>
        <button class="seg__b${start === 'story' ? ' is-on' : ''}" role="tab" aria-selected="${String(start === 'story')}" data-fmt="story">${t('สตอรี่', 'Story')} 9:16</button>
      </div>
      <div class="share__preview" data-preview></div>
      <p class="muted share__hint" data-hint hidden>${t('กดค้างที่รูปเพื่อบันทึก แล้วโพสต์จากคลังรูปได้เลย', 'Press and hold the picture to save it, then post it from your photos.')}</p>
      <div class="share__actions">
        <button class="btn btn--ember" data-do="native">${raw(ICON.share)}${t('แชร์รูป', 'Share image')}</button>
        <button class="btn btn--light" data-do="download">${raw(ICON.download)}${t('บันทึกรูป', 'Save image')}</button>
        <button class="btn btn--light" data-do="link">${raw(ICON.link)}${t('คัดลอกลิงก์', 'Copy link')}</button>
        <button class="btn btn--ghost" data-do="agora">${raw(ICON.agora)}${t('โพสต์ลงอะกอรา', 'Post to the Agora')}</button>
      </div>
    </div>`, { label: t('แชร์', 'Share'), onClose: () => pic.revoke() });
  const pic = imagePreview(s, s.el.querySelector<HTMLElement>('[data-preview]')!, (f) => renderShareCard(q, a, finish, f),
    t('ภาพการ์ดคำคมสำหรับแชร์', 'Quote card image for sharing'), t('วาดรูปไม่สำเร็จ ลองคัดลอกลิงก์แทนได้', 'Could not draw the image. Copy the link instead.'));
  void pic.draw(format);
  const file = () => new File([pic.blob()!], `philosophew-${q.id}-${format}.png`, { type: 'image/png' });
  // In an in-app browser the picture cannot reach Instagram, so the card carries itself out: the phone's own browser opens
  // this page with this sheet already open, same format, finish and language, one tap from the share sheet. Only if the
  // app keeps the reader in (the page is still on screen a moment later) does the sheet say how to save the picture.
  const carry = () => {
    const u = new URL(quoteUrl(q));
    u.searchParams.set('share', format);
    u.searchParams.set('finish', finish);
    u.searchParams.set('lang', lang());
    location.href = outside(u);
    setTimeout(() => { if (document.visibilityState === 'visible') s.el.querySelector<HTMLElement>('[data-hint]')!.hidden = false; }, 2500);
  };
  s.el.addEventListener('click', async (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-fmt],[data-do]');
    if (!btn) return;
    if (btn.dataset.fmt) {
      if (btn.dataset.fmt === format) return;
      format = btn.dataset.fmt as Format;
      s.el.querySelectorAll('[data-fmt]').forEach((b) => { b.classList.toggle('is-on', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
      return void pic.draw(format);
    }
    const link = quoteUrl(q);
    switch (btn.dataset.do) {
      case 'native': {
        if (!pic.blob()) return;
        // The picture goes alone: with words beside it, Instagram leaves the iPhone's share sheet (readers could not share
        // to IG). Its caption waits on the clipboard, to paste under the post.
        const data: ShareData = { files: [file()] };
        if (navigator.canShare?.(data)) {
          const copied = navigator.clipboard?.writeText(`“${quoteLines(q).main}” ${authorName(a)}\n${link}`).then(() => true, () => false);
          try {
            await navigator.share(data);
            markShared();
            if (await copied) toast(t('คัดลอกคำบรรยายพร้อมลิงก์ไว้ให้แล้ว วางใต้โพสต์ได้เลย', 'The caption and link are copied: paste them under your post.'), ICON.link, 4200);
          } catch { /* user closed the sheet */ }
        } else if (inApp()) carry();
        else if (navigator.share) {
          try { await navigator.share({ title: 'Philosophew', text: `“${quoteLines(q).main}” ${authorName(a)}`, url: link }); markShared(); } catch { /* closed */ }
        } else { download(); }
        return;
      }
      case 'download': return inApp() ? carry() : download(); // an in-app browser saves no files either
      case 'link':
        try { await navigator.clipboard.writeText(link); toast(t('คัดลอกลิงก์แล้ว', 'Link copied'), ICON.link); markShared(); } catch { prompt(t('คัดลอกลิงก์นี้', 'Copy this link'), link); }
        return;
      case 'agora': s.close(); return void import('./agora').then((m) => m.openComposer(q, a), () => couldNotLoad('part'));
    }
  });
  function download() {
    if (!pic.blob()) return;
    const aEl = document.createElement('a');
    aEl.href = pic.url();
    aEl.download = file().name;
    document.body.append(aEl);
    aEl.click();
    aEl.remove();
    markShared();
    toast(t('บันทึกรูปแล้ว', 'Image saved'), ICON.download);
  }
}
