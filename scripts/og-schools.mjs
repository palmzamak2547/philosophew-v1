// One OG image per school (1200x630), rendered with real fonts and portraits. Needs the dev server on :5178.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const authors = JSON.parse(fs.readFileSync(path.join(root, 'public/data/authors.json'), 'utf8'));
const S = {
  stoic: { th: 'สโตอิก', en: 'Stoicism', tag: 'ปรัชญาแห่งความมั่นคงทางใจ', machine: 'ตู้สำริดแห่งระเบียงหิน', bg: '#E7E1D6', ink: '#221F1B', accent: '#A8702F' },
  existential: { th: 'Existentialism', en: 'อัตถิภาวนิยม', tag: 'ปรัชญาแห่งเสรีภาพและการสร้างความหมาย', machine: 'ตู้แห่งการเลือก', bg: '#17161A', ink: '#F0E8DA', accent: '#E3363F' },
  eastern: { th: 'ปรัชญาตะวันออก', en: 'Tao, Zen, Buddhism', tag: 'ปรัชญาแห่งความกลมกลืน', machine: 'เซียมซีแห่งสายลม', bg: '#EFE6D4', ink: '#241C16', accent: '#C8412B' },
  absurd: { th: 'Absurdism', en: 'ความไร้สาระและสุญนิยม', tag: 'ปรัชญาแห่งการกบฏและเสียงหัวเราะ', machine: 'เนินเขาของซิซีฟัส', bg: '#3D64E8', ink: '#FFF6E4', accent: '#FFC53A' },
  socratic: { th: 'สายโสกราตีส', en: 'Socratic & Analytical', tag: 'ปรัชญาแห่งการตั้งคำถาม', machine: 'เครื่องจับฉลากแห่งเอเธนส์', bg: '#E9ECEF', ink: '#10223B', accent: '#1F4F8C' },
};
const FREE = /^(public domain|no restrictions|copyrighted free use)$|cc0/i;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
fs.mkdirSync(path.join(root, 'public/og'), { recursive: true });
for (const [id, s] of Object.entries(S)) {
  // public domain faces first; a school with fewer than six takes CC BY ones, credited on the card; never CC BY-SA
  // (a tinted copy is an adaptation, and share-alike would pass its licence on to the whole image)
  const all = Object.values(authors).filter((a) => a.schools[0] === id && a.portrait?.thumb && a.portrait.kind !== 'symbol' && a.portrait.kind !== 'papyrus' && !/\bSA\b/.test(a.portrait.license || ''));
  const free = all.filter((a) => FREE.test((a.portrait.license || '').trim()));
  const faces = free.length >= 6 ? free.slice(0, 6) : [...all.filter((a) => !FREE.test((a.portrait.license || '').trim())).slice(0, Math.max(0, 4 - free.length)), ...free].slice(0, 4);
  const cols = faces.length >= 6 ? 3 : 2;
  const credits = faces.filter((a) => !FREE.test((a.portrait.license || '').trim())).map((a) => `${a.en}: ${a.portrait.artist ? `${a.portrait.artist}, ` : ''}${a.portrait.license}`);
  const tiles = faces.map((a) => `<div class="p"><img src="http://localhost:5178${a.portrait.thumb}"></div>`).join('');
  await page.setContent(`<!doctype html><html lang="th"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;700&family=Fraunces:ital,opsz,wght@0,9..144,900;1,9..144,800&family=Noto+Serif+Thai:wght@800&display=swap">
<style>*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:${s.bg};color:${s.ink};font-family:Anuphan;overflow:hidden;position:relative}
.l{position:absolute;left:70px;top:70px;width:600px}.k{font:700 24px Anuphan;color:${s.accent}}
h1{font:800 var(--hs)/1.12 'Noto Serif Thai',Fraunces;margin-top:14px;white-space:nowrap}.en{font:italic 400 30px Fraunces;opacity:.75;margin-top:8px}
.t{font:700 28px/1.4 Anuphan;margin-top:26px;white-space:nowrap}.m{font:500 24px Anuphan;opacity:.7;margin-top:10px}
.b{position:absolute;left:70px;bottom:52px;font:900 30px Fraunces;letter-spacing:-.02em}.b em{font-style:italic;color:${s.accent}}
.r{position:absolute;right:${cols === 3 ? -70 : -10}px;top:-20px;width:${cols === 3 ? 470 : 380}px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;transform:rotate(-7deg)}
.c{position:absolute;right:28px;bottom:18px;font:500 15px Anuphan;opacity:.62}
.p{aspect-ratio:4/5;border-radius:999px 999px 16px 16px;overflow:hidden;background:${s.accent};position:relative}.p:nth-child(${cols}n+2){margin-top:40px}
.p img{width:100%;height:100%;object-fit:cover;mix-blend-mode:screen;filter:grayscale(1) contrast(1.1)}.p::after{content:'';position:absolute;inset:0;background:${s.bg === '#17161A' ? '#efe4d2' : s.bg};mix-blend-mode:multiply}
</style></head><body><div class="r">${tiles}</div><div class="l" style="--hs:${s.th.length > 11 ? 64 : 84}px"><p class="k">philosophew.lol</p><h1>${s.th}</h1><p class="en">${s.en}</p><p class="t">${s.tag}</p><p class="m">${s.machine}</p></div>
<p class="b">philoso<em>phew</em></p>${credits.length ? `<p class="c">ภาพ ${credits.join(' / ')}</p>` : ''}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const file = path.join(root, `public/og/${id}.png`);
  await page.screenshot({ path: file });
  fs.writeFileSync(file, await sharp(file).png({ palette: true, quality: 95, effort: 10, compressionLevel: 9, dither: 0.6 }).toBuffer()); // same look, a third of the weight
  console.log('og', id);
}
await browser.close();
