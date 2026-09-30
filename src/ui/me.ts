import { html, raw, fmt, el } from '../core/dom';
import { store, readBackup, type State } from '../core/store';
import { levelOf, maxFlames, unlimited, xpFor, LEVEL_TITLES, shiftDay } from '../core/game';
import { loadAuthors, loadMeta, loadAllQuotes, type Author } from '../core/data';
import { SCHOOLS, L } from '../content/schools';
import { screen, setTone, chrome, toast, applyTheme, switchLang, sheet } from './shell';
import { ICON, DHARMA_WHEEL, mark } from './icons';
import { toneStyle, authorName, nameHtml } from './card';
import { sfx, setVolume } from '../core/audio';
import { t, lang } from '../core/i18n';
import { dayKey } from '../core/time';
import { phrases, fitPhrases } from '../core/thai';
import { couldNotLoad } from './offline';
import { account, sync, signOut, exportAccount, deleteAccount, forgetDevice, type SyncStatus } from '../core/account';
import { merge } from '../core/merge';
import { capsules } from './capsules';

// the stats label keeps its slash with the word after it: a narrow phone set "ฟอยล์" alone under "ทองคำเปลว /"
const NBSP = '\u00a0';

/** The streak lamp: a terracotta lucerna whose flame grows with the streak. */
export function lampSvg(streak: number) {
  const k = Math.min(1, Math.log2(1 + streak) / 5); // 1 day small, ~30 days full
  const gold = streak >= 30;
  return `<svg class="lamp ${gold ? 'lamp--gold' : ''} ${streak ? '' : 'lamp--out'}" viewBox="0 0 220 170" aria-hidden="true" style="--k:${k.toFixed(3)}">
    <defs>
      <radialGradient id="lg" cx="50%" cy="70%" r="60%"><stop offset="0" stop-color="${gold ? '#FFF3B0' : '#FFE08A'}"/><stop offset=".55" stop-color="${gold ? '#FFC53A' : '#FF8A2A'}"/><stop offset="1" stop-color="${gold ? '#E58A00' : '#E2471B'}"/></radialGradient>
      <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFB85A" stop-opacity=".55"/><stop offset="1" stop-color="#FFB85A" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="lamp__halo" cx="172" cy="58" r="58" fill="url(#halo)"/>
    <g class="lamp__flame">
      <path d="M172 14 C186 36 193 52 184 68 C179 77 165 77 160 68 C152 52 162 36 172 14 Z" fill="url(#lg)"/>
      <path d="M172 40 C179 51 181 58 177 66 C175 70 169 70 167 66 C163 58 166 51 172 40 Z" fill="#FFF8DE"/>
    </g>
    <path d="M36 110 C36 88 70 80 104 80 C126 80 150 84 164 89 L182 94 C191 97 191 108 182 110 L162 115 C150 127 128 134 104 134 C66 134 36 128 36 110 Z" fill="#C8643B"/>
    <path d="M36 110 C36 122 64 130 104 130 C130 130 150 124 160 116" fill="none" stroke="#9E4A26" stroke-width="3" opacity=".7"/>
    <path d="M38 106 C18 104 16 86 32 84" fill="none" stroke="#A8532C" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="100" cy="92" rx="18" ry="6" fill="#6E2C12"/>
    <path d="M70 100 C80 96 88 96 96 100 M112 100 C120 96 128 96 138 100" fill="none" stroke="#F1C4A2" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>
    <ellipse cx="104" cy="150" rx="70" ry="8" fill="#000" opacity=".12"/>
  </svg>`;
}

/**
 * The last five weeks as small lamps: lit, kept alight by spare oil (a ring), or quiet (a faint dot).
 * Never a red mark: a missed day is just a day (docs/RETENTION.md 5.5).
 */
function lampCalendar(litDays: string[]) {
  const lit = new Set(litDays.filter((d) => !d.endsWith('*')));
  const oil = new Set(litDays.filter((d) => d.endsWith('*')).map((d) => d.slice(0, 10)));
  const today = dayKey();
  const dow = new Date(`${today}T12:00:00`).getDay();
  const start = shiftDay(today, -(28 + dow)); // five rows, Sunday first
  const names = lang() === 'th' ? ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const cells: string[] = [];
  for (let i = 0; i < 35; i++) {
    const d = shiftDay(start, i);
    const state = d > today ? 'future' : lit.has(d) ? 'lit' : oil.has(d) ? 'oil' : 'quiet';
    const label = new Date(`${d}T12:00:00`).toLocaleDateString(lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' });
    cells.push(`<li class="cal__d cal__d--${state}${d === today ? ' is-today' : ''}" title="${label}"><i></i></li>`);
  }
  return `<section class="cal" data-part="cal" aria-label="${t('ตะเกียงห้าสัปดาห์ที่ผ่านมา', 'Your lamp, last five weeks')}">
    <ol class="cal__names" aria-hidden="true">${names.map((n) => `<li>${n}</li>`).join('')}</ol>
    <ol class="cal__grid">${cells.join('')}</ol>
    <p class="cal__key muted small"><span><i class="cal__dot cal__dot--lit"></i>${t('จุดตะเกียง', 'Lit')}</span><span><i class="cal__dot cal__dot--oil"></i>${t('น้ำมันสำรองช่วยไว้', 'Kept by spare oil')}</span></p>
  </section>`;
}

/**
 * One gentle reminder the reader chooses (docs/RETENTION.md 2.4, the calendar step): a daily .ics event at
 * their time, in their calendar, removable there. Nothing is sent to us and we never notify.
 */
const utf8 = new TextEncoder();
/** RFC 5545 3.1: a line longer than 75 octets folds onto lines that start with a space (a Thai letter is 3). */
function fold(line: string) {
  let out = '', n = 0;
  for (const ch of line) {
    const b = utf8.encode(ch).length;
    if (n + b > 75) { out += '\r\n '; n = 1; }
    out += ch; n += b;
  }
  return out;
}

function remindFile(at: string) {
  const [h, m] = at.split(':').map((x) => Number(x) || 0);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (x: Date) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
  const end = new Date(d.getTime() + 5 * 60000);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const title = t('หายใจกับ Philosophew', 'Breathe with Philosophew');
  const body = t('จุดตะเกียงของวันนี้ แล้วรับประโยคของวัน', "Light today's lamp and read today's line");
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Philosophew//Lamp//TH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:lamp-${Date.now()}@philosophew.lol`, `DTSTAMP:${stamp}`, `DTSTART:${local(d)}`, `DTEND:${local(end)}`,
    'RRULE:FREQ=DAILY', `SUMMARY:${title}`, `DESCRIPTION:${body} https://philosophew.lol`, 'URL:https://philosophew.lol',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n'; // iCalendar lines end in CRLF
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'philosophew-lamp.ics';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast(t(`เปิดไฟล์นี้เพื่อเพิ่มนัดเวลา ${at} ทุกวันลงปฏิทิน`, `Open the file to add a daily ${at} event to your calendar`), ICON.download, 4200);
}

/** "Synced a minute ago", in the reader's language, or what the sync is doing now. */
function syncLine(st: SyncStatus, at: number) {
  if (st === 'syncing') return t('กำลังซิงก์…', 'Syncing…');
  if (st === 'pending') return t('มีของใหม่ จะซิงก์ในอีกครู่เดียว', 'New changes, syncing in a moment');
  if (st === 'offline') return t('ออฟไลน์อยู่ จะซิงก์เมื่อกลับมาออนไลน์', "Offline. It will sync once you're back.");
  if (st === 'error') return t('ซิงก์ไม่สำเร็จ จะลองใหม่อีกครั้งเอง', "Couldn't sync. It will try again.");
  if (!at) return t('ยังไม่ได้ซิงก์', 'Not synced yet');
  const s = Math.round((at - Date.now()) / 1000);
  if (s > -45) return t('ซิงก์แล้วเมื่อสักครู่', 'Synced just now');
  const rel = new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' });
  const when = s > -3600 ? rel.format(Math.round(s / 60), 'minute') : s > -86400 ? rel.format(Math.round(s / 3600), 'hour') : rel.format(Math.round(s / 86400), 'day');
  return t(`ซิงก์แล้ว ${when}`, `Synced ${when}`);
}

/** The Account part of /me: an invitation when signed out; the address, the sync and what can be done with it when in. */
function accountHtml() {
  const me = account.me;
  const privacy = html`<a href="/privacy">${t('นโยบายความเป็นส่วนตัว', 'Privacy policy')}</a>`;
  if (!me) return html`
    <section class="acct" data-part="acct" aria-labelledby="acct-h">
      <div class="acct__art">${capsules('waiting')}</div>
      <div class="acct__body">
        <p class="label th">${t('บัญชี', 'Account')}</p>
        <h2 class="h2" id="acct-h">${phrases(t('พาตะเกียงไปทุกเครื่อง', 'Take your lamp everywhere'))}</h2>
        <p class="muted">${phrases(t('เข้าสู่ระบบด้วย Google หรืออีเมล แล้วสมุด คอลเลกชัน และตะเกียงจะตามคุณไปทุกเครื่อง ไม่บังคับ ไม่มีบัญชีก็เล่นได้เหมือนเดิม', 'Sign in with Google or your email and your notebook, collection and lamp follow you to every device. Optional: everything works without it.'))}</p>
        <div class="row-actions"><button class="btn btn--ember btn--sm" data-acct="signin">${t('เข้าสู่ระบบ', 'Sign in')}</button><a class="btn btn--ghost btn--sm" href="/link">${t('ใช้รหัสเชื่อมเครื่อง', 'Use a link code')}</a></div>
        <p class="muted small">${privacy}</p>
      </div>
    </section>`;
  return html`
    <section class="acct is-in" data-part="acct" aria-labelledby="acct-h">
      <div class="acct__art">${capsules('joined')}</div>
      <div class="acct__body">
        <p class="label th">${t('บัญชี', 'Account')}</p>
        <h2 class="acct__email" id="acct-h">${me.email}</h2>
        <p class="acct__sync" data-acct-sync aria-live="polite">${syncHtml()}</p>
        <div class="acct__actions">
          <button class="btn btn--light btn--sm" data-acct="link">${raw(ICON.link)}${t('เชื่อมอีกเครื่อง', 'Link another device')}</button>
          <button class="btn btn--ghost btn--sm" data-acct="export">${raw(ICON.download)}${t('ส่งออกข้อมูลบัญชี', 'Export account data')}</button>
          <button class="btn btn--ghost btn--sm" data-acct="out">${t('ออกจากระบบ', 'Sign out')}</button>
          <button class="btn btn--ghost btn--sm" data-acct="out-all">${t('ออกจากทุกเครื่อง', 'Sign out everywhere')}</button>
          <button class="btn btn--ghost btn--sm danger" data-acct="delete">${t('ลบบัญชี', 'Delete account')}</button>
        </div>
        ${me.admin ? html`<p class="small"><a href="/admin">${t('หน้าผู้ดูแล', 'Moderation')}</a></p>` : ''}
        <p class="muted small">${phrases(t('บัญชีเก็บอีเมล ความคืบหน้า และรายชื่อเครื่องที่เข้าอยู่ ส่งออกหรือลบได้เองทุกเมื่อ', 'Your account keeps your email, your progress and the devices signed in. Export or delete it any time.'))} ${privacy}</p>
      </div>
    </section>`;
}
const syncHtml = () => html`<i class="acct__dot acct__dot--${account.status}"></i><span>${syncLine(account.status, account.syncedAt)}</span><button class="acct__now" data-acct="sync">${t('ซิงก์ตอนนี้', 'Sync now')}</button>`;

export async function meView() {
  setTone(null);
  chrome('full');
  const [authors, meta] = await Promise.all([loadAuthors().catch(() => ({} as Record<string, Author>)), loadMeta().catch(() => null)]);
  // which thinker each card is by, for the shelves' card counts: loaded after the first paint, then the shelves redraw
  let byCard: Map<string, string> | null = null;
  const remindAt = '21:00';
  // the control in the reader's hand keeps the focus when the page is drawn again (a language switch redraws it all)
  const focusKey = () => {
    const f = document.activeElement as HTMLElement | null;
    if (!f || !screen.contains(f)) return '';
    const attrs = [...f.attributes].filter((x) => x.name.startsWith('data-') || x.name === 'id').map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
    return attrs ? f.tagName.toLowerCase() + attrs : '';
  };
  // The page is drawn once; a change redraws only the parts it touches, and the settings answer in place. Redrawing
  // the whole page on every tap jolted the settings 12 px as the page entered again, rebuilt all 50 portraits, and
  // took the tapped button away before its click was heard.
  const parts = {
    hero: () => {
      const s = store.s, lv = levelOf(s.xp);
      return html`<header class="me__hero" data-part="hero">
        <div class="me__lamp">${raw(lampSvg(s.streak))}</div>
        <div>
          <p class="label th">${t('ตะเกียงของคุณ', 'Your lamp')}</p>
          <h1 class="h1">${s.lit ? t(`จุดแล้ว ${fmt(s.lit)} ดวง`, `${fmt(s.lit)} lamp${s.lit > 1 ? 's' : ''} lit`) : t('ยังไม่ได้จุดตะเกียง', 'Not lit yet')}</h1>
          <p class="muted">${s.streak ? t(`ติดกัน ${s.streak} วัน สถิติสูงสุด ${s.best} วัน`, `${s.streak} ${s.streak === 1 ? 'day' : 'days'} in a row. Best: ${s.best}.`) : ''} ${s.oil ? t(`น้ำมันสำรอง ${s.oil} หยด`, `Spare oil: ${s.oil} ${s.oil === 1 ? 'drop' : 'drops'}.`) : ''}</p>
          <p class="muted">${unlimited() ? t('ไฟไม่จำกัด', 'Unlimited flames.') : s.flames > maxFlames(lv.level) ? t(`ไฟวันนี้เหลือ ${s.flames} ดวง`, `${s.flames} flames left today.`) : t(`ไฟวันนี้เหลือ ${s.flames} จาก ${maxFlames(lv.level)} ดวง`, `${s.flames} of ${maxFlames(lv.level)} flames left today.`)}</p>
        </div>
      </header>`.s;
    },
    cal: () => lampCalendar(store.s.litDays),
    level: () => {
      const s = store.s, lv = levelOf(s.xp);
      const nextTitle = LEVEL_TITLES[Math.min(lv.level, LEVEL_TITLES.length - 1)];
      return html`<section class="me__level panel" data-part="level">
        <p class="me__lvnum num">${lv.level}</p>
        <div class="me__lvbody">
          <p class="label th">${t('ระดับ', 'Level')}</p>
          <p class="h2">${phrases(lv.title)}</p>
          <div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(lv.progress * 100)}"><i style="width:${(lv.progress * 100).toFixed(1)}%"></i></div>
          <p class="muted small">${t(`อีก ${fmt(xpFor(lv.level + 1) - s.xp)} XP จะถึงระดับ ${lv.level + 1} ${nextTitle[0]}`, `${fmt(xpFor(lv.level + 1) - s.xp)} XP to level ${lv.level + 1}, ${nextTitle[1]}`)}</p>
        </div>
      </section>`.s;
    },
    stats: () => {
      const s = store.s;
      const gold = Object.values(s.finish).filter((f) => f === 'gold').length;
      const foil = Object.values(s.finish).filter((f) => f === 'foil').length;
      return html`<dl class="stats" data-part="stats">
        <div><dt>${t('สุ่มไปแล้ว', 'Pulls')}</dt><dd class="num">${fmt(s.pulls)}</dd></div>
        <div><dt>${t('นักปรัชญาที่เจอ', 'Thinkers met')}</dt><dd class="num">${Object.keys(s.authors).length}<small>/${Object.keys(authors).length || 67}</small></dd></div>
        <div><dt>${t('ในสมุด', 'In notebook')}</dt><dd class="num">${Object.keys(s.notes).length}</dd></div>
        <div><dt>${t('ทองคำเปลว /' + NBSP + 'ฟอยล์', 'Gold leaf /' + NBSP + 'foil')}</dt><dd class="num">${gold}<small> ${foil}</small></dd></div>
      </dl>`.s;
    },
    acct: () => accountHtml().s,
    coll: () => {
      const s = store.s;
      // a shelf counts thinkers, a reader counts cards (four cards from three thinkers read as a card gone missing): both are said
      const cards = Object.keys(s.finish).length, met = Object.keys(s.authors).length;
      const held: Record<string, number> = {};
      if (byCard) for (const id of Object.keys(s.finish)) { const a = byCard.get(id); if (a) held[a] = (held[a] || 0) + 1; }
      return html`<section class="collection" data-part="coll">
        <h2 class="h2">${t('คอลเลกชันนักปรัชญา', 'Your philosophers')}</h2>
        <p class="muted">${t('เจอนักปรัชญาคนไหนในตู้ การ์ดของเขาจะสว่างขึ้นตรงนี้ ส่วนเงามืดที่เหลือคือคนที่ยังรอให้คุณไปเจอ', 'Meet someone in a machine and their card lights up here. The shadows are still waiting for you.')}</p>
        ${cards ? html`<p class="coll__sum">${t(`การ์ด ${fmt(cards)} ใบ จากนักปรัชญา ${fmt(met)} คน`, `${fmt(cards)} ${cards === 1 ? 'card' : 'cards'} from ${fmt(met)} ${met === 1 ? 'philosopher' : 'philosophers'}`)}</p>` : ''}
        ${SCHOOLS.map((sc) => {
          // the thinkers this machine holds (the room counts the same set): Camus, Nietzsche and Kierkegaard live in two
          const room = meta?.rooms?.[sc.id];
          const list = Object.values(authors).filter((a) => (room ? room.includes(a.id) : a.schools[0] === sc.id));
          const got = list.filter((a) => s.authors[a.id]).length;
          return html`
            <div class="coll" style="${toneStyle(sc.id)}">
              <h3 class="coll__head"><span>${L(sc.name)}</span><span class="num">${t(`${got}/${list.length} คน`, `${got}/${list.length}`)}</span></h3>
              <ul class="coll__grid">${list.map((a) => {
                const on = !!s.authors[a.id];
                // unmet, a thinker whose only free portrait is share-alike (CC BY-SA) shows the mark, not a blurred
                // copy: blurring makes an adaptation, and the licence would pass on to anything that shows it (a
                // film of this screen). Met, the portrait shows as itself, credited on the About page.
                const img = on || !/\bSA\b/.test(a.portrait?.license || '') ? a.portrait?.thumb : undefined;
                return html`<li><a class="ccard ${on ? 'is-on' : ''}" href="${on ? `/p/${a.id}` : `/s/${sc.id}`}" aria-label="${on ? authorName(a) : t('ยังไม่เจอ', 'Not met yet')}">
                  <span class="ccard__img ${on && img ? 'duo' : ''}">${img ? html`<img src="${img}" alt="" loading="lazy" width="240" height="300">` : raw(a.id === 'the-buddha' || a.portrait?.kind === 'symbol' ? DHARMA_WHEEL : mark({ size: 48 }))}</span>
                  ${on && held[a.id] > 1 ? html`<span class="ccard__count">${t(`${held[a.id]} ใบ`, `${held[a.id]} cards`)}</span>` : ''}
                  <span class="ccard__name">${on ? nameHtml(a) : '?'}</span>
                </a></li>`;
              })}</ul>
            </div>`;
        })}
      </section>`.s;
    },
    backup: () => html`<p class="muted small" data-part="backup">${account.me
      ? t('สมุด ตะเกียง และคอลเลกชันซิงก์กับบัญชีของคุณแล้ว จะดาวน์โหลดไฟล์สำรองเก็บไว้เองด้วยก็ได้', 'Your notebook, lamp and collection sync with your account. You can still keep a backup file of your own.')
      : t('สมุด ตะเกียง และคอลเลกชันอยู่ในเครื่องนี้เท่านั้น ดาวน์โหลดไฟล์สำรองเก็บไว้ แล้วนำเข้าในเครื่องอื่นได้', 'Your notebook, lamp and collection live only on this device. Download a backup file, then import it on another device.')}</p>`.s,
  };
  type Part = keyof typeof parts;
  // the account's sync line changes by itself ("a minute ago"): paintSync keeps it, it never redraws the section
  const keyOf = (k: Part, h: string) => (k === 'acct' ? h.replace(/<p class="acct__sync"[\s\S]*?<\/p>/, '') : h);
  const drawn = new Map<Part, string>();
  const part = (k: Part) => { const h = parts[k](); drawn.set(k, keyOf(k, h)); return raw(h); };
  // a segment's state, as a class and for assistive tech
  const seg = (on: boolean) => html`class="seg__b ${on ? 'is-on' : ''}" aria-pressed="${on}"`;

  const s = store.s;
  const refocus = focusKey();
  screen.innerHTML = html`
    <section class="page me">
      ${part('hero')}
      <div class="me__top"><div class="me__a">
      ${part('cal')}
      <div class="remind">
        <label class="remind__label" for="remind-at">${t('เตือนให้มาจุดตะเกียงทุกวัน', 'A daily nudge to light your lamp')}</label>
        <p class="muted small">${phrases(t('เพิ่มนัดประจำวันลงปฏิทินของคุณเอง ไม่มีการแจ้งเตือนจากเรา ลบได้ทุกเมื่อ', "Adds a daily event to your own calendar. No notifications from us. Delete it any time."))}</p>
        <div class="remind__row"><input id="remind-at" type="time" value="${remindAt}" class="input remind__time" data-remind-at><button class="btn btn--light btn--sm" data-remind>${raw(ICON.download)}${t('เพิ่มลงปฏิทิน', 'Add to calendar')}</button></div>
      </div>
      <button class="breathe-cta" data-breathe>${raw(ICON.flame)}<span><b>${t('หายใจกับตะเกียงหนึ่งนาที', 'A minute with the lamp')}</b>${phrases(t('ห้ารอบ ทำตามเปลวไฟ แล้วรับประโยคหนึ่งติดตัวไป', 'Five slow breaths with the flame, then one line to take with you'))}</span></button>
      </div><div class="me__b">
      ${part('level')}
      <button class="btn btn--light btn--sm me__card" data-profile>${raw(ICON.share)}${t('การ์ดปรัชญาของฉัน', 'My philosophy card')}</button>
      ${part('stats')}
      ${part('acct')}
      </div></div>
      ${part('coll')}
      <section class="settings panel">
        <h2 class="h2">${t('ตั้งค่า', 'Settings')}</h2>
        <div class="set">
          <span>${t('ภาษา', 'Language')}</span>
          <div class="seg"><button ${seg(lang() === 'th')} data-lang-set="th">ไทย</button><button ${seg(lang() === 'en')} data-lang-set="en">English</button></div>
        </div>
        <div class="set">
          <span>${t('ธีม', 'Theme')}</span>
          <div class="seg">${(['auto', 'light', 'dark'] as const).map((m) => html`<button ${seg(s.settings.theme === m)} data-theme-set="${m}">${m === 'auto' ? t('ตามเครื่อง', 'Auto') : m === 'light' ? t('สว่าง', 'Light') : t('มืด', 'Dark')}</button>`)}</div>
        </div>
        <label class="set"><span>${t('เสียง', 'Sound')}</span><input type="checkbox" class="switch" data-toggle="sound" ${s.settings.sound ? 'checked' : ''}></label>
        <div class="set"><span>${t('ความดัง', 'Volume')}</span><div class="seg">${([[0.5, t('เบา', 'Soft')], [0.8, t('กลาง', 'Medium')], [1, t('ดัง', 'Loud')]] as const).map(([v, l]) => html`<button ${seg(Math.abs((s.settings.volume ?? 0.8) - v) < 0.01)} data-vol="${v}">${l}</button>`)}</div></div>
        <label class="set"><span>${t('สั่นเมื่อกด (มือถือ)', 'Vibration (phones)')}</span><input type="checkbox" class="switch" data-toggle="haptics" ${s.settings.haptics ? 'checked' : ''}></label>
        <label class="set set--col"><span>${t('ชื่อที่ใช้ในอะกอรา', 'Your name in the Agora')}</span><input class="input" data-name maxlength="32" value="${s.settings.name}" placeholder="${t('เว้นว่างไว้ได้ ถ้าอยากโพสต์แบบไม่ระบุชื่อ', 'Leave empty to post anonymously')}"></label>
        <div class="set set--col">
          <span>${t('สำรองข้อมูล', 'Backup')}</span>
          ${part('backup')}
          <div class="row-actions">
            <button class="btn btn--light btn--sm" data-export>${raw(ICON.download)}${t('ดาวน์โหลดไฟล์สำรอง', 'Download backup')}</button>
            <label class="btn btn--ghost btn--sm">${t('นำเข้าไฟล์สำรอง', 'Import backup')}<input type="file" accept="application/json" data-import hidden></label>
            <button class="btn btn--ghost btn--sm danger" data-reset>${t('ล้างข้อมูลทั้งหมด', 'Erase everything')}</button>
          </div>
        </div>
      </section>
      <p class="me__about"><a href="/about">${t('เกี่ยวกับ Philosophew และแหล่งข้อมูล', 'About Philosophew and our sources')}</a></p>
    </section>`.s;
  fitPhrases(screen);
  if (refocus) screen.querySelector<HTMLElement>(refocus)?.focus({ preventScroll: true });

  /** Redraw the parts whose words changed (they stay put: no second entrance), and set the controls in place. */
  const update = () => {
    const st = store.s;
    for (const k of Object.keys(parts) as Part[]) {
      const h = parts[k]();
      if (drawn.get(k) === keyOf(k, h)) continue;
      drawn.set(k, keyOf(k, h));
      const old = screen.querySelector(`[data-part="${k}"]`);
      if (!old) continue;
      const next = el(h);
      next.classList.add('is-steady');
      old.replaceWith(next);
      fitPhrases(next);
    }
    const press = (sel: string, on: (b: HTMLElement) => boolean) => screen.querySelectorAll<HTMLElement>(sel).forEach((b) => { const v = on(b); b.classList.toggle('is-on', v); b.setAttribute('aria-pressed', String(v)); });
    press('[data-lang-set]', (b) => b.dataset.langSet === lang());
    press('[data-theme-set]', (b) => b.dataset.themeSet === st.settings.theme);
    press('[data-vol]', (b) => Math.abs((st.settings.volume ?? 0.8) - Number(b.dataset.vol)) < 0.01);
    for (const k of ['sound', 'haptics'] as const) { const i = screen.querySelector<HTMLInputElement>(`[data-toggle="${k}"]`); if (i) i.checked = st.settings[k]; }
    const name = screen.querySelector<HTMLInputElement>('[data-name]');
    if (name && document.activeElement !== name) name.value = st.settings.name;
  };
  const unsub = store.subscribe(update);
  void loadAllQuotes().then((qs) => { byCard = new Map(qs.map((q) => [q.id, q.author])); update(); }, () => {});
  // the sync redraws only its own line; signing in or out redraws the account and the backup note
  const paintSync = () => { const p = screen.querySelector('[data-acct-sync]'); if (p) p.innerHTML = syncHtml().s; };
  const unsubAcct = account.subscribe(() => { update(); paintSync(); });
  const ageing = window.setInterval(paintSync, 30000); // "a minute ago" stays true

  const acct = async (what: string, btn: HTMLButtonElement) => {
    const fail = (e: unknown) => import('./signin').then((m) => toast(m.accountError(e), ICON.info, 4200));
    if (what === 'signin') return void import('./signin').then((m) => m.openSignIn(), () => couldNotLoad('part'));
    if (what === 'link') return void import('./signin').then((m) => m.openLinkSheet(), () => couldNotLoad('part'));
    if (what === 'sync') return void sync().catch(() => {});
    if (what === 'export') {
      btn.disabled = true;
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(await exportAccount());
        a.download = `philosophew-account-${dayKey()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast(t('ดาวน์โหลดข้อมูลบัญชีแล้ว', 'Account data downloaded'), ICON.download);
      } catch (e) { void fail(e); } finally { btn.disabled = false; }
      return;
    }
    if (what === 'out') {
      let how: 'out' | 'kept' | 'later';
      try { how = await signOut(); } catch (e) { return void fail(e); } // refused: still signed in, and it says so
      sfx.toggle(false);
      return toast(how === 'later'
        ? t('ออกจากระบบในเครื่องนี้แล้ว จะเสร็จสมบูรณ์เมื่อกลับมาออนไลน์', "Signed out on this device. It finishes once you're back online.")
        : how === 'kept' ? t('ออกจากระบบแล้ว บางอย่างยังส่งขึ้นบัญชีไม่ได้ จึงยังเก็บไว้ในเครื่องนี้', 'Signed out. Some changes never reached your account, so they stay on this device.')
        : t('ออกจากระบบแล้ว ทุกอย่างเก็บอยู่ในบัญชี เข้าสู่ระบบอีกครั้งเมื่อไรก็กลับมาครบ', 'Signed out. Everything is kept in your account and comes back when you sign in.'), ICON.check, 4200);
    }
    const everywhere = what === 'out-all';
    const email = account.me?.email || '';
    const s = sheet(html`<div class="nofire"><h2 class="h1">${everywhere ? t('ออกจากระบบทุกเครื่องไหม', 'Sign out everywhere?') : t('ลบบัญชีเลยไหม', 'Delete your account?')}</h2>
      <p>${everywhere
        ? t('ทุกเครื่องที่เข้าบัญชีนี้อยู่ รวมถึงเครื่องนี้ จะออกจากระบบ ส่วนบัญชียังเก็บทุกอย่างไว้ครบ เข้าสู่ระบบอีกครั้งเมื่อไรก็กลับมา', 'Every device signed in to this account, this one too, will be signed out. The account keeps everything, and it all comes back when you sign in.')
        : t(`บัญชี ${email} และทุกอย่างที่เก็บไว้ในบัญชี ทั้งความคืบหน้าและรายชื่อเครื่องที่เข้าอยู่ จะถูกลบถาวรทันที กู้คืนไม่ได้ ส่วนข้อมูลในเครื่องนี้ยังอยู่ ลบได้ที่ “ล้างข้อมูลทั้งหมด”`, `The account ${email} and everything it holds, your progress and the list of your devices, will be deleted for good, right away. There is no undo. What is on this device stays; erase it with “Erase everything”.`)}</p>
      <div class="row-actions"><button class="btn btn--ghost" data-close>${t('ยกเลิก', 'Cancel')}</button><button class="btn" style="--b:var(--bad)" data-really>${everywhere ? t('ออกจากทุกเครื่อง', 'Sign out everywhere') : t('ลบบัญชีถาวร', 'Delete for good')}</button></div></div>`,
    { label: everywhere ? t('ออกจากทุกเครื่อง', 'Sign out everywhere') : t('ลบบัญชี', 'Delete account') });
    const really = s.el.querySelector<HTMLButtonElement>('[data-really]')!;
    really.addEventListener('click', async () => {
      really.disabled = true;
      try {
        if (everywhere) await signOut(true); else await deleteAccount();
        s.close();
        toast(everywhere ? t('ออกจากระบบทุกเครื่องแล้ว', 'Signed out everywhere') : t('ลบบัญชีแล้ว ข้อมูลในเครื่องนี้ยังอยู่', 'Account deleted. What is on this device is still here.'), ICON.check, 4200);
      } catch (e) {
        really.disabled = false;
        void fail(e);
      }
    });
  };

  const click = async (e: Event) => {
    const el = e.target as HTMLElement;
    const a = el.closest<HTMLButtonElement>('[data-acct]');
    if (a) return acct(a.dataset.acct!, a);
    if (el.closest('[data-breathe]')) return void import('./breathe').then((m) => m.openBreathe(), () => couldNotLoad('part'));
    if (el.closest('[data-profile]')) return void import('./profile').then((m) => m.openProfile(), () => couldNotLoad('part'));
    if (el.closest('[data-remind]')) return remindFile(screen.querySelector<HTMLInputElement>('[data-remind-at]')?.value || '21:00');
    const lg = el.closest<HTMLElement>('[data-lang-set]');
    if (lg) return switchLang(lg.dataset.langSet as 'th' | 'en');
    const vol = el.closest<HTMLElement>('[data-vol]');
    if (vol) { setVolume(Number(vol.dataset.vol)); sfx.levelup(); return; }
    const th = el.closest<HTMLElement>('[data-theme-set]');
    if (th) { store.update((s) => { s.settings.theme = th.dataset.themeSet as 'auto' | 'light' | 'dark'; }); applyTheme(); return; }
    if (el.closest('[data-export]')) {
      const blob = new Blob([store.exportJson()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `philosophew-backup-${dayKey()}.json`; // the reader's own date, not UTC
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(t('ดาวน์โหลดไฟล์สำรองแล้ว', 'Backup downloaded'), ICON.download);
    }
    if (el.closest('[data-reset]')) {
      // signed in, this device signs out first: an empty notebook must never be sent to the account as the new truth
      const inAcct = !!account.me;
      const s = sheet(html`<div class="nofire"><h2 class="h1">${t('ล้างข้อมูลทั้งหมดเลยไหม', 'Erase everything?')}</h2><p>${inAcct
        ? t('สมุด ตะเกียง ระดับ และคอลเลกชันในเครื่องนี้จะหายทั้งหมด และเครื่องนี้จะออกจากระบบ ส่วนข้อมูลในบัญชียังอยู่ครบ ถ้าอยากลบบัญชีด้วย ใช้ปุ่ม “ลบบัญชี” ด้านบน', 'Your notebook, lamp, level and collection on this device will be gone, and this device will be signed out. Your account keeps everything; to delete it too, use “Delete account” above.')
        : t('สมุด ตะเกียง ระดับ และคอลเลกชันในเครื่องนี้จะหายทั้งหมด กู้คืนไม่ได้ถ้าไม่มีไฟล์สำรอง', 'Your notebook, lamp, level and collection on this device will be gone. There is no undo without a backup file.')}</p><div class="row-actions"><button class="btn btn--ghost" data-close>${t('ยกเลิก', 'Cancel')}</button><button class="btn" style="--b:var(--bad)" data-really>${t('ล้างเลย', 'Erase')}</button></div></div>`, { label: t('ล้างข้อมูล', 'Erase data') });
      s.el.querySelector('[data-really]')!.addEventListener('click', async () => {
        if (inAcct) {
          try { await signOut(); } catch (e) {
            // still signed in: nothing is erased (an empty device would become the account's copy)
            s.close();
            return void import('./signin').then((m) => toast(m.accountError(e), ICON.info, 4200));
          }
        }
        store.reset();
        forgetDevice();
        s.close();
        toast(t('ล้างข้อมูลแล้ว', 'Everything erased'));
      });
    }
  };
  const change = async (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.toggle) {
      const k = el.dataset.toggle as 'sound' | 'haptics';
      store.update((s) => { s.settings[k] = el.checked; });
      if (k === 'sound') sfx.toggle(el.checked);
    }
    if (el.matches('[data-name]')) { store.update((s) => { s.settings.name = el.value.trim().slice(0, 32); }); toast(t('บันทึกชื่อแล้ว', 'Name saved')); }
    if (el.matches('[data-import]') && el.files?.[0]) {
      const file = el.files[0];
      el.value = ''; // choosing the same file again still counts
      let next: ReturnType<typeof readBackup>;
      try { next = readBackup(await file.text()); }
      catch { toast(t('ไฟล์นี้อ่านไม่ได้ ไม่ใช่ไฟล์สำรองของ Philosophew', "That file can't be read. It isn't a Philosophew backup.")); return; }
      // signed in, a backup joins the account's progress (merged, nothing lost) rather than replacing it everywhere
      if (account.me) {
        store.restore(merge(store.s, next as State));
        return toast(t('รวมไฟล์สำรองเข้ากับบัญชีแล้ว', 'Backup merged into your account'), ICON.check);
      }
      const done = () => { store.restore(next); toast(t('นำเข้าข้อมูลแล้ว', 'Backup imported'), ICON.check); };
      const mine = Object.keys(store.s.notes).length;
      if (!mine && !store.s.pulls) return done();
      // a notebook is personal: never replace one without a clear yes
      const theirs = Object.keys(next.notes).length;
      const s = sheet(html`<div class="nofire"><h2 class="h1">${t('แทนที่ข้อมูลในเครื่องนี้ไหม', 'Replace what is on this device?')}</h2><p>${t(`ไฟล์นี้มี ${fmt(theirs)} ประโยคในสมุด และจุดตะเกียงมาแล้ว ${fmt(next.lit)} ดวง ข้อมูลทั้งหมดในเครื่องนี้ รวมถึง ${fmt(mine)} ประโยคในสมุด จะถูกแทนที่`, `This file holds ${fmt(theirs)} lines in its notebook and ${fmt(next.lit)} lamps lit. Everything on this device, including the ${fmt(mine)} lines in its notebook, will be replaced.`)}</p><div class="row-actions"><button class="btn btn--ghost" data-close>${t('ยกเลิก', 'Cancel')}</button><button class="btn btn--ember" data-really>${t('แทนที่', 'Replace')}</button></div></div>`, { label: t('นำเข้าไฟล์สำรอง', 'Import backup') });
      s.el.querySelector('[data-really]')!.addEventListener('click', () => { s.close(); done(); });
    }
  };
  screen.addEventListener('click', click);
  screen.addEventListener('change', change);
  return () => { unsub(); unsubAcct(); clearInterval(ageing); screen.removeEventListener('click', click); screen.removeEventListener('change', change); };
}
