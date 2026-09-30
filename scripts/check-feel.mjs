// node scripts/check-feel.mjs  -> fails loudly if the feeling reader regresses.
import assert from 'node:assert/strict';
import { readFeeling } from '../src/core/feel.ts';

const cases = [
  ['เครียดมาก งานเยอะ หัวหน้าด่าทั้งวัน', 'stoic', 'stress'],
  ['รู้สึกว่างเปล่า ไม่รู้จะไปทางไหนดี', 'existential', 'lost'],
  ['ชีวิตวุ่นวายไปหมด อยากพัก', 'eastern', 'overwhelmed'],
  ['เหนื่อยกับความคาดหวังของที่บ้าน', 'absurd', 'tired'],
  ['สับสน ตัดสินใจไม่ได้ว่าจะเชื่อใคร', 'socratic', 'confused'],
  ['I feel so burned out and tired', 'absurd', 'tired'],
  ["I'm anxious about tomorrow", 'stoic', 'anxious'],
];
for (const [text, school, mood] of cases) {
  const r = readFeeling(text);
  assert.equal(r.school, school, `${text} -> ${r.school}`);
  assert.equal(r.moods[0].mood, mood, `${text} -> ${r.moods[0]?.mood}`);
}
assert.equal(readFeeling('วันนี้ไม่เครียดเลย').moods.some((m) => m.mood === 'stress'), false, 'negation');
assert.equal(readFeeling('กินข้าวอร่อยมาก').school, null, 'no feeling words -> honest null');
console.log(`feel: ${cases.length + 2} checks passed`);
