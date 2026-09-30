// Page titles, written once for the prerendered HTML (scripts/prerender.mjs) and for the tab once the app runs, so an
// engine that runs scripts (Google) and one that does not (most others, link previews, AI crawlers) read the same
// name for a page. Thai first, like the pages; English is the reader's own switch. Only what the router names lives
// here (this file ships in the entry); titles made from a quote or a thinker are in seo-pages.ts, loaded with them.
import { t } from '../core/i18n';
import type { School } from './schools';

export const named = (s: string) => `${s} | Philosophew`;

export const titles = {
  home: () => t('Philosophew | สุ่มคำคมปรัชญา แล้วหายใจออก', 'Philosophew | Pull a quote. Breathe out.'),
  school: (s: School) => named(t(`${s.name.th} (${s.sub.th}) ${s.tagline.th}`, `${s.machine.name.en} | ${s.name.en}`)),
  library: () => named(t('หอสมุดคำคมนักปรัชญา พร้อมที่มา', 'The Library')),
  about: () => named(t('เกี่ยวกับเรา ใช้ยังไง และเราตรวจที่มายังไง', 'About')),
  agora: () => named(t('อะกอรา ลานแลกความคิด', 'The Agora')),
  privacy: () => named(t('นโยบายความเป็นส่วนตัว', 'Privacy policy')),
  notes: () => named(t('สมุดของฉัน', 'My notebook')),
  me: () => named(t('ฉัน', 'Me')),
  admin: () => named(t('ผู้ดูแล', 'Moderators')),
  link: () => named(t('เชื่อมเครื่อง', 'Link a device')),
  notFound: () => named(t('ไม่พบหน้านี้', 'Page not found')),
};
