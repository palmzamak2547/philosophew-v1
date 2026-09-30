import { smart } from '../core/typo';
import { phrases } from '../core/thai';
import { html, raw, fmt } from '../core/dom';
import { loadAuthors, quotesBy, warmSchool, loadLibraryAuthor, loadMyths, verifyLabel, type LibQuote } from '../core/data';
import { SCHOOL, L, latinGap } from '../content/schools';
import { personTitle, noindex } from '../content/seo-pages';
import { store } from '../core/store';
import { screen, setTone, chrome } from './shell';
import { ICON } from './icons';
import { toneStyle, portrait, nameHtml } from './card';
import { qrow } from './library';
import { lifespan } from '../core/time';
import { t, isEn } from '../core/i18n';
import { reachable } from './offline';

export async function philosopherView(p: { id: string }) {
  chrome('full');
  warmSchool(); // the thinker's own school, fetched alongside the thinkers (not all five schools)
  const authors = await loadAuthors();
  const a = authors[p.id];
  if (!a) {
    setTone(null);
    noindex();
    document.title = `${t('ไม่พบนักปรัชญาคนนี้', 'Philosopher not found')} | Philosophew`;
    screen.innerHTML = html`<section class="page"><div class="empty"><h1 class="h2">${t('ไม่พบนักปรัชญาคนนี้', 'We could not find this philosopher')}</h1><a class="btn btn--light" href="/library">${t('ไปหอสมุด', 'Go to the library')}</a></div></section>`.s;
    return;
  }
  const school = SCHOOL[a.schools[0]];
  setTone(school);
  document.title = personTitle(a);
  const mine = await quotesBy(a);
  const ownThai = mine.every((q) => q.orig?.lang === 'th'); // a Thai teacher's own words: nothing here is translated
  const met = !!store.s.authors[a.id];
  screen.innerHTML = html`
    <section class="page person" style="${toneStyle(a.schools[0])}">
      <header class="person__hero">
        ${portrait(a, 'person__portrait')}
        <div class="person__id">
          <p class="label th">${a.schools.map((s) => L(SCHOOL[s].short)).join(t(' และ ', ', '))}${met ? html` <span class="tag">${t('เจอแล้วในตู้', 'Met in a machine')}</span>` : ''}</p>
          <h1 class="display person__name">${nameHtml(a)}</h1>
          <p class="person__en">${isEn() ? '' : a.en} <span>${lifespan(a.born, a.died, a.circa)}</span></p>
          ${a.portrait?.kind === 'papyrus' ? html`<p class="muted small">${t('ไม่มีภาพเหมือนของท่านเหลือรอดมาถึงวันนี้ ภาพที่เห็นจึงเป็นคำสอนของท่านบนกระดาษปาปิรุสจากศตวรรษที่ 3', 'No likeness of him survives, so the picture shows his words on a papyrus from the 3rd century.')}</p>` : ''}
          ${a.bio || a.bioEn ? html`<p class="person__bio">${isEn() ? a.bioEn || a.bio : a.bio || a.bioEn}</p>` : ''}
          ${a.works.length ? html`<p class="person__works"><b>${t('งานสำคัญ', 'Key works')}</b> ${a.works.join(a.works.some((w) => w.includes(',')) ? '; ' : ', ')}</p>` : ''}
          <div class="row-actions">
            <a class="btn btn--accent" href="/s/${school.id}">${raw(ICON.again)}${t(`สุ่มจากตู้${latinGap(school.short.th)}${school.short.th}`, `Pull from the ${L(school.short)} machine`)}</a>
            ${(isEn() ? a.wiki.en : a.wiki.th || a.wiki.en) ? html`<a class="btn btn--ghost btn--sm" href="${isEn() ? a.wiki.en : a.wiki.th || a.wiki.en}" target="_blank" rel="noopener" data-external>Wikipedia</a>` : ''}
          </div>
        </div>
      </header>

      ${mine.length ? html`
        <section class="person__sec">
          <h2 class="h2">${t('คำคมคัดสรร', 'Curated quotes')} <span class="muted num">${mine.length}</span></h2>
          <p class="muted small">${ownThai
            ? t('ถ้อยคำภาษาไทยของท่านเอง ตรวจที่มาแล้ว ทั้งหมดนี้คือประโยคที่ออกมาจากตู้', "In the teacher's own Thai words, source-checked. These are the lines that come out of the machines.")
            : t('แปลไทยและตรวจที่มาแล้ว ทั้งหมดนี้คือประโยคที่ออกมาจากตู้', 'Translated and source-checked. These are the lines that come out of the machines.')}</p>
          <ul class="qlist">${mine.map((q) => qrow(q, a))}</ul>
        </section>` : ''}

      <section class="person__sec" data-lib>
        <h2 class="h2">${t('ในหอสมุด', 'In the library')} <span class="muted num" data-libcount></span></h2>
        <p class="muted small">${t('ประโยคภาษาอังกฤษจากชุดข้อมูลสาธารณะ ทุกประโยคบอกไว้ว่ามีแหล่งอ้างอิง หรือแค่เล่าต่อกันมา', 'English lines from public datasets, each marked as sourced or merely attributed.')}</p>
        <label class="search"><span class="sr">${t('ค้นประโยคของเขา', 'Search their lines')}</span>${raw(ICON.search)}<input type="search" data-q placeholder="${t('ค้นคำ', 'Search a word')}"></label>
        <ul class="liblist" data-list><li class="muted"><span class="spinner"></span></li></ul>
        <button class="btn btn--light" data-more hidden>${t('ดูเพิ่ม', 'Show more')}</button>
      </section>

      <section class="person__sec" data-myths hidden>
        <h2 class="h2">${t('ไม่ได้พูด แต่คนชอบแชร์', 'Never said it, often shared')}</h2>
        <p class="muted small">${t('ประโยคดังที่มักถูกอ้างว่าเป็นของท่าน แต่ตรวจแล้วมาจากที่อื่น', 'Famous lines credited to them that turn out to come from elsewhere.')}</p>
        <ul class="myths" data-mythlist></ul>
      </section>

      ${a.portrait?.source ? html`<p class="credit">${t('ภาพ', 'Image')}: <a href="${a.portrait.source}" target="_blank" rel="noopener" data-external>${a.portrait.artist || 'Wikimedia Commons'}</a>${a.portrait.license ? `, ${a.portrait.license}` : ''}</p>` : ''}
    </section>`.s;

  // library lines, lazily
  let all: LibQuote[] = [];
  let shown = 30;
  let query = '';
  const listEl = screen.querySelector<HTMLElement>('[data-list]')!;
  const more = screen.querySelector<HTMLButtonElement>('[data-more]')!;
  const paint = () => {
    const list = query ? all.filter((x) => x.t.toLowerCase().includes(query)) : all;
    listEl.innerHTML = list.slice(0, shown).map((x) => html`<li class="lib"><p class="lib__t" lang="en">${phrases(smart(x.t))}</p><p class="lib__meta"><span class="verify verify--${x.v === 'sourced' ? 'sourced' : 'attributed'}">${raw(x.v === 'sourced' ? ICON.seal : ICON.info)}<span>${verifyLabel(x.v).th}</span></span>${x.c ? html`<span class="lib__c">${smart(x.c)}</span>` : ''}</p></li>`.s).join('') || html`<li class="muted">${query ? t('ไม่พบประโยคที่ตรงกับคำค้นนี้', 'No lines match that search') : t('ยังไม่มีในหอสมุด', 'Nothing in the library yet')}</li>`.s;
    more.hidden = list.length <= shown;
  };
  loadLibraryAuthor(a.id).then((r) => {
    all = r.quotes;
    screen.querySelector('[data-libcount]')!.textContent = fmt(all.length);
    paint();
  }).catch(async () => {
    // the big library is saved as it is read: offline, a thinker not opened before has nothing here yet
    const online = await reachable();
    listEl.innerHTML = html`<li class="muted">${online ? t('ยังไม่มีในหอสมุด', 'Nothing in the library yet') : t('ตอนนี้ออฟไลน์อยู่ ประโยคในหอสมุดของเขายังไม่ได้โหลดเก็บไว้ในเครื่อง', "You're offline, and their library lines aren't saved on this device yet.")}</li>`.s;
  });

  loadMyths().then((ms) => {
    const list = ms.filter((m) => m.author === a.id);
    if (!list.length) return;
    screen.querySelector<HTMLElement>('[data-myths]')!.hidden = false;
    screen.querySelector('[data-mythlist]')!.innerHTML = list.map((m) => html`<li class="myth"><p class="myth__q">${phrases(`“${smart(isEn() ? m.en : m.th || m.en)}”`)}</p><p class="myth__why">${raw(ICON.info)}<span>${smart(isEn() ? m.real_source || '' : m.why_th)}</span></p></li>`.s).join('');
  }).catch(() => {});

  const click = (e: Event) => { if ((e.target as Element).closest('[data-more]')) { shown += 40; paint(); } };
  let timer = 0;
  const input = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (!el.matches('[data-q]')) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => { query = el.value.trim().toLowerCase(); shown = 30; paint(); }, 150);
  };
  screen.addEventListener('click', click);
  screen.addEventListener('input', input);
  return () => { screen.removeEventListener('click', click); screen.removeEventListener('input', input); };
}
