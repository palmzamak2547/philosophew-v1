// "Tell us how you feel": the reader writes a sentence, the device reads the moods in it (core/feel.ts,
// no network, no model) and points to the machine that answers them. The mood then leans the next pulls.
import { html } from '../core/dom';
import { readFeeling, type Mood } from '../core/feel';
import { SCHOOL, L, latinGap, type SchoolId } from '../content/schools';
import { sheet } from './shell';
import { t } from '../core/i18n';

const WORD: Record<Mood, [string, string]> = {
  stress: ['เครียด', 'stressed'], anxious: ['กังวล', 'anxious'], angry: ['หงุดหงิด', 'angry'], heartbroken: ['เสียใจ', 'heartbroken'],
  lost: ['ว่างเปล่า', 'lost'], tired: ['เหนื่อย', 'tired'], overwhelmed: ['วุ่นวาย', 'overwhelmed'], confused: ['สับสน', 'confused'],
  bored: ['เบื่อ', 'bored'], stuck: ['ติดอยู่กับที่', 'stuck'],
};

const lightColour = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
};

export function openFeel(onPick: (school: SchoolId, moods: Mood[]) => void) {
  const s = sheet(html`
    <form class="feel" novalidate>
      <p class="label th">${t('บอกเราหน่อย', 'Tell us')}</p>
      <h2 class="h1">${t('วันนี้รู้สึกยังไง', 'How do you feel today?')}</h2>
      <label class="sr" for="feel-text">${t('ความรู้สึกของคุณ', 'Your feelings')}</label>
      <textarea id="feel-text" class="feel__text" rows="3" maxlength="300" placeholder="${t('เช่น งานเยอะจนเครียด หรือ ช่วงนี้รู้สึกว่างเปล่า', 'For example: work is piling up, or lately I feel empty')}"></textarea>
      <p class="muted small">${t('อ่านบนเครื่องของคุณเท่านั้น ไม่ได้ส่งไปที่ไหน', 'Read on your device only. Nothing is sent anywhere.')}</p>
      <div class="feel__out" aria-live="polite"></div>
      <div class="row-actions">
        <button type="button" class="btn btn--ghost" data-close>${t('ยกเลิก', 'Cancel')}</button>
        <button type="submit" class="btn btn--ember" data-read>${t('หาตู้ให้หน่อย', 'Find my machine')}</button>
      </div>
    </form>`, { label: t('บอกความรู้สึก', 'Tell us how you feel') });
  const form = s.el.querySelector('form')!;
  const ta = s.el.querySelector('textarea')!;
  const out = s.el.querySelector<HTMLElement>('.feel__out')!;
  setTimeout(() => ta.focus(), 350);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = readFeeling(ta.value);
    if (!r.school) {
      out.innerHTML = html`<p class="feel__miss">${t('ยังจับความรู้สึกไม่ได้ ลองเล่าเพิ่มอีกนิด หรือเลือกจากปุ่มในหน้าตู้ก็ได้', "We couldn't read a feeling there yet. Say a little more, or pick one of the buttons in the hall.")}</p>`.s;
      return;
    }
    // (the submit is a click on its button, even by Enter: the global button tap sounds it)
    const moods = r.moods.slice(0, 2).map((m) => m.mood);
    const words = moods.map((m) => t(WORD[m][0], WORD[m][1]));
    const school = SCHOOL[r.school];
    const sp = latinGap(school.short.th);
    out.innerHTML = html`
      <div class="feel__hit" style="--s:${school.palette.accent};--st:${lightColour(school.palette.accent) ? '#1a1714' : '#fff'}">
        <p>${t(`ฟังดูเหมือนคุณกำลังรู้สึก${words.join('และ')} ลองตู้${sp}${school.short.th}${sp}ดูไหม`, `Sounds like you feel ${words.join(' and ')}. Try the ${L(school.short)} machine?`)}</p>
        <button type="button" class="btn btn--accent" data-go>${t('ไปที่ตู้นี้', 'Go to this machine')}</button>
      </div>`.s;
    out.querySelector('[data-go]')!.addEventListener('click', () => { s.close(); onPick(r.school!, moods); });
  });
}
