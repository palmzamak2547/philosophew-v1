import { html, raw, fmt } from '../core/dom';
import { loadAuthors, loadAllQuotes, loadLibraryIndex, type Author, type Quote, type LibraryIndex } from '../core/data';
import { SCHOOLS, L } from '../content/schools';
import { screen, setTone, chrome } from './shell';
import { ICON, DHARMA_WHEEL, mark } from './icons';
import { toneStyle, authorName, quoteLines, nameHtml, quoteHtml } from './card';
import { t } from '../core/i18n';

export async function libraryView() {
  setTone(null);
  chrome('full');
  screen.innerHTML = html`<section class="page library"><div class="notes__loading"><span class="spinner"></span></div></section>`.s;
  const [authors, quotes, index] = await Promise.all([
    loadAuthors(),
    loadAllQuotes(),
    loadLibraryIndex().catch(() => null as LibraryIndex | null),
  ]);
  const curatedBy = new Map<string, number>();
  quotes.forEach((q) => curatedBy.set(q.author, (curatedBy.get(q.author) || 0) + 1));
  const total = (index?.total || 0) + quotes.length;
  const sources = index?.sources.filter((s) => s.rows_kept > 0).length || 0;
  let query = '';

  const tile = (a: Author) => {
    const n = (index?.authors[a.id]?.count || 0) + (curatedBy.get(a.id) || 0);
    return html`<li><a class="ptile" href="/p/${a.id}" style="${toneStyle(a.schools[0])}">
      <span class="ptile__img ${a.portrait?.thumb && a.portrait.kind !== 'symbol' ? 'duo' : 'portrait--symbol'}">${a.portrait?.thumb && a.portrait.kind !== 'symbol'
        ? html`<img src="${a.portrait.thumb}" alt="" loading="lazy" width="240" height="300">`
        : raw(a.id === 'the-buddha' || a.portrait?.kind === 'symbol' ? DHARMA_WHEEL : mark({ size: 64 }))}</span>
      <span class="ptile__name">${nameHtml(a)}</span>
      <span class="ptile__count num">${fmt(n)} ${t('ประโยค', 'lines')}</span>
    </a></li>`;
  };

  const render = () => {
    // curly or straight, composed or not: what people paste matches what the data holds
    const fold = (x: string) => x.normalize('NFC').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    const q = fold(query);
    const hitsA = q ? Object.values(authors).filter((a) => fold(a.th).includes(q) || fold(a.en).includes(q)) : [];
    // a thinker's name finds their lines too, not only lines that happen to mention it
    const byAuthor = new Set(hitsA.map((a) => a.id));
    const hitsQ = q ? quotes.filter((x) => byAuthor.has(x.author) || fold(x.th).includes(q) || fold(x.en).includes(q)).slice(0, 40) : [];
    screen.querySelector('[data-results]')!.innerHTML = q ? html`
      ${hitsA.length ? html`<h2 class="h2">${t('นักปรัชญา', 'Philosophers')}</h2><ul class="ptiles">${hitsA.map(tile)}</ul>` : ''}
      <h2 class="h2">${t('คำคมคัดสรร', 'Curated quotes')} <span class="muted num">${hitsQ.length}</span></h2>
      ${hitsQ.length ? html`<ul class="qlist">${hitsQ.map((x) => qrow(x, authors[x.author]))}</ul>` : html`<p class="muted">${t('ยังไม่เจอในคำคมคัดสรร ลองเปิดหน้านักปรัชญาเพื่อค้นในหอสมุดทั้งหมด', 'Nothing in the curated set. Open a philosopher to search their full library.')}</p>`}
    `.s : '';
    screen.querySelector<HTMLElement>('[data-shelves]')!.hidden = !!q;
  };

  screen.innerHTML = html`
    <section class="page library">
      <header class="page__head">
        <p class="label th">${t('หอสมุด', 'The Library')}</p>
        <h1 class="h1">${t(`${fmt(total)} ประโยค จากนักคิด ${Object.keys(authors).length} คน`, `${fmt(total)} lines from ${Object.keys(authors).length} thinkers`)}</h1>
        <p class="muted">${t(`รวบรวมจาก ${sources} แหล่ง ทั้ง Wikiquote, Hugging Face และ GitHub ทุกประโยคติดป้ายบอกว่าตรวจที่มาได้แค่ไหน คำคมที่มักถูกอ้างผิดคน เราคัดออกและเก็บไว้ให้ดูแยก`, `Gathered from ${sources} sources including Wikiquote, Hugging Face and GitHub. Every line is labeled with how well its source checks out; famous misattributions are pulled out and shown separately.`)}</p>
      </header>
      <label class="search search--big"><span class="sr">${t('ค้นหอสมุด', 'Search the library')}</span>${raw(ICON.search)}<input type="search" data-q placeholder="${t('ค้นชื่อนักปรัชญา หรือคำในคำคม', 'Search a philosopher or a word')}" autocomplete="off"></label>
      <div data-results class="lib-results"></div>
      <div data-shelves>
        ${SCHOOLS.map((s) => html`
          <section class="shelf" style="${toneStyle(s.id)}">
            <header class="shelf__head"><h2 class="h2">${L(s.name)}</h2><a class="shelf__go" href="/s/${s.id}">${t('ไปตู้นี้', 'Go to the machine')}${raw(ICON.arrow)}</a></header>
            <ul class="ptiles">${Object.values(authors).filter((a) => a.schools[0] === s.id).map(tile)}</ul>
          </section>`)}
      </div>
    </section>`.s;
  let timer = 0;
  const input = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (!el.matches('[data-q]')) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => { query = el.value.trim(); render(); }, 150);
  };
  screen.addEventListener('input', input);
  // a link can open the library on a search (/library?q=Seneca): search engines offer it as the site's search box
  const asked = new URLSearchParams(location.search).get('q')?.trim().slice(0, 80);
  if (asked) {
    screen.querySelector<HTMLInputElement>('[data-q]')!.value = asked; // a property, never parsed as markup
    query = asked;
    render();
  }
  return () => screen.removeEventListener('input', input);
}

export function qrow(q: Quote, a: Author | undefined) {
  return html`<li><a class="qrow" href="/q/${q.id}" style="${toneStyle(q.school)}"><span class="qrow__text">${quoteHtml(quoteLines(q).main)}</span><span class="qrow__by">${authorName(a)}</span></a></li>`;
}
