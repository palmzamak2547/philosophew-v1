// The privacy policy in both languages: one source for the app's /privacy (src/ui/privacy.ts) and the static page
// scripts/prerender.mjs writes, which is what crawlers and Google's OAuth brand review read. Keep it true: when what we
// collect changes (api/index.ts, src/core/account.ts), change this and UPDATED together.
export type Pair = readonly [th: string, en: string];
export type Section = { id: string; h: Pair; p?: Pair[]; li?: Pair[]; after?: Pair[] };

export const UPDATED: Pair = ['ปรับปรุงล่าสุด 30 กันยายน 2569', 'Last updated 30 September 2026'];
export const TITLE: Pair = ['นโยบายความเป็นส่วนตัว', 'Privacy policy'];
export const INTRO: Pair = [
  'Philosophew (philosophew.lol) คือเว็บแอปสุ่มคำคมจากนักปรัชญาตัวจริง นโยบายนี้บอกตรงๆ ว่าเราเก็บข้อมูลอะไร เก็บไว้ทำอะไร เก็บที่ไหน นานแค่ไหน ใครเห็นได้บ้าง และคุณลบได้อย่างไร',
  'Philosophew (philosophew.lol) is a web app that draws quotes from real philosophers. This policy says plainly what we keep, why, where, for how long, who can see it, and how you delete it.',
];
// Google asks for this sentence as written; the Thai says the same
export const LIMITED_USE: Pair = [
  'การใช้และการส่งต่อข้อมูลที่ Philosophew ได้รับจาก Google APIs เป็นไปตาม Google API Services User Data Policy รวมถึงข้อกำหนดเรื่องการใช้งานแบบจำกัด (Limited Use)',
  'Philosophew’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.',
];

export const SECTIONS: Section[] = [
  {
    id: 'no-account', h: ['เล่นได้โดยไม่ต้องมีบัญชี', 'No account needed'],
    p: [
      ['ถ้าไม่เข้าสู่ระบบ ตะเกียง ไฟ คอลเลกชัน สมุด และการตั้งค่าของคุณ เก็บอยู่ในเบราว์เซอร์บนเครื่องของคุณเอง (localStorage) เท่านั้น ไม่ได้ส่งมาหาเรา และเราก็ไม่รู้ว่าคุณเป็นใคร',
        'Without an account, your lamp, flames, collection, notebook and settings are kept only in your own browser on your device (localStorage). They are not sent to us, and we do not know who you are.'],
      ['เราไม่ใช้คุกกี้โฆษณา ไม่ใช้ตัวติดตาม และไม่ใช้เครื่องมือวิเคราะห์ของบุคคลที่สาม ฟอนต์และไฟล์ทั้งหมดส่งจากเว็บของเราเอง',
        'We use no advertising cookies, no trackers and no third-party analytics. Fonts and files are all served from our own site.'],
    ],
  },
  {
    id: 'account', h: ['บัญชี (ไม่บังคับ)', 'Your account (optional)'],
    p: [['ถ้าคุณเลือกเข้าสู่ระบบด้วย Google หรือด้วยรหัสที่ส่งทางอีเมล เพื่อให้ความคืบหน้าตามไปทุกเครื่อง เราจะเก็บ',
      'If you choose to sign in, with Google or with a code sent to your email, so your progress follows you to every device, we keep:']],
    li: [
      ['อีเมลของคุณ ใช้ระบุบัญชีและส่งรหัสเข้าสู่ระบบ', 'your email address, to identify your account and send sign-in codes'],
      ['รหัสบัญชี Google (เมื่อเข้าสู่ระบบด้วย Google) ใช้จำว่าบัญชีนี้เป็นของคุณ', 'your Google account ID, when you sign in with Google, to recognise your account'],
      ['ความคืบหน้าที่บันทึกไว้ คือตะเกียง ไฟ คอลเลกชัน สมุด และการตั้งค่า ใช้ซิงก์ข้ามเครื่อง', 'your saved progress (lamp, flames, collection, notebook and settings), to sync it between your devices'],
      ['อุปกรณ์ที่เข้าสู่ระบบอยู่และเวลาที่ใช้ล่าสุด เพื่อให้คุณอยู่ในระบบต่อได้ และออกจากระบบทุกเครื่องได้ในครั้งเดียว', 'the devices signed in and when each was last used, to keep you signed in and to let you sign out of all of them at once'],
    ],
    after: [['เราไม่ขอรหัสผ่าน เพราะบัญชีของเราไม่มีรหัสผ่าน', 'We never ask for a password: our accounts have none.']],
  },
  {
    id: 'google', h: ['ข้อมูลจาก Google', 'Google user data'],
    p: [
      ['เมื่อคุณเข้าสู่ระบบด้วย Google เราขอเฉพาะสิทธิ์พื้นฐานสำหรับการเข้าสู่ระบบ (openid, email, profile) Google ส่งอีเมล สถานะการยืนยันอีเมล รหัสบัญชี ชื่อ และรูปโปรไฟล์มาให้ เราเก็บไว้แค่อีเมลและรหัสบัญชี ส่วนชื่อและรูปไม่ถูกเก็บ',
        'When you sign in with Google we ask only for the basic sign-in scopes (openid, email, profile). Google sends us your email address, whether it is verified, your account ID, your name and your profile picture. We keep only the email address and the account ID; the name and picture are not stored.'],
      ['เราใช้ข้อมูลนี้เพื่อยืนยันว่าเป็นคุณ และซิงก์ความคืบหน้าของคุณข้ามเครื่องเท่านั้น', 'We use it only to sign you in and to sync your progress across your devices.'],
      ['เราไม่ขาย ไม่ให้เช่า ไม่แลกเปลี่ยน และไม่เปิดเผยข้อมูลจาก Google แก่ผู้อื่น ไม่ใช้เพื่อโฆษณา ไม่ใช้ประเมินเครดิตหรือความน่าเชื่อถือ และไม่ใช้ฝึกหรือพัฒนาโมเดล AI หรือ machine learning',
        'We do not sell, rent, trade or disclose Google user data to anyone. We do not use it for advertising, to judge credit or trustworthiness, or to train or improve any AI or machine learning model.'],
      LIMITED_USE,
      ['คุณยกเลิกสิทธิ์ที่ให้ Philosophew ได้ทุกเมื่อที่ myaccount.google.com/permissions และลบบัญชีพร้อมข้อมูลทั้งหมดได้เองที่หน้า “ฉัน”',
        'You can revoke Philosophew’s access at any time at myaccount.google.com/permissions, and delete your account with all its data yourself from the “Me” page.'],
    ],
  },
  {
    id: 'email', h: ['รหัสเข้าสู่ระบบทางอีเมล', 'Sign-in codes by email'],
    p: [['เราส่งรหัส 6 หลักผ่าน Resend (resend.com) ผู้ให้บริการส่งอีเมล ซึ่งเห็นอีเมลของคุณเพื่อส่งจดหมายฉบับนั้นเท่านั้น รหัสหมดอายุใน 10 นาที และเราเก็บไว้เป็นค่าแฮชที่ย้อนกลับไม่ได้',
      'We send a six-digit code through Resend (resend.com), an email delivery service, which sees your email address only to deliver that message. The code expires in 10 minutes, and we store it only as a one-way hash.']],
  },
  {
    id: 'agora', h: ['อะกอรา', 'The Agora'],
    p: [['โพสต์ในอะกอราเป็นสาธารณะ และจะขึ้นหลังผู้ดูแลอ่านแล้วเท่านั้น คุณเลือกได้ว่าจะใส่ชื่อหรือไม่ เวลาโพสต์หรือกด phew เราเก็บค่าแฮชของ IP ที่ย้อนกลับไม่ได้ ไว้จำกัดสแปมเท่านั้น',
      'Agora posts are public and go live only after a moderator reads them. You decide whether to show a name. When you post or send a phew we keep a one-way hash of your IP address, only to limit spam.']],
  },
  {
    id: 'cookies', h: ['คุกกี้', 'Cookies'],
    p: [['เราใช้คุกกี้เพียงตัวเดียว คือคุกกี้เซสชันที่ตั้งเมื่อคุณเข้าสู่ระบบ ใช้รู้ว่าเป็นคุณเท่านั้น ถ้าไม่เข้าสู่ระบบ ก็ไม่มีคุกกี้ของเราเลย',
      'We use a single cookie: a session cookie set when you sign in, used only to know it is you. If you do not sign in, we set no cookies at all.']],
  },
  {
    id: 'where', h: ['เก็บที่ไหน และดูแลอย่างไร', 'Where it is kept, and how we protect it'],
    p: [
      ['ข้อมูลบัญชีเก็บในฐานข้อมูล Neon Postgres ที่ศูนย์ข้อมูลในสิงคโปร์ เว็บไซต์ให้บริการผ่าน Vercel การเชื่อมต่อทุกครั้งเข้ารหัสด้วย HTTPS คุกกี้เซสชันและรหัสทางอีเมลเก็บเป็นค่าแฮช มีเพียงทีม Philosophew ที่เข้าถึงฐานข้อมูลได้ และเข้าถึงเมื่อต้องแก้ปัญหาเท่านั้น',
        'Account data is stored in a Neon Postgres database in Singapore. The site is served by Vercel. Every connection is encrypted with HTTPS. Session cookies and email codes are stored only as hashes. Only the Philosophew team can reach the database, and only to fix problems.'],
      ['ผู้ให้บริการโฮสติ้งอาจเก็บบันทึกทางเทคนิคของการเข้าชม เช่น ที่อยู่ IP ไว้ชั่วคราวเพื่อความปลอดภัยของระบบ',
        'Our hosting provider may keep technical request logs, such as IP addresses, for a short time to keep the service secure.'],
    ],
  },
  {
    id: 'retention', h: ['เก็บนานแค่ไหน', 'How long we keep it'],
    li: [
      ['รหัสทางอีเมลใช้ได้ 10 นาที บันทึกการส่ง (อีเมล และค่าแฮชของ IP) เก็บไว้ 1 วันเพื่อจำกัดจำนวนครั้งที่ส่ง', 'Email codes work for 10 minutes; the record of each send (the address and a hash of the IP) is kept for a day, to limit how many are sent'],
      ['การเข้าสู่ระบบบนแต่ละเครื่อง หมดอายุเมื่อไม่ได้ใช้ 180 วัน', 'A sign-in on each device: it expires after 180 days without use'],
      ['ข้อมูลบัญชีและความคืบหน้า จนกว่าคุณจะลบบัญชี', 'Account data and progress: until you delete your account'],
      ['โพสต์ในอะกอรา จนกว่าผู้ดูแลจะลบ หรือคุณขอให้เราลบ', 'Agora posts: until a moderator removes them or you ask us to'],
    ],
  },
  {
    id: 'rights', h: ['สิทธิ์ของคุณ', 'Your rights'],
    p: [['ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) คุณขอดู ขอสำเนา แก้ไข ลบ หรือคัดค้านการใช้ข้อมูลของคุณได้ ดาวน์โหลดข้อมูลทั้งหมดหรือลบบัญชีได้เองที่หน้า “ฉัน” หรือเขียนมาหาเรา และร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลได้',
      'Under Thailand’s Personal Data Protection Act (PDPA) you may ask to see, copy, correct or delete your data, or object to its use. You can download all your data or delete your account yourself from the “Me” page, or write to us. You may also complain to Thailand’s Personal Data Protection Committee.']],
  },
  {
    id: 'children', h: ['เด็ก', 'Children'],
    p: [['ถ้าคุณอายุต่ำกว่า 13 ปี โปรดให้ผู้ปกครองช่วยตัดสินใจก่อนสร้างบัญชี เล่นโดยไม่มีบัญชีได้เสมอ', 'If you are under 13, please ask a parent or guardian before creating an account. You can always play without one.']],
  },
  {
    id: 'changes', h: ['เมื่อนโยบายนี้เปลี่ยน', 'Changes to this policy'],
    p: [['ถ้าเราแก้นโยบายนี้ เราจะเปลี่ยนวันที่ด้านบน และถ้าเป็นเรื่องสำคัญจะแจ้งในแอปก่อน', 'If we change this policy we will update the date at the top, and tell you in the app first if the change matters.']],
  },
  {
    id: 'contact', h: ['ติดต่อเรา', 'Contact'],
    p: [['ผู้ควบคุมข้อมูลคือทีม Philosophew มีคำถาม หรืออยากใช้สิทธิ์ข้อไหน เขียนมาได้ที่ philosophew@yahoo.com', 'Philosophew is the data controller. For any question, or to use any of your rights, write to philosophew@yahoo.com.']],
  },
];

// the words that become links, in either language (applied after escaping)
const LINKS: [text: string, href: string][] = [
  ['philosophew@yahoo.com', 'mailto:philosophew@yahoo.com'],
  ['myaccount.google.com/permissions', 'https://myaccount.google.com/permissions'],
  ['Google API Services User Data Policy', 'https://developers.google.com/terms/api-services-user-data-policy'],
];
export const linkify = (escaped: string) => LINKS.reduce((s, [text, href]) => s.replace(text, `<a href="${href}"${href.startsWith('http') ? ' rel="noopener" target="_blank"' : ''}>${text}</a>`), escaped);
