import { html, raw } from '../core/dom';
import { loadPrompts, DEFAULT_PROMPTS, DEFAULT_PROMPTS_EN, type Author, type Quote } from '../core/data';
import { store, type Finish } from '../core/store';
import { saveNote, signedIn, REFLECT_MIN } from '../core/game';
import { sheet, toast } from './shell';
import { ICON } from './icons';
import { quoteLines, nameHtml, quoteHtml } from './card';
import { sfx } from '../core/audio';
import { t, isEn } from '../core/i18n';
import { couldNotLoad } from './offline';

export async function openNoteEditor(q: Quote, a: Author | undefined, finish: Finish, onSaved?: () => void) {
  const fallback = isEn() ? DEFAULT_PROMPTS_EN : DEFAULT_PROMPTS;
  const prompts = await loadPrompts()
    .then((p) => { const list = isEn() ? p[q.school]?.en : p[q.school]?.th; return list?.length ? list : fallback; })
    .catch(() => fallback);
  let pi = (Math.random() * prompts.length) | 0;
  const prev = store.s.notes[q.id]?.text || '';
  const left = Math.max(0, 3 - store.s.reflectToday);
  const rewarded = !!store.s.notes[q.id]?.rewarded; // a line gives its flame once (game.ts saveNote)
  const s = sheet(html`
    <form class="note-ed" novalidate>
      <p class="label th">${t('เขียนความคิด', 'Reflect')}</p>
      <div class="note-ed__prompt">
        <p class="h2" data-prompt>${prompts[pi]}</p>
        <button type="button" class="icon-btn" data-shuffle aria-label="${t('เปลี่ยนคำถาม', 'Another question')}">${raw(ICON.again)}</button>
      </div>
      <blockquote class="note-ed__quote">${quoteHtml(quoteLines(q).main)} <cite>${nameHtml(a)}</cite></blockquote>
      <label class="sr" for="note-text">${t('ความคิดของคุณ', 'Your thoughts')}</label>
      <textarea id="note-text" class="note-ed__text hand" rows="6" maxlength="2000" placeholder="${signedIn() ? t('เขียนอะไรก็ได้ เก็บไว้ในเครื่องนี้และในบัญชีของคุณ มีแค่คุณที่เปิดดูได้', 'Write anything. It stays on this device and in your account, which only you can open.') : t('เขียนอะไรก็ได้ เก็บไว้ในเครื่องคุณเท่านั้น', 'Write anything. It stays on your device.')}">${prev}</textarea>
      <div class="note-ed__meta">
        <span data-count class="num">${prev.length}</span>
        <span class="muted">${rewarded
          ? t('ประโยคนี้ได้ไฟคืนไปแล้ว เขียนต่อได้ตามสบาย', 'This line already earned its flame. Write on as much as you like.')
          : left > 0
          ? t(`เขียนอย่างน้อย ${REFLECT_MIN} ตัวอักษร จะได้ไฟคืน 1 ดวง (วันนี้ได้อีก ${left} ครั้ง)`, `Write ${REFLECT_MIN}+ characters to earn a flame back (${left} left today)`)
          : t('วันนี้รับไฟจากการเขียนครบแล้ว แต่ยังเขียนเก็บไว้ได้เสมอ', 'No more flames from writing today, but you can always write.')}</span>
      </div>
      <p class="note-ed__share">${t('อยากให้คนอื่นได้อ่านด้วยไหม', 'Want others to read it?')} <button type="button" data-share>${raw(ICON.agora)}${t('แชร์ลงอะกอรา', 'Share to the Agora')}</button></p>
      <div class="note-ed__actions">
        <button type="button" class="btn btn--ghost" data-close>${t('ยกเลิก', 'Cancel')}</button>
        <button type="submit" class="btn btn--ember" data-silent>${raw(ICON.check)}${t('บันทึก', 'Save')}</button>
      </div>
    </form>`, { label: t('เขียนความคิด', 'Reflect') });
  const form = s.el.querySelector('form')!;
  const ta = s.el.querySelector('textarea')!;
  const count = s.el.querySelector('[data-count]')!;
  ta.addEventListener('input', () => { count.textContent = String(ta.value.trim().length); });
  s.el.querySelector('[data-shuffle]')!.addEventListener('click', () => {
    pi = (pi + 1) % prompts.length;
    s.el.querySelector('[data-prompt]')!.textContent = prompts[pi];
  });
  setTimeout(() => ta.focus(), 350);
  // Readers looked for a way to share what they wrote from here (it was only in the notebook, behind the card's share
  // sheet): "Share it" keeps the line like Save, then opens the Agora composer with it (a moderator reads it first).
  s.el.querySelector('[data-share]')!.addEventListener('click', () => {
    if (!ta.value.trim()) { ta.focus(); return toast(t('เขียนความคิดก่อน แล้วค่อยแชร์', 'Write your thought first, then share it.')); }
    keep();
    void import('./agora').then((m) => m.openComposer(q, a), () => couldNotLoad('part'));
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); keep(); });
  function keep() {
    const text = ta.value;
    // Save's one voice (it carries data-silent: its sound comes with the submit, after the click): the flame when the
    // line earned one or brought a run back (played by the shell as it announces them), else the stamp
    const earned = saveNote(q, text, finish);
    sfx.stamp();
    if (!earned) toast(text.trim() ? t('บันทึกความคิดลงสมุดแล้ว', 'Reflection saved to your notebook') : t('เก็บคำคมลงสมุดแล้ว', 'Quote kept in your notebook'), ICON.book);
    s.close();
    onSaved?.();
  }
}
