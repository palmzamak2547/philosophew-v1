import { html, raw, fmt } from '../core/dom';
import { store, type Note } from '../core/store';
import { removeNote, restoreNote, pickResurface, signedIn } from '../core/game';
import { loadAllQuotes, loadAuthors, type Author, type Quote } from '../core/data';
import { SCHOOLS, L, type SchoolId } from '../content/schools';
import { screen, setTone, chrome, toast } from './shell';
import { ICON } from './icons';
import { toneStyle, quoteLines, portrait, nameHtml, quoteHtml } from './card';
import { openNoteEditor } from './note-editor';
import { openShare } from './share';
import { niceDate } from '../core/time';
import { t } from '../core/i18n';

export async function notesView() {
  setTone(null);
  chrome('full');
  screen.innerHTML = html`<section class="page notes"><div class="notes__loading"><span class="spinner"></span></div></section>`.s;
  const [quotes, authors] = await Promise.all([loadAllQuotes(), loadAuthors()]);
  const qmap = new Map(quotes.map((q) => [q.id, q]));
  let filter: SchoolId | '' = '';
  let query = '';

  // chosen once per visit, so writing about it does not swap it for another
  const picked = pickResurface(Object.values(store.s.notes));
  const back = picked && qmap.get(picked.note.quoteId) ? { ...picked, q: qmap.get(picked.note.quoteId)! } : null;
  if (back) store.update((s) => { const n = s.notes[back.note.quoteId]; if (n) n.shownAt = Date.now(); });
  const render = () => {
    const all = Object.values(store.s.notes).sort((a, b) => b.updatedAt - a.updatedAt);
    const list = all.filter((n) => (!filter || n.school === filter) && (!query || match(n, qmap.get(n.quoteId), authors[n.author], query)));
    const counts = Object.fromEntries(SCHOOLS.map((s) => [s.id, all.filter((n) => n.school === s.id).length]));
    screen.innerHTML = html`
      <section class="page notes">
        <header class="page__head">
          <p class="label th">${t('สมุดของฉัน', 'My notebook')}</p>
          <h1 class="h1">${all.length ? t(`เก็บไว้ ${fmt(all.length)} ประโยค`, `${fmt(all.length)} lines kept`) : t('สมุดยังว่างอยู่', 'Your notebook is empty')}</h1>
          <p class="muted">${signedIn()
            ? t('ทุกอย่างในสมุดเก็บไว้ในเครื่องนี้และในบัญชีของคุณ มีแค่คุณที่เปิดดูได้', 'Everything here stays on this device and in your account, which only you can open.')
            : t('ทุกอย่างในสมุดเก็บไว้ในเครื่องนี้เท่านั้น ไม่มีใครเห็นนอกจากคุณ', 'Everything here stays on this device. Only you can see it.')}</p>
        </header>
        ${all.length ? html`
        <div class="notes__tools">
          <label class="search"><span class="sr">${t('ค้นในสมุด', 'Search the notebook')}</span>${raw(ICON.search)}<input type="search" data-q value="${query}" placeholder="${t('ค้นคำ ชื่อนักปรัชญา หรือสิ่งที่เคยเขียน', 'Search words, names, or your own notes')}"></label>
          <div class="chips">
            <button class="chip ${filter ? '' : 'is-on'}" data-f="">${t('ทั้งหมด', 'All')} <span class="num">${all.length}</span></button>
            ${SCHOOLS.filter((s) => counts[s.id]).map((s) => html`<button class="chip ${filter === s.id ? 'is-on' : ''}" data-f="${s.id}">${L(s.short)} <span class="num">${counts[s.id]}</span></button>`)}
          </div>
        </div>
        ${back && !query && !filter ? html`
        <section class="resurface" style="${toneStyle(back.q.school)}">
          <p class="resurface__when">${raw(ICON.book)}<span>${agoLabel(back.ago)}</span></p>
          <p class="resurface__line">${quoteHtml(quoteLines(back.q).main)}</p>
          <p class="resurface__by">${nameHtml(authors[back.q.author])}</p>
          ${back.note.text ? html`<p class="resurface__mine hand">${back.note.text}</p>` : ''}
          <p class="resurface__ask">${t('วันนี้ยังคิดเหมือนเดิมไหม', 'Do you still see it the same way?')}</p>
          <button class="btn btn--ember btn--sm" data-back-edit="${back.q.id}">${raw(ICON.pen)}${back.note.text ? t('เขียนต่อ', 'Add to it') : t('เขียนความคิด', 'Write about it')}</button>
        </section>` : ''}
        <ol class="journal">${list.map((n) => entry(n, qmap.get(n.quoteId), authors[n.author]))}</ol>
        ${list.length ? '' : html`<p class="muted notes__none">${t('ไม่เจอในสมุด ลองคำอื่น', 'Nothing matches. Try another word.')}</p>`}
        ` : html`
        <div class="empty empty--paper">
          <div class="empty__art" aria-hidden="true">${raw(ICON.book)}</div>
          <p class="h2">${t('เริ่มจากประโยคแรกกัน', 'Start with your first line')}</p>
          <p class="muted">${t('หมุนตู้ แล้วกดเก็บลงสมุดเมื่อเจอประโยคที่ใช่ ถ้าเขียนความคิดสั้นๆ ไว้ด้วย จะได้ไฟคืน', 'Pull a quote and save the ones that land. A short reflection also earns a flame back.')}</p>
          <a class="btn btn--ember" href="/">${t('ไปหมุนตู้', 'Go pull a quote')}</a>
        </div>`}
      </section>`.s;
    const input = screen.querySelector<HTMLInputElement>('[data-q]');
    if (input && document.activeElement !== input && query) { input.focus(); input.setSelectionRange(query.length, query.length); }
  };
  render();

  const click = (e: Event) => {
    const el = e.target as Element;
    const f = el.closest<HTMLElement>('[data-f]');
    if (f) { filter = (f.dataset.f || '') as SchoolId | ''; return render(); }
    const be = el.closest<HTMLElement>('[data-back-edit]');
    if (be && back) return void openNoteEditor(back.q, authors[back.q.author], store.s.notes[back.q.id]?.finish || 'paper', render);
    const act = el.closest<HTMLElement>('[data-act]');
    if (!act) return;
    const id = act.closest<HTMLElement>('[data-note]')!.dataset.note!;
    const q = qmap.get(id);
    const n = store.s.notes[id];
    if (!q || !n) return;
    if (act.dataset.act === 'edit') return void openNoteEditor(q, authors[q.author], n.finish, render);
    if (act.dataset.act === 'share') return openShare(q, authors[q.author], n.finish);
    if (act.dataset.act === 'remove') {
      const backup = { ...n };
      removeNote(id);
      render();
      toast(t('ลบออกจากสมุดแล้ว', 'Removed from notebook'), ICON.close, 6500); // time enough to reach Undo
      undoable(backup, render);
    }
  };
  let timer = 0;
  const input = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (!el.matches('[data-q]')) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => { query = el.value.trim().toLowerCase(); render(); }, 180);
  };
  screen.addEventListener('click', click);
  screen.addEventListener('input', input);
  return () => { screen.removeEventListener('click', click); screen.removeEventListener('input', input); };
}

const agoLabel = (d: number) => d === 1 ? t('เมื่อวาน คุณเก็บประโยคนี้ไว้', 'Yesterday you kept this line')
  : d === 365 ? t('วันนี้เมื่อปีที่แล้ว คุณเก็บประโยคนี้ไว้', 'A year ago today you kept this line')
  : t(`เมื่อ ${d} วันก่อน คุณเก็บประโยคนี้ไว้`, `${d} days ago you kept this line`);

function match(n: Note, q: Quote | undefined, a: Author | undefined, s: string) {
  return [n.text, q?.th, q?.en, a?.th, a?.en].some((x) => x?.toLowerCase().includes(s));
}

function entry(n: Note, q: Quote | undefined, a: Author | undefined) {
  // a line the data no longer has (or that did not load) still shows, with the reader's words: the count above counts it
  if (!q) return html`<li class="jentry" data-note="${n.quoteId}"><time class="jentry__date">${niceDate(n.updatedAt)}</time><p class="muted">${t('ประโยคนี้เปิดไม่ขึ้นตอนนี้ ลองใหม่อีกครั้ง', 'This line did not load. Try again later.')} ${nameHtml(a)}</p>${n.text ? html`<p class="jentry__mine hand">${n.text}</p>` : ''}</li>`;
  return html`
    <li class="jentry" data-note="${n.quoteId}" style="${toneStyle(q.school)}">
      <time class="jentry__date">${niceDate(n.updatedAt)}</time>
      <a class="jentry__quote" href="/q/${q.id}">
        ${portrait(a, 'jentry__portrait')}
        <span><span class="jentry__text">${quoteHtml(quoteLines(q).main)}</span><span class="jentry__by">${nameHtml(a)}</span></span>
      </a>
      ${n.text ? html`<p class="jentry__mine hand">${n.text}</p>` : html`<button class="jentry__prompt" data-act="edit">${raw(ICON.pen)}${t('เขียนความคิดเกี่ยวกับประโยคนี้', 'Write what this means to you')}</button>`}
      <div class="jentry__acts">
        ${n.finish !== 'paper' ? html`<span class="tag tag--${n.finish}">${n.finish === 'gold' ? t('ทองคำเปลว', 'Gold leaf') : t('ฟอยล์', 'Foil')}</span>` : ''}
        <button class="icon-btn" data-act="edit" aria-label="${t('แก้ไขความคิด', 'Edit reflection')}">${raw(ICON.pen)}</button>
        <button class="icon-btn" data-act="share" aria-label="${t('แชร์', 'Share')}">${raw(ICON.share)}</button>
        <button class="icon-btn" data-act="remove" aria-label="${t('ลบออกจากสมุด', 'Remove from notebook')}">${raw(ICON.close)}</button>
      </div>
    </li>`;
}

function undoable(n: Note, rerender: () => void) {
  const box = document.querySelector('.toasts');
  const last = box?.lastElementChild;
  if (!last) return;
  const b = document.createElement('button');
  b.className = 'toast__undo';
  b.textContent = t('กู้คืน', 'Undo');
  b.onclick = () => { restoreNote(n); rerender(); last.remove(); };
  last.append(b);
  (last as HTMLElement).style.pointerEvents = 'auto';
}
