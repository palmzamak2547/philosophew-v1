import { html, raw } from '../core/dom';
import { findQuote, loadAuthors, quotesBy } from '../core/data';
import { store } from '../core/store';
import { saveNote } from '../core/game';
import { SCHOOL, L } from '../content/schools';
import { quoteTitle, noindex } from '../content/seo-pages';
import { screen, setTone, chrome, toast } from './shell';
import { card, tilt, authorName, quoteLines } from './card';
import { ICON } from './icons';
import { openNoteEditor } from './note-editor';
import { openShare } from './share';
import { explainVerify } from './verify';
import { qrow } from './library';
import { sfx } from '../core/audio';
import { t } from '../core/i18n';
import { fitPhrases } from '../core/thai';

export async function quoteView(p: { id: string }) {
  chrome('full');
  // one school's file (the page's own), not all five: a shared link on a slow phone draws its card sooner
  const [q, authors] = await Promise.all([findQuote(p.id), loadAuthors()]);
  if (!q) {
    setTone(null);
    noindex();
    document.title = `${t('ไม่พบคำคมนี้', 'Quote not found')} | Philosophew`;
    screen.innerHTML = html`<section class="page"><div class="empty"><h1 class="h2">${t('ไม่พบคำคมนี้', 'We could not find this quote')}</h1><p class="muted">${t('ลิงก์อาจเก่าไป ลองสุ่มใหม่จากตู้ได้เลย', 'The link may be old. Pull a fresh one from a machine.')}</p><a class="btn btn--ember" href="/">${t('ไปหมุนตู้', 'Go pull a quote')}</a></div></section>`.s;
    return;
  }
  const a = authors[q.author];
  const school = SCHOOL[q.school];
  setTone(school);
  document.title = quoteTitle(quoteLines(q).main, authorName(a));
  // carried here from an in-app browser (share.ts carry): the reader's finish and format come along, the sheet opens itself
  const ask = new URLSearchParams(location.search);
  const carried = ask.get('share'), fin = ask.get('finish');
  const finish = (fin === 'gold' || fin === 'foil' || fin === 'paper' ? fin : null) || store.s.finish[q.id] || 'paper';
  if (carried) history.replaceState(history.state, '', location.pathname);
  const more = a ? (await quotesBy(a)).filter((x) => x.id !== q.id).slice(0, 6) : [];
  let offTilt = () => {};
  const paint = () => {
    screen.innerHTML = html`
      <section class="page qpage">
        <div class="qpage__card"><h1 class="sr">${t(`ประโยคของ${authorName(a, q.author)}`, `A line from ${authorName(a, q.author)}`)}</h1>${card(q, a, { finish })}</div>
        <div class="qpage__side">
          <div class="qpage__acts">
            <button class="btn btn--accent" data-act="save">${raw(store.s.notes[q.id] ? ICON.saved : ICON.save)}${store.s.notes[q.id] ? t('อยู่ในสมุดแล้ว', 'Kept') : t('เก็บลงสมุด', 'Keep')}</button>
            <button class="btn btn--light" data-act="note">${raw(ICON.pen)}${t('เขียนความคิด', 'Reflect')}</button>
            <button class="btn btn--light" data-act="share">${raw(ICON.share)}${t('แชร์', 'Share')}</button>
          </div>
          <a class="qpage__cta" href="/s/${school.id}">
            <span class="label th">${L(school.machine.name)}</span>
            <span class="h2">${t('อยากได้ประโยคของตัวเองบ้างไหม ไปหมุนตู้นี้เลย', 'Want one of your own? Try this machine')}</span>
            ${raw(ICON.arrow)}
          </a>
          ${more.length ? html`<h2 class="h2">${t(`ประโยคอื่นของ${authorName(a)}`, `More from ${authorName(a)}`)}</h2><ul class="qlist">${more.map((x) => qrow(x, a))}</ul>` : ''}
          <a class="btn btn--ghost btn--sm" href="/p/${q.author}">${t('รู้จักนักปรัชญาคนนี้', 'About this philosopher')}</a>
        </div>
      </section>`.s;
    fitPhrases(screen);
    // every paint draws a new card, and the tilt goes with it: bound once, the card stopped tilting after Keep
    offTilt();
    const cardEl = screen.querySelector<HTMLElement>('.qcard');
    offTilt = cardEl ? tilt(cardEl) : () => {};
  };
  paint();
  if (carried === 'post' || carried === 'story') openShare(q, a, finish, carried);
  const unsub = store.subscribe(paint);
  const click = (e: Event) => {
    const el = e.target as Element;
    if (el.closest('[data-verify]')) return explainVerify(q);
    const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'save') {
      if (store.s.notes[q.id]) return toast(t('อยู่ในสมุดแล้ว', 'Already kept'), ICON.book);
      saveNote(q, '', finish);
      sfx.stamp();
      toast(t('เก็บลงสมุดแล้ว', 'Kept in your notebook'), ICON.saved);
    }
    if (act === 'note') void openNoteEditor(q, a, finish);
    if (act === 'share') openShare(q, a, finish);
  };
  screen.addEventListener('click', click);
  return () => { offTilt(); unsub(); screen.removeEventListener('click', click); };
}
