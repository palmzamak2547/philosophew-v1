// "Tell us how you feel": read a short Thai or English sentence on the device, find the moods in it,
// and point to the school that answers them. No network, no model, instant.
// ponytail: substring lexicon with a small negation rule; upgrade to a classifier only if users show misses.
export type Mood = 'stress' | 'anxious' | 'angry' | 'heartbroken' | 'lost' | 'tired' | 'overwhelmed' | 'confused' | 'bored' | 'stuck';
export type SchoolKey = 'stoic' | 'existential' | 'eastern' | 'absurd' | 'socratic';

const LEX: Record<Mood, string[]> = {
  stress: ['เครียด', 'กดดัน', 'ไม่ไหว', 'งานเยอะ', 'งานล้น', 'เดดไลน์', 'deadline', 'ปวดหัว', 'คุมไม่ได้', 'ควบคุมไม่ได้', 'แบกไม่ไหว', 'ภาระ', 'หัวหน้า', 'เจ้านาย', 'สอบ', 'stress', 'pressure', 'overworked', 'out of control'],
  anxious: ['กังวล', 'วิตก', 'กลัว', 'ใจสั่น', 'ระแวง', 'คิดมาก', 'นอนไม่หลับ', 'ไม่แน่ใจ', 'แพนิค', 'panic', 'anxious', 'anxiety', 'worried', 'worry', 'afraid', 'scared', 'nervous', 'overthink'],
  angry: ['โกรธ', 'โมโห', 'หงุดหงิด', 'เดือด', 'หัวร้อน', 'รำคาญ', 'เกลียด', 'ไม่พอใจ', 'แค้น', 'angry', 'furious', 'annoyed', 'irritated', 'hate', 'mad at'],
  heartbroken: ['อกหัก', 'เลิกกัน', 'เลิกกับ', 'ผิดหวัง', 'เสียใจ', 'ร้องไห้', 'เจ็บปวด', 'คิดถึงเขา', 'คิดถึงแฟน', 'โดนทิ้ง', 'สูญเสีย', 'heartbroken', 'broke up', 'breakup', 'grief', 'crying', 'hurt'],
  lost: ['หลงทาง', 'ว่างเปล่า', 'ไร้ค่า', 'ไร้ความหมาย', 'ไม่มีเป้าหมาย', 'ไม่รู้จะทำอะไร', 'ไม่รู้จะไปทางไหน', 'อนาคต', 'ตัวตน', 'ความหมายของชีวิต', 'เคว้ง', 'lost', 'empty', 'meaningless', 'purpose', 'no direction', 'who am i'],
  tired: ['เหนื่อย', 'หมดไฟ', 'ท้อ', 'หมดแรง', 'อ่อนล้า', 'ความคาดหวัง', 'คาดหวัง', 'ต้องเก่ง', 'เปรียบเทียบ', 'burnout', 'burned out', 'burnt out', 'tired', 'exhausted', 'drained', 'expectations'],
  overwhelmed: ['วุ่นวาย', 'ยุ่งมาก', 'เร่งรีบ', 'ไม่มีเวลา', 'เยอะไปหมด', 'ฟุ้งซ่าน', 'ใจไม่นิ่ง', 'อยากพัก', 'overwhelmed', 'too busy', 'rushed', 'no time', 'scattered', 'too much'],
  confused: ['สับสน', 'งง', 'ไม่เข้าใจ', 'ตัดสินใจไม่ได้', 'เลือกไม่ถูก', 'ลังเล', 'ไม่รู้จะเชื่อใคร', 'ข่าวปลอม', 'โดนหลอก', 'confused', 'unsure', "can't decide", 'dilemma', 'fake news', "don't understand"],
  bored: ['เบื่อ', 'จำเจ', 'ซ้ำซาก', 'ไม่มีอะไรทำ', 'น่าเบื่อ', 'bored', 'boring', 'same every day'],
  stuck: ['ติดอยู่', 'ย่ำอยู่กับที่', 'ไม่ก้าวหน้า', 'ผัดวันประกันพรุ่ง', 'ขี้เกียจ', 'ไม่กล้า', 'เริ่มไม่ได้', 'ไม่เริ่มสักที', 'stuck', 'procrastinat', "can't start", 'no progress'],
};

// Which school answers which mood (the school promises in docs/DATA-BRIEF.md).
const ANSWER: Record<Mood, Partial<Record<SchoolKey, number>>> = {
  stress: { stoic: 1 },
  anxious: { stoic: 0.8, eastern: 0.6 },
  angry: { stoic: 0.9, eastern: 0.5 },
  heartbroken: { eastern: 0.8, stoic: 0.5 },
  lost: { existential: 1 },
  tired: { absurd: 1, eastern: 0.3 },
  overwhelmed: { eastern: 1 },
  confused: { socratic: 1 },
  bored: { absurd: 0.7, existential: 0.5 },
  stuck: { existential: 0.6, stoic: 0.5 },
};

const NEG = ['ไม่ค่อย', 'ไม่ได้', 'หาย', 'ไม่', 'not ', "n't ", 'no longer '];

export interface Feeling { moods: { mood: Mood; score: number }[]; school: SchoolKey | null }

export function readFeeling(input: string): Feeling {
  const text = ' ' + input.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const scores = new Map<Mood, number>();
  for (const [mood, words] of Object.entries(LEX) as [Mood, string[]][]) {
    for (const w of words) {
      let from = 0;
      for (let i = text.indexOf(w, from); i >= 0; i = text.indexOf(w, from)) {
        from = i + w.length;
        const before = text.slice(Math.max(0, i - 8), i);
        // "ไม่เครียด" and "not stressed" are the opposite of the word, unless the word already is a negation
        if (!/^(ไม่|not|no )/.test(w) && NEG.some((n) => before.endsWith(n))) continue;
        scores.set(mood, (scores.get(mood) || 0) + (w.length > 4 ? 1.2 : 1));
      }
    }
  }
  const moods = [...scores].map(([mood, score]) => ({ mood, score })).sort((a, b) => b.score - a.score);
  if (!moods.length) return { moods, school: null };
  const tally = new Map<SchoolKey, number>();
  for (const { mood, score } of moods) {
    for (const [s, w] of Object.entries(ANSWER[mood]) as [SchoolKey, number][]) tally.set(s, (tally.get(s) || 0) + w * score);
  }
  const school = [...tally].sort((a, b) => b[1] - a[1])[0][0];
  return { moods, school };
}
