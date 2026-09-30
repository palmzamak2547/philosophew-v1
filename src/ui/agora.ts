import { html, raw, fmt } from '../core/dom';
import { agoraApi, ApiError, type Post } from '../core/api';
import { loadAllQuotes, loadAuthors, type Author, type Quote } from '../core/data';
import { store } from '../core/store';
import { SCHOOLS, SCHOOL, L, isSchool, latinGap, type SchoolId } from '../content/schools';
import { todaysLine, type Daily } from '../core/daily';
import { sheet, toast, screen, setTone, chrome } from './shell';
import { ICON } from './icons';
import { toneStyle, portrait, quoteLines, nameHtml, quoteHtml } from './card';
import { sfx } from '../core/audio';
import { t, isEn } from '../core/i18n';

const MY_POSTS = 'pw.myposts';
const myPosts = (): { id: string; quote: string; at: number }[] => { try { return JSON.parse(localStorage.getItem(MY_POSTS) || '[]'); } catch { return []; } };

export function openComposer(q: Quote, a: Author | undefined) {
  const note = store.s.notes[q.id]?.text || '';
  const name = store.s.settings.name;
  const s = sheet(html`
    <form class="compose" novalidate>
      <p class="label th">${t('โพสต์ลงอะกอรา', 'Post to the Agora')}</p>
      <p class="muted compose__why">${t('อะกอราคือลานกลางเมืองของเอเธนส์ ที่คนมาแลกความคิดกัน โพสต์ของคุณจะขึ้นหลังจากผู้ดูแลอ่านแล้ว', 'The Agora was the square where Athens traded ideas. Your post appears after a moderator reads it.')}</p>
      <blockquote class="note-ed__quote" style="${toneStyle(q.school)}">${quoteHtml(quoteLines(q).main)} <cite>${nameHtml(a)}</cite></blockquote>
      <label class="field">
        <span class="field__label">${t('คุณคิดยังไงกับประโยคนี้', 'What does this line mean to you?')}</span>
        <textarea name="body" rows="5" maxlength="500" required placeholder="${t('เล่าให้คนอื่นฟังหน่อย', 'Tell others what you think')}">${note}</textarea>
        <span class="field__hint"><b data-count class="num">${note.length}</b>/500</span>
      </label>
      <fieldset class="who">
        <legend class="field__label">${t('โพสต์ในชื่อ', 'Post as')}</legend>
        <label class="radio"><input type="radio" name="who" value="anon" ${name ? '' : 'checked'}><span>${t('ไม่ระบุชื่อ', 'Anonymous')}</span></label>
        <label class="radio"><input type="radio" name="who" value="name" ${name ? 'checked' : ''}><span>${t('ใช้ชื่อ', 'Use a name')}</span></label>
        <input class="input" name="name" maxlength="32" placeholder="${t('ชื่อที่อยากให้คนเห็น', 'The name people will see')}" value="${name}" ${name ? '' : 'hidden'} autocomplete="nickname">
      </fieldset>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="compose__err" role="alert" hidden></p>
      <div class="note-ed__actions">
        <button type="button" class="btn btn--ghost" data-close>${t('ยกเลิก', 'Cancel')}</button>
        <button type="submit" class="btn btn--ember">${raw(ICON.agora)}${t('ส่งให้ผู้ดูแลอ่าน', 'Send for review')}</button>
      </div>
    </form>`, { label: t('โพสต์ลงอะกอรา', 'Post to the Agora') });
  const f = s.el.querySelector('form')!;
  const ta = f.querySelector('textarea')!;
  const nameIn = f.querySelector<HTMLInputElement>('input[name="name"]')!;
  const err = f.querySelector<HTMLElement>('.compose__err')!;
  ta.addEventListener('input', () => { f.querySelector('[data-count]')!.textContent = String(ta.value.length); });
  f.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === 'who') { nameIn.hidden = el.value !== 'name'; if (!nameIn.hidden) nameIn.focus(); }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = ta.value.trim();
    const useName = f.querySelector<HTMLInputElement>('input[name="who"]:checked')?.value === 'name';
    const nm = nameIn.value.trim();
    err.hidden = true;
    if (body.length < 10) { err.textContent = t('เขียนอีกนิด อย่างน้อย 10 ตัวอักษร', 'Write a little more: at least 10 characters'); err.hidden = false; return; }
    if (useName && !nm) { err.textContent = t('ใส่ชื่อที่อยากให้คนเห็น หรือเลือกไม่ระบุชื่อ', 'Add a name, or post anonymously'); err.hidden = false; return; }
    const btn = f.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${t('กำลังส่ง', 'Sending')}`;
    try {
      const r = await agoraApi.submit({ quote_id: q.id, school: q.school, body, name: useName ? nm : null, hp: f.querySelector<HTMLInputElement>('.hp')!.value });
      if (useName) store.update((st) => { st.settings.name = nm; });
      try { localStorage.setItem(MY_POSTS, JSON.stringify([{ id: r.id, quote: q.id, at: Date.now() }, ...myPosts()].slice(0, 100))); } catch { /* ok */ }
      sfx.stamp();
      s.close();
      toast(t('ส่งแล้ว ผู้ดูแลจะอ่านก่อนขึ้นอะกอรา', 'Sent. A moderator will read it before it goes up.'), ICON.check, 3400);
    } catch (x) {
      err.textContent = x instanceof ApiError ? x.message : t('ส่งไม่สำเร็จ ลองใหม่อีกครั้ง', 'Could not send. Try again.');
      err.hidden = false;
      btn.disabled = false;
      btn.innerHTML = `${ICON.agora}${t('ส่งให้ผู้ดูแลอ่าน', 'Send for review')}`;
    }
  });
}

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t('เมื่อสักครู่', 'just now');
  if (s < 3600) return t(`${Math.floor(s / 60)} นาทีที่แล้ว`, `${Math.floor(s / 60)} min ago`);
  if (s < 86400) return t(`${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`, `${Math.floor(s / 3600)} h ago`);
  if (s < 86400 * 30) return t(`${Math.floor(s / 86400)} วันที่แล้ว`, `${Math.floor(s / 86400)} d ago`);
  return new Date(iso).toLocaleDateString(isEn() ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function postCard(p: Post, q: Quote | undefined, a: Author | undefined, phewed: boolean) {
  const school = isSchool(p.school) ? p.school : 'stoic';
  return html`
  <article class="post" style="${toneStyle(school)}">
    ${q ? html`<a class="post__quote" href="/q/${p.quote_id}">
      ${portrait(a, 'post__portrait')}
      <div><p class="post__q">${quoteHtml(quoteLines(q).main)}</p><p class="post__a">${nameHtml(a)}</p></div>
    </a>` : ''}
    <p class="post__body hand">${p.body}</p>
    <footer class="post__foot">
      <span class="post__who">${p.name || t('ไม่ระบุชื่อ', 'Anonymous')}</span>
      <span class="muted">${ago(p.created_at)}</span>
      <button class="phew ${phewed ? 'is-on' : ''}" data-phew="${p.id}" aria-pressed="${phewed}" aria-label="${t('ส่ง phew ให้โพสต์นี้', 'Send a phew')}">
        <span class="phew__puff" aria-hidden="true">phew</span><b class="num">${fmt(p.phew)}</b>
      </button>
    </footer>
  </article>`;
}

const PHEWED = 'pw.phewed';
const phewed = (): string[] => { try { return JSON.parse(localStorage.getItem(PHEWED) || '[]'); } catch { return []; } };

export async function agoraView() {
  setTone(null);
  chrome('full');
  const qs = new URLSearchParams(location.search).get('school');
  let school: SchoolId | '' = qs && isSchool(qs) ? qs : '';
  screen.innerHTML = html`
    <section class="page agora">
      <header class="page__head">
        <p class="label th">${t('อะกอรา', 'The Agora')}</p>
        <h1 class="h1">${t('ลานแลกความคิด', 'Where thoughts are traded')}</h1>
        <p class="muted">${t('คนอ่านคำคมเดียวกัน แต่คิดไม่เหมือนกัน ผู้ดูแลอ่านทุกโพสต์ก่อนขึ้นที่นี่', 'Same quote, different minds. Every post is read by a moderator before it appears.')}</p>
        <button class="btn btn--ember agora__write" data-write>${raw(ICON.pen)}${t('เขียนโพสต์', 'Write a post')}</button>
      </header>
      <div class="chips" role="tablist" aria-label="${t('กรองตามสำนัก', 'Filter by school')}">
        <button class="chip ${school ? '' : 'is-on'}" data-f="">${t('ทั้งหมด', 'All')}</button>
        ${SCHOOLS.map((s) => html`<button class="chip ${school === s.id ? 'is-on' : ''}" data-f="${s.id}">${L(s.short)}</button>`)}
      </div>
      <div class="feed" data-feed></div>
      <div class="feed__more"><button class="btn btn--light" data-more hidden>${t('ดูเพิ่ม', 'Show more')}</button></div>
    </section>`.s;
  const feed = screen.querySelector<HTMLElement>('[data-feed]')!;
  const moreBtn = screen.querySelector<HTMLButtonElement>('[data-more]')!;
  const [quotes, authors] = await Promise.all([loadAllQuotes().catch(() => [] as Quote[]), loadAuthors().catch(() => ({} as Record<string, Author>))]);
  const qmap = new Map(quotes.map((q) => [q.id, q]));
  let before = '';
  let alive = true;
  let today: Daily | null = null;

  const load = async (reset: boolean) => {
    if (reset) { feed.innerHTML = skeleton(); before = ''; }
    moreBtn.hidden = true;
    try {
      const r = await agoraApi.feed({ school: school || undefined, before: before || undefined });
      if (!alive) return;
      if (reset) feed.innerHTML = '';
      const ph = new Set(phewed());
      feed.insertAdjacentHTML('beforeend', r.posts.map((p) => postCard(p, qmap.get(p.quote_id), authors[qmap.get(p.quote_id)?.author || ''], ph.has(p.id)).s).join(''));
      if (!feed.children.length) {
        if (!school) today = await todaysLine().catch(() => null);
        if (!alive) return;
        feed.innerHTML = quiet(school, today).s;
      }
      before = r.posts.at(-1)?.created_at || '';
      moreBtn.hidden = !r.more;
    } catch (x) {
      if (!alive) return;
      feed.innerHTML = html`<div class="empty"><p class="h2">${t('ตอนนี้เข้าอะกอราไม่ได้', 'The Agora is unreachable right now')}</p><p class="muted">${x instanceof ApiError ? x.message : ''}</p><button class="btn btn--light" data-retry>${t('ลองใหม่', 'Try again')}</button></div>`.s;
    }
  };
  void load(true);

  const click = async (e: Event) => {
    const el = e.target as Element;
    const f = el.closest<HTMLElement>('[data-f]');
    if (f) {
      school = (f.dataset.f || '') as typeof school;
      screen.querySelectorAll('[data-f]').forEach((c) => c.classList.toggle('is-on', c === f));
      history.replaceState(history.state, '', school ? `/agora?school=${school}` : '/agora');
      return void load(true);
    }
    if (el.closest('[data-more]')) return void load(false);
    if (el.closest('[data-retry]')) return void load(true);
    if (el.closest('[data-first]') && today) return openComposer(today.quote, today.author || undefined);
    if (el.closest('[data-write]')) return void pickLine(qmap, authors);
    const ph = el.closest<HTMLButtonElement>('[data-phew]');
    if (ph && !ph.classList.contains('is-on')) {
      const id = ph.dataset.phew!;
      ph.classList.add('is-on', 'is-pop');
      ph.setAttribute('aria-pressed', 'true');
      const b = ph.querySelector('b')!;
      b.textContent = fmt(Number(b.textContent!.replace(/,/g, '')) + 1);
      sfx.pop();
      try { localStorage.setItem(PHEWED, JSON.stringify([id, ...phewed()].slice(0, 500))); } catch { /* ok */ }
      agoraApi.phew(id).catch(() => { /* keep the optimistic count; the server dedupes */ });
    }
  };
  screen.addEventListener('click', click);
  return () => { alive = false; screen.removeEventListener('click', click); };
}

/**
 * An Agora with no posts yet (launch day, or a quiet school) invites the first one instead of showing an empty card.
 * Nothing is made up: it says the square is quiet, then offers today's line (the same for everyone, src/core/daily.ts)
 * to write about, straight into the composer. A school with no posts sends the reader to its machine.
 */
/**
 * Which line to write about: today's, then the reader's notebook (lines they wrote about first), then the cards they
 * pulled. Readers could only write about today's line from here (a reader with five cards found one to write about).
 */
async function pickLine(qmap: Map<string, Quote>, authors: Record<string, Author>) {
  const today = await todaysLine().catch(() => null);
  const s = store.s;
  const notes = Object.values(s.notes).sort((a, b) => (b.text ? 1 : 0) - (a.text ? 1 : 0) || b.updatedAt - a.updatedAt).map((n) => n.quoteId);
  const pulled = Object.keys(s.finish).filter((id) => !s.notes[id]);
  const seen = new Set<string>();
  const group = (ids: string[]) => ids.filter((id) => qmap.has(id) && id !== today?.quote.id && !seen.has(id) && seen.add(id)).slice(0, 30);
  const row = (q: Quote) => html`<li><button class="pick" data-pick="${q.id}" style="${toneStyle(q.school)}"><span class="pick__line">${quoteHtml(quoteLines(q).main)}</span><span class="pick__by">${nameHtml(authors[q.author])}</span>${s.notes[q.id]?.text ? html`<span class="pick__mine">${t('มีความคิดที่เขียนไว้แล้ว', 'You wrote about it')}</span>` : ''}</button></li>`;
  const mine = group(notes), cards = group(pulled);
  const sh = sheet(html`<div class="picker">
    <p class="label th">${t('เขียนโพสต์', 'Write a post')}</p>
    <h2 class="h2">${t('อยากเขียนถึงประโยคไหน', 'Which line do you want to write about?')}</h2>
    ${today ? html`<p class="picker__head">${t('ประโยคของวันนี้', "Today's line")}</p><ul class="picker__list">${row(today.quote)}</ul>` : ''}
    ${mine.length ? html`<p class="picker__head">${t('จากสมุดของคุณ', 'From your notebook')}</p><ul class="picker__list">${mine.map((id) => row(qmap.get(id)!))}</ul>` : ''}
    ${cards.length ? html`<p class="picker__head">${t('การ์ดที่คุณสุ่มได้', 'Cards you pulled')}</p><ul class="picker__list">${cards.map((id) => row(qmap.get(id)!))}</ul>` : ''}
    ${mine.length || cards.length ? '' : html`<p class="muted">${t('สุ่มการ์ดจากตู้ แล้วกลับมาเขียนถึงประโยคของคุณเองได้', 'Pull a card from a machine, then come back to write about your own line.')} <a href="/">${t('ไปหมุนตู้', 'Go to the machines')}</a></p>`}
  </div>`, { label: t('เขียนโพสต์', 'Write a post') });
  sh.el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-pick]');
    if (!b) return;
    const q = qmap.get(b.dataset.pick!) || (today && today.quote.id === b.dataset.pick ? today.quote : undefined);
    if (!q) return;
    sh.close();
    openComposer(q, authors[q.author]);
  });
}

function quiet(school: SchoolId | '', today: Daily | null) {
  if (school) {
    const s = SCHOOL[school];
    return html`<div class="empty agora-quiet">
      <p class="label th">${L(s.short)}</p>
      <h2 class="h2">${t(`ยังไม่มีใครโพสต์จากตู้${latinGap(s.short.th)}${s.short.th}`, `No one has posted from the ${s.short.en} machine yet`)}</h2>
      <p class="muted">${t('สุ่มประโยคจากตู้นี้ เขียนว่าคุณคิดยังไง แล้วเป็นคนแรกที่โพสต์', 'Pull a line from this machine, write what it means to you, and be the first to post.')}</p>
      <a class="btn btn--ember" href="/s/${s.id}">${raw(ICON.arrow)}${t('ไปตู้นี้', 'Go to the machine')}</a>
    </div>`;
  }
  const q = today?.quote, a = today?.author || undefined;
  return html`<div class="empty agora-quiet">
    <p class="label th">${t('ลานยังเงียบอยู่', 'The square is quiet')}</p>
    <h2 class="h2">${q ? t('เปิดวงคุยด้วยประโยคของวันนี้', "Open it with today's line") : t('มาเป็นคนแรกที่โพสต์', 'Be the first to post')}</h2>
    ${q ? html`<a class="post__quote agora-quiet__line" href="/q/${q.id}" style="${toneStyle(q.school)}">
      ${portrait(a, 'post__portrait')}
      <div><p class="post__q">${quoteHtml(quoteLines(q).main)}</p><p class="post__a">${nameHtml(a, q.author)}</p></div>
    </a>` : ''}
    <p class="muted">${q
      ? t('อ่านแล้วนึกถึงอะไร เขียนสั้นๆ ก็พอ ผู้ดูแลอ่านทุกโพสต์ก่อนขึ้นลาน แล้วโพสต์ของคุณจะเป็นโพสต์แรกที่นี่', 'What does it bring to mind? A few words are enough. A moderator reads every post before it goes up, and yours will be the first here.')
      : t('สุ่มคำคม เขียนความคิด แล้วโพสต์ลงอะกอรา', 'Pull a quote, write what it means to you, and post it here.')}</p>
    <div class="row-actions">
      ${q ? html`<button class="btn btn--ember" data-first>${raw(ICON.pen)}${t('เขียนถึงประโยคนี้', 'Write about this line')}</button>` : ''}
      <a class="btn ${q ? 'btn--ghost' : 'btn--ember'}" href="/">${q ? t('หรือสุ่มประโยคของคุณเอง', 'Or pull one of your own') : t('ไปหมุนตู้', 'Go pull a quote')}</a>
    </div>
  </div>`;
}

const skeleton = () => Array.from({ length: 3 }, () => '<div class="post post--skel"><i></i><i></i><i></i></div>').join('');
