// "My philosophy" card: preview, share or save. Everything on it comes from this device's own record.
import { html, raw } from '../core/dom';
import { buildProfile, renderProfileCard } from '../core/profilecard';
import type { Format } from '../core/sharecard';
import { markShared } from '../core/game';
import { sheet, toast } from './shell';
import { imagePreview } from './share';
import { ICON } from './icons';
import { t } from '../core/i18n';

export async function openProfile() {
  let format: Format = 'post';
  const s = sheet(html`
    <div class="share">
      <p class="label th">${t('การ์ดปรัชญาของฉัน', 'My philosophy card')}</p>
      <p class="muted small">${t('ทุกตัวเลขมาจากสิ่งที่คุณทำจริง', 'Every number comes from what you actually did.')}</p>
      <div class="seg" role="tablist" aria-label="${t('ขนาดรูป', 'Image size')}">
        <button class="seg__b is-on" role="tab" aria-selected="true" data-fmt="post">${t('โพสต์', 'Post')} 4:5</button>
        <button class="seg__b" role="tab" aria-selected="false" data-fmt="story">${t('สตอรี่', 'Story')} 9:16</button>
      </div>
      <div class="share__preview" data-preview></div>
      <div class="share__actions">
        <button class="btn btn--ember" data-do="native">${raw(ICON.share)}${t('แชร์รูป', 'Share image')}</button>
        <button class="btn btn--light" data-do="download">${raw(ICON.download)}${t('บันทึกรูป', 'Save image')}</button>
      </div>
    </div>`, { label: t('การ์ดปรัชญาของฉัน', 'My philosophy card'), onClose: () => pic.revoke() });
  const profile = buildProfile();
  const pic = imagePreview(s, s.el.querySelector<HTMLElement>('[data-preview]')!, async (f) => renderProfileCard(await profile, f),
    t('การ์ดปรัชญาของฉัน', 'My philosophy card'), t('วาดรูปไม่สำเร็จ ลองใหม่อีกครั้ง', 'Could not draw the image. Try again.'));
  void pic.draw(format);
  const file = () => new File([pic.blob()!], `philosophew-me-${format}.png`, { type: 'image/png' });
  const download = () => {
    if (!pic.blob()) return;
    const a = document.createElement('a');
    a.href = pic.url();
    a.download = file().name;
    document.body.append(a);
    a.click();
    a.remove();
    markShared();
    toast(t('บันทึกรูปแล้ว', 'Image saved'), ICON.download);
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
    if (btn.dataset.do === 'download') return download();
    if (!pic.blob()) return;
    const data: ShareData = { files: [file()] }; // the picture alone, so Instagram stays in the share sheet (share.ts)
    if (navigator.canShare?.(data)) {
      const copied = navigator.clipboard?.writeText(`${t('ปรัชญาของฉัน', 'My philosophy')} ${location.origin}`).then(() => true, () => false);
      try {
        await navigator.share(data);
        markShared();
        if (await copied) toast(t('คัดลอกคำบรรยายพร้อมลิงก์ไว้ให้แล้ว วางใต้โพสต์ได้เลย', 'The caption and link are copied: paste them under your post.'), ICON.link, 4200);
      } catch { /* closed */ }
    }
    else download();
  });
}
