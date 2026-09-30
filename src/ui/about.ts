import { html, raw, fmt } from '../core/dom';
import { loadAuthors, loadLibraryIndex, loadMeta, type Author, type LibraryIndex } from '../core/data';
import { screen, setTone, chrome } from './shell';
import { ICON, mark } from './icons';
import { nameHtml } from './card';
import { t } from '../core/i18n';

/** The dataset licences as their sources wrote them ("cc", "mit"), said the same way every time. */
const licence = (raw: string) => ({
  cc: t('ครีเอทีฟคอมมอนส์ (ไม่ระบุรุ่น)', 'Creative Commons (version not stated)'),
  mit: 'MIT',
  'not stated': t('ไม่ได้ระบุ', 'Not stated'),
  'not stated (editorial site)': t('ไม่ได้ระบุ (เว็บไซต์บทความ)', 'Not stated (editorial site)'),
} as Record<string, string>)[raw.trim().toLowerCase()] ?? raw;


/** The project's own accounts (scripts/prerender.mjs SOCIAL lists the same for search engines). */
const SOCIAL: [string, string][] = [['Instagram', 'https://www.instagram.com/philoso.phew/'], ['TikTok', 'https://www.tiktok.com/@philoso.phew']];
export async function aboutView() {
  setTone(null);
  chrome('full');
  const [authors, index, meta] = await Promise.all([
    loadAuthors().catch(() => ({} as Record<string, Author>)),
    loadLibraryIndex().catch(() => null as LibraryIndex | null),
    loadMeta().catch(() => null),
  ]);
  const withImg = Object.values(authors).filter((a) => a.portrait?.file);
  screen.innerHTML = html`
    <section class="page about">
      <header class="about__hero">
        ${raw(mark({ size: 72 }))}
        <h1 class="display">philoso<em>phew</em></h1>
        <p class="about__lead">${t('ปรัชญา แต่ทำให้ใจได้หายใจออก ตู้กาชาปองที่สุ่มคำคมจากนักปรัชญาตัวจริง พร้อมแหล่งที่มาที่ตรวจสอบได้ ให้คุณเก็บ คิด และแชร์ต่อ', 'Philosophy that lets you breathe out. A gacha machine of real philosophers’ words, with sources you can check, to keep, think about and share.')}</p>
      </header>

      <section class="about__sec">
        <h2 class="h2">${t('ใช้ยังไง', 'How it works')}</h2>
        <ol class="steps">
          <li><b>${t('หายใจ', 'Breathe')}</b><span>${t('ทุกวันเริ่มด้วยการหายใจลึกๆ สักครั้ง เพื่อจุดตะเกียงและเติมไฟไว้หมุนตู้', 'Each day starts with one deep breath. It lights your lamp and fills your flames.')}</span></li>
          <li><b>${t('เลือกตู้ตามใจ', 'Pick by feeling')}</b><span>${t('ห้าสำนักคิด ห้าตู้ ห้าวิธีสุ่ม ถ้าไม่รู้จะเลือกตู้ไหน ก็บอกเราว่าวันนี้ใจเป็นยังไง', 'Five schools, five machines, five ways to draw. Not sure? Tell us how you feel today.')}</span></li>
          <li><b>${t('รับการ์ด', 'Get a card')}</b><span>${t('การ์ดมีภาพจริงของผู้พูด คำแปลไทย และที่มา บางใบเป็นฟอยล์ และนานๆ\u00A0ทีจะได้ทองคำเปลว', 'Cards show the real person, the words, and where they come from. Some are foil; a few are gold leaf.')}</span></li>
          <li><b>${t('เก็บ เขียน แชร์', 'Keep, write, share')}</b><span>${t('เก็บลงสมุด เขียนความคิดเพื่อรับไฟคืน แชร์เป็นรูป หรือโพสต์ลงอะกอราให้คนอื่นอ่าน', 'Keep it, write a reflection to earn a flame back, share it as an image, or post it to the Agora.')}</span></li>
        </ol>
      </section>

      <section class="about__sec">
        <h2 class="h2">${t('เราตรวจที่มายังไง', 'How we check sources')}</h2>
        <ul class="vlist">
          <li><span class="verify verify--primary">${raw(ICON.seal)}<span>${t('จากต้นฉบับ', 'Primary source')}</span></span>${t('เจอประโยคนี้ในตัวบทต้นฉบับ พร้อมระบุเล่ม บท และผู้แปลเมื่อรู้ชื่อ', 'Found in the primary text, with the work, the section and, where known, the translator.')}</li>
          <li><span class="verify verify--sourced">${raw(ICON.seal)}<span>${t('มีแหล่งอ้างอิง', 'Sourced')}</span></span>${t('มีแหล่งอ้างอิงที่ตรวจสอบได้ว่าเป็นคำพูดของท่าน', 'Tied to the author by a checkable source.')}</li>
          <li><span class="verify verify--attributed">${raw(ICON.info)}<span>${t('เล่าต่อกันมา', 'Attributed')}</span></span>${t('เล่าต่อกันมาว่าเป็นคำพูดของท่าน แต่เรายังหาต้นฉบับไม่เจอ', 'Widely credited to them, but we have not found the original yet.')}</li>
        </ul>
        <p class="muted">${t('คำคมที่ Wikiquote หรือแหล่งตรวจสอบอื่นระบุว่าอ้างผิดคน เราไม่ใส่ในตู้ และรวบรวมประโยคที่ดังที่สุดไว้ในหัวข้อ “ไม่ได้พูด แต่คนชอบแชร์” ในหน้าของนักปรัชญาคนนั้น', 'Quotes that Wikiquote or other checkers list as misattributed never enter the machines. The famous ones are collected under “Never said it, often shared” on that philosopher’s page.')}</p>
      </section>

      <section class="about__sec">
        <h2 class="h2">${t('ข้อมูลของเรา', 'Our data')}</h2>
        <dl class="stats">
          <div><dt>${t('คำคมคัดสรร (แปลไทย)', 'Curated, translated')}</dt><dd class="num">${fmt(meta?.total || 0)}</dd></div>
          <div><dt>${t('ในหอสมุด', 'In the library')}</dt><dd class="num">${fmt(index?.total || 0)}</dd></div>
          <div><dt>${t('นักคิด', 'Thinkers')}</dt><dd class="num">${Object.keys(authors).length}</dd></div>
          <div><dt>${t('ภาพจริง', 'Real portraits')}</dt><dd class="num">${withImg.filter((a) => a.portrait!.kind !== 'papyrus').length}</dd></div>
        </dl>
        ${index ? html`
        <table class="srcs">
          <thead><tr><th>${t('แหล่ง', 'Source')}</th><th>${t('เก็บไว้', 'Kept')}</th><th>${t('สัญญาอนุญาต', 'License')}</th></tr></thead>
          <tbody>${index.sources.filter((s) => s.rows_kept > 0).map((s) => html`<tr><td><a href="${s.url}" target="_blank" rel="noopener" data-external>${s.name}</a></td><td class="num">${fmt(s.rows_kept)}</td><td>${licence(s.license)}</td></tr>`)}</tbody>
        </table>` : ''}
      </section>

      <section class="about__sec">
        <h2 class="h2">${t('ภาพนักปรัชญา', 'Portraits')}</h2>
        <p class="muted">${t('ภาพทั้งหมดมาจาก Wikimedia Commons และ Internet Archive ตามสัญญาอนุญาตของแต่ละภาพ พระพุทธเจ้าและหลวงพ่อชา เราใช้สัญลักษณ์แทนภาพบุคคลด้วยความเคารพ', 'All portraits come from Wikimedia Commons and the Internet Archive under each file’s license. For the Buddha and Ajahn Chah we use a symbol instead of a figure, out of respect.')}</p>
        <ul class="credits">${withImg.map((a) => html`<li><a href="/p/${a.id}">${nameHtml(a)}</a> <span class="muted">${a.portrait!.artist ? `${a.portrait!.artist}, ` : ''}<span class="nobr">${a.portrait!.license || ''}</span></span> ${a.portrait!.source ? html`<a href="${a.portrait!.source}" target="_blank" rel="noopener" data-external aria-label="${/archive\.org/.test(a.portrait!.source) ? 'Internet Archive' : 'Wikimedia Commons'}">${raw(ICON.link)}</a>` : ''}</li>`)}</ul>
      </section>

      <section class="about__sec">
        <h2 class="h2">${t('ความเป็นส่วนตัว', 'Privacy')}</h2>
        <p>${t('สมุด ตะเกียง และคอลเลกชันของคุณอยู่ในเครื่องนี้ ถ้าเข้าสู่ระบบก็อยู่ในบัญชีของคุณด้วย มีแค่คุณที่เปิดดูได้ เราไม่ใช้ตัวติดตามโฆษณา เวลาโพสต์หรือกด phew เราเก็บค่าแฮชของ IP ที่ย้อนกลับไม่ได้ไว้กันสแปม โพสต์ในอะกอราจะขึ้นหลังผู้ดูแลอ่านแล้วเท่านั้น และคุณเลือกได้ว่าจะใส่ชื่อหรือไม่', 'Your notebook, lamp and collection stay on this device. If you sign in, they are also kept in your account, which only you can open. No ad trackers. When you post or send a phew we keep a one-way hash of your IP, only to limit spam. Agora posts go live only after a moderator reads them, and you decide whether to show a name.')}</p>
        <p>${t('เล่นได้โดยไม่ต้องมีบัญชี ถ้าเลือกเข้าสู่ระบบด้วย Google หรือด้วยรหัสทางอีเมล เราใช้อีเมลและรหัสบัญชีเพื่อยืนยันว่าเป็นคุณ และซิงก์ความคืบหน้าข้ามเครื่องเท่านั้น', 'No account is needed to play. If you choose to sign in with Google or an email code, we use your email and account ID only to sign you in and sync your progress between devices.')}</p>
        <p><a class="about__more" href="/privacy">${t('อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม', 'Read the full privacy policy')}</a></p>
      </section>
      <section class="about__sec">
        <h2 class="h2">${t('ติดต่อเรา', 'Contact')}</h2>
        <p>${t('เจอคำคมที่อ้างผิดคน มีคำถาม หรืออยากชวนทำอะไรด้วยกัน เขียนมาหาเราได้เลย', 'Found a line credited to the wrong person, have a question, or an idea to work on together? Write to us.')}</p>
        <p><a class="about__mail" href="mailto:philosophew@yahoo.com">philosophew@yahoo.com</a></p>
        <p class="about__social">${SOCIAL.map(([name, href]) => html`<a href="${href}" target="_blank" rel="me noopener" data-external>${name} <span class="about__handle">@philoso.phew</span></a>`)}</p>
      </section>
    </section>`.s;
}

export function notFoundView() {
  setTone(null);
  chrome('full');
  screen.innerHTML = html`
    <section class="page">
      <div class="empty empty--paper">
        <p class="display">404</p>
        <h1 class="h2">${t('หน้านี้ไม่มีอยู่จริง หรือเราแค่คิดไปเองว่ามันไม่มี', 'This page does not exist. Or maybe we only think it doesn’t.')}</h1>
        <p class="muted">${t('เดการ์ตคงบอกว่า อย่างน้อยคุณที่กำลังสงสัยอยู่ก็มีอยู่จริง', 'Descartes would point out that you, doubting, certainly exist.')}</p>
        <a class="btn btn--ember" href="/">${t('กลับไปที่ตู้', 'Back to the machines')}</a>
      </div>
    </section>`.s;
}
