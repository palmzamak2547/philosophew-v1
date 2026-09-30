import { isEn } from '../core/i18n';

export type SchoolId = 'stoic' | 'existential' | 'eastern' | 'absurd' | 'socratic';
export interface Tx { th: string; en: string }
/** Pick the current language from a {th, en} pair. */
export const L = <T,>(x: { th: T; en: T }): T => (isEn() ? x.en : x.th);
/** The space a Thai sentence puts around a school's name: one when the name is in Latin letters (ลองตู้ Existential ดูไหม), none for a Thai name (ลองตู้สโตอิกดูไหม). */
export const latinGap = (name: string) => (/^[A-Za-z]/.test(name) ? ' ' : '');

export interface Palette { bg: string; bg2: string; ink: string; accent: string; accent2: string; glow: string }

export interface School {
  id: SchoolId;
  name: Tx;   // the big title (English where the Thai transliteration reads awkwardly)
  sub: Tx;    // the line under it
  short: Tx;  // chips and card labels
  tagline: Tx;
  forWho: Tx;
  keywords: { th: string[]; en: string[] };
  machine: { name: Tx; action: Tx; hint: Tx; motto: Tx; busy: Tx; still?: Tx }; // still: the hint where shaking is off (an iPhone that has not said yes)
  palette: Palette;
  dark: boolean;
}

export const SCHOOLS: School[] = [
  {
    id: 'stoic',
    name: { th: 'สโตอิก', en: 'Stoicism' },
    sub: { th: 'Stoicism', en: 'The Stoics' },
    short: { th: 'สโตอิก', en: 'Stoic' },
    tagline: { th: 'ปรัชญาแห่งความมั่นคงทางใจ', en: 'The philosophy of a steady mind' },
    forWho: { th: 'อยากฝึกคุมอารมณ์ ปล่อยวางสิ่งที่ควบคุมไม่ได้ และรับมือกับความเครียด', en: 'you want to master your emotions, let go of what you cannot control, and handle stress.' },
    keywords: { th: ['วินัย', 'การยอมรับ', 'เหตุผล', 'ความเข้มแข็ง'], en: ['discipline', 'acceptance', 'reason', 'strength'] },
    machine: {
      name: { th: 'ตู้สำริดแห่งระเบียงหิน', en: 'The Bronze Stoa' },
      action: { th: 'หมุนด้ามจับ', en: 'Turn the crank' },
      hint: { th: 'ลากด้ามจับตามเข็มนาฬิกาให้ครบรอบ หรือกดปุ่ม', en: 'Drag the crank clockwise a full turn, or press the button' },
      motto: { th: 'คุณคุมได้แค่การหมุน ส่วนสิ่งที่ออกมา ปล่อยให้เป็นเรื่องของจักรวาล', en: 'The turning is yours. What falls out belongs to the universe.' },
      busy: { th: 'กำลังหมุน', en: 'Turning' },
    },
    palette: { bg: '#E7E1D6', bg2: '#CFC6B6', ink: '#221F1B', accent: '#A8702F', accent2: '#2F7D6C', glow: '#FFE2B0' },
    dark: false,
  },
  {
    id: 'existential',
    name: { th: 'Existentialism', en: 'Existentialism' },
    sub: { th: 'อัตถิภาวนิยม', en: 'Freedom and meaning' },
    short: { th: 'Existential', en: 'Existential' },
    tagline: { th: 'ปรัชญาแห่งเสรีภาพและการสร้างความหมาย', en: 'The philosophy of freedom and making meaning' },
    forWho: { th: 'กำลังค้นหาตัวเอง รู้สึกว่าชีวิตว่างเปล่า และอยากได้แรงผลักให้เลือกทางของตัวเอง', en: 'you are searching for yourself, life feels empty, and you need a push to choose your own path.' },
    keywords: { th: ['เสรีภาพ', 'ความรับผิดชอบ', 'ตัวตน', 'ความหมายของชีวิต'], en: ['freedom', 'responsibility', 'self', 'meaning'] },
    machine: {
      name: { th: 'ตู้แห่งการเลือก', en: 'Le Distributeur' },
      action: { th: 'เลือกเองสักช่อง', en: 'Choose a window' },
      hint: { th: 'ใจเลือกช่องไหน แตะช่องนั้นเลย', en: 'Tap whichever window you choose' },
      motto: { th: 'ไม่มีใครสุ่มให้ คุณต้องเลือกเอง แล้วรับผิดชอบสิ่งที่เลือก', en: 'Nobody picks for you. You choose, and you own it.' },
      busy: { th: 'กำลังเปิดช่อง', en: 'Opening' },
    },
    palette: { bg: '#17161A', bg2: '#0B0B0D', ink: '#F0E8DA', accent: '#E3363F', accent2: '#C9A45C', glow: '#FF5A64' },
    dark: true,
  },
  {
    id: 'eastern',
    name: { th: 'ปรัชญาตะวันออก', en: 'Eastern Philosophy' },
    sub: { th: 'เต๋า เซน พุทธ', en: 'Tao, Zen, Buddhism' },
    short: { th: 'ตะวันออก', en: 'Eastern' },
    tagline: { th: 'ปรัชญาแห่งความกลมกลืน', en: 'The philosophy of harmony' },
    forWho: { th: 'อยากฝึกสติ ใช้ชีวิตให้ช้าลง ไหลไปกับธรรมชาติ และลดอัตตาของตัวเอง', en: 'you want to be mindful, slow down, flow with nature, and loosen your ego.' },
    keywords: { th: ['ปัจจุบันขณะ', 'ความว่าง', 'ธรรมชาติ', 'การไม่ยึดติด'], en: ['the present', 'emptiness', 'nature', 'non-attachment'] },
    machine: {
      name: { th: 'เซียมซีแห่งสายลม', en: 'Fortune Sticks' },
      action: { th: 'เขย่าเซียมซี', en: 'Shake the cup' },
      hint: { th: 'เขย่ามือถือเบาๆ กดค้างที่กระบอก หรือกดปุ่ม', en: 'Shake your phone gently, hold the cup, or press the button' },
      still: { th: 'กดค้างที่กระบอก หรือกดปุ่ม', en: 'Hold the cup, or press the button' },
      motto: { th: 'ไม่ต้องรีบ เขย่าเบาๆ แล้วปล่อยให้ไม้ที่ใช่ตกลงมาเอง', en: 'No hurry. Shake gently and let the right stick fall on its own.' },
      busy: { th: 'กำลังเขย่า', en: 'Shaking' },
    },
    palette: { bg: '#EFE6D4', bg2: '#DCCDB0', ink: '#241C16', accent: '#C8412B', accent2: '#3E7A57', glow: '#FFD48A' },
    dark: false,
  },
  {
    id: 'absurd',
    name: { th: 'Absurdism', en: 'Absurdism' },
    sub: { th: 'ความไร้สาระและสุญนิยม', en: 'and Nihilism' },
    short: { th: 'Absurd', en: 'Absurd' },
    tagline: { th: 'ปรัชญาแห่งการกบฏและเสียงหัวเราะ', en: 'The philosophy of rebellion and laughter' },
    forWho: { th: 'เหนื่อยกับความคาดหวังของสังคม อยากมองโลกให้เบาลง หรือกำลังเจอเรื่องตลกร้ายในชีวิต', en: "society's expectations wear you out, you want to hold the world more lightly, or life is telling you a dark joke." },
    keywords: { th: ['การกบฏ', 'หัวเราะใส่โชคชะตา', 'อิสระจากกฎ'], en: ['rebellion', 'laughing at fate', 'freedom from rules'] },
    machine: {
      name: { th: 'เนินเขาของซิซีฟัส', en: "Sisyphus' Hill" },
      action: { th: 'เข็นหินขึ้นเขา', en: 'Push the boulder' },
      hint: { th: 'กดค้างไว้เพื่อเข็น ถ้าปล่อยมือ หินจะค่อยๆ กลิ้งกลับ', en: 'Hold to push. Let go and it rolls back.' },
      motto: { th: 'หินจะกลิ้งกลับลงมาเสมอ และนั่นแหละคือมุกที่ดีที่สุดของจักรวาล', en: "It always rolls back down. That is the universe's best joke." },
      busy: { th: 'กำลังเข็น', en: 'Pushing' },
    },
    palette: { bg: '#2A4BC4', bg2: '#223C9E', ink: '#FFF6E4', accent: '#FFC53A', accent2: '#EE6A3E', glow: '#FFF1B0' }, // deep enough for muted text (4.9:1)
    dark: true,
  },
  {
    id: 'socratic',
    name: { th: 'สายโสกราตีส', en: 'Socratic' },
    sub: { th: 'Socratic & Analytical', en: 'and Analytical Philosophy' },
    short: { th: 'สายโสกราตีส', en: 'Socratic' },
    tagline: { th: 'ปรัชญาแห่งการตั้งคำถาม', en: 'The philosophy of asking questions' },
    forWho: { th: 'อยากคิดอย่างมีตรรกะ มีเหตุผล และไม่โดนใครหลอกง่ายๆ', en: 'you want to think clearly, reason well, and not be fooled easily.' },
    keywords: { th: ['ความจริง', 'ตรรกะ', 'การตั้งคำถาม', 'การไตร่ตรอง'], en: ['truth', 'logic', 'questioning', 'reflection'] },
    machine: {
      name: { th: 'เครื่องจับฉลากแห่งเอเธนส์', en: 'The Kleroterion' },
      action: { th: 'หย่อนลูกแก้ว', en: 'Drop a ball' },
      hint: { th: 'แตะที่เครื่องเพื่อหย่อนลูกแก้วลงกรวย', en: 'Tap the machine to drop a ball into the funnel' },
      motto: { th: 'ชาวเอเธนส์ใช้เครื่องนี้สุ่มเลือกลูกขุน วันนี้มันเลือกประโยคมาให้คุณตั้งคำถาม', en: 'Athens used this machine to choose jurors by lot. Today it picks a line for you to question.' },
      busy: { th: 'ลูกแก้วกำลังตก', en: 'The ball is falling' },
    },
    palette: { bg: '#E9ECEF', bg2: '#C9D3DC', ink: '#10223B', accent: '#1F4F8C', accent2: '#C3643A', glow: '#FFFFFF' },
    dark: false,
  },
];

export const SCHOOL: Record<SchoolId, School> = Object.fromEntries(SCHOOLS.map((s) => [s.id, s])) as Record<SchoolId, School>;
export const isSchool = (x: unknown): x is SchoolId => typeof x === 'string' && x in SCHOOL;

/** A school's colours as the page's tokens (--s-bg and the rest): what src/ui/shell.ts setTone sets on the root, and
 * what scripts/prerender.mjs writes into a room's, a thinker's or a quote's own HTML so its first paint is already
 * in them (a shared link once painted the device's theme for seconds, then switched). */
export const TONE = ['bg', 'bg2', 'ink', 'accent', 'accent2', 'glow'] as const;
export const toneVars = (s: School) => TONE.map((k) => `--s-${k}:${s.palette[k]}`).join(';');

// "How do you feel today": each mood points at the school whose promise fits.
export const MOODS: { id: string; label: Tx; school: SchoolId }[] = [
  { id: 'stress', label: { th: 'เครียด คุมอะไรไม่ได้', en: 'Stressed, out of control' }, school: 'stoic' },
  { id: 'lost', label: { th: 'ว่างเปล่า หลงทาง', en: 'Empty and lost' }, school: 'existential' },
  { id: 'overwhelmed', label: { th: 'วุ่นวาย อยากให้ใจช้าลง', en: 'Overwhelmed, need to slow down' }, school: 'eastern' },
  { id: 'tired', label: { th: 'เหนื่อยกับความคาดหวัง', en: 'Tired of expectations' }, school: 'absurd' },
  { id: 'confused', label: { th: 'สับสน อยากคิดให้ชัด', en: 'Confused, want clarity' }, school: 'socratic' },
];
