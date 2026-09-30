import { html, raw } from '../core/dom';
import { verifyLabel, type Quote } from '../core/data';
import { sheet } from './shell';
import { ICON } from './icons';
import { sourceHtml } from './card';
import { t } from '../core/i18n';

export function explainVerify(q: Quote) {
  const v = verifyLabel(q.verify);
  sheet(html`
    <div class="verify-sheet">
      <p class="verify verify--${q.verify} verify--big">${raw(q.verify === 'attributed' ? ICON.info : ICON.seal)}<span>${v.th}</span></p>
      <p class="h2">${v.long}</p>
      <dl class="kv">
        <dt>${t('แหล่งที่มา', 'Source')}</dt><dd>${q.source.work ? sourceHtml(q) : t('ไม่ระบุ', 'Not stated')}</dd>
        ${q.orig ? html`<dt>${t('ภาษาเดิม', 'In the original')}</dt><dd lang="${q.orig.lang}" class="italic-en">${q.orig.text}</dd>` : ''}
      </dl>
      <p class="muted">${t('เราตรวจที่มาของทุกประโยค คำคมดังที่มักถูกอ้างผิดคน เราไม่ใส่ในตู้ แต่รวบรวมไว้ในหัวข้อ “ไม่ได้พูด แต่คนชอบแชร์” ในหน้าของนักปรัชญาคนนั้น', 'We check where every line comes from. Famous misattributions never go in the machines. We collect them under “Never said it, often shared” on that philosopher’s page.')}</p>
      <div class="row-actions">
        ${q.source.url ? html`<a class="btn btn--light btn--sm" href="${q.source.url}" target="_blank" rel="noopener" data-external>${raw(ICON.link)}${t('ดูแหล่งที่มา', 'Check the source')}</a>` : ''}
        <a class="btn btn--ghost btn--sm" href="/p/${q.author}" data-close>${t('รู้จักนักปรัชญาคนนี้', 'About this philosopher')}</a>
      </div>
    </div>`, { label: t('ที่มาของคำคม', 'Where this quote comes from') });
}
