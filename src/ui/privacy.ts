import { html, raw, esc } from '../core/dom';
import { screen, setTone, chrome } from './shell';
import { lang } from '../core/i18n';
import { TITLE, UPDATED, INTRO, SECTIONS, linkify, type Pair } from '../content/privacy';

// The whole policy in both languages, the reader's first: whoever reads it (a person, a crawler that runs scripts,
// Google's OAuth review) gets the full text, including Google's Limited Use statement as written.
export async function privacyView() {
  setTone(null);
  chrome('full');
  const first = lang() === 'en' ? 1 : 0;
  const version = (i: number, top: boolean) => {
    const say = (p: Pair) => raw(linkify(esc(p[i])));
    return html`
      <div lang="${i ? 'en' : 'th'}" class="privacy__version">
        <header class="privacy__head">
          ${top ? html`<h1 class="h1">${TITLE[i]}</h1>` : html`<h2 class="h1" id="${i ? 'english' : 'thai'}">${TITLE[i]}</h2>`}
          <p class="muted">${UPDATED[i]}</p>
          <p class="about__lead">${say(INTRO)}</p>
        </header>
        ${SECTIONS.map((s) => html`
        <section class="about__sec" id="${s.id}${top ? '' : `-${i ? 'en' : 'th'}`}">
          <h${top ? 2 : 3} class="h2">${s.h[i]}</h${top ? 2 : 3}>
          ${(s.p || []).map((p) => html`<p>${say(p)}</p>`)}
          ${s.li ? html`<ul class="privacy__list">${s.li.map((p) => html`<li>${say(p)}</li>`)}</ul>` : ''}
          ${(s.after || []).map((p) => html`<p>${say(p)}</p>`)}
        </section>`)}
      </div>`;
  };
  screen.innerHTML = html`<section class="page about privacy">${version(first, true)}${version(1 - first, false)}</section>`.s;
}
