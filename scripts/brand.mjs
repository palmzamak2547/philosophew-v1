// Brand assets from the mark: favicon.svg, PWA icons, apple-touch icon, manifest, OG image.
// node scripts/brand.mjs   (OG needs the dev server on :5178 for fonts)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const pub = (...p) => path.join(root, 'public', ...p);
fs.mkdirSync(pub('icons'), { recursive: true });

// same geometry as src/ui/icons.ts mark()
const glyph = (cx, top, bottom) => `
  <path d="M${cx - 10.7} 42.5 C${cx - 11.2} 28.5 ${cx - 5.2} 18 ${cx + 8.8} 11.6 C${cx + 9.3} 12.6 ${cx + 9.6} 13.6 ${cx + 9.7} 14.4 C${cx + 1.8} 19.2 ${cx - 2} 25.4 ${cx - 1.6} 31.6 Z" fill="${top}"/>
  <path d="M${cx - 11} 42.5 a11 11 0 0 1 22 0 Z" fill="${top}"/>
  <path d="M${cx - 11} 43.9 a11 11 0 0 0 22 0 Z" fill="${bottom}"/>
  <ellipse cx="${cx - 4.2}" cy="37.4" rx="2.6" ry="1.7" fill="#fff" fill-opacity=".55" transform="rotate(-24 ${cx - 4.2} 37.4)"/>`;
const markSvg = (bg, top, bottom, pad = 0.14, radius = 14) => {
  const s = 64, inner = s * (1 - pad * 2), off = s * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">${bg ? `<rect width="${s}" height="${s}" rx="${radius}" fill="${bg}"/>` : ''}<g transform="translate(${off} ${off + 1.5}) scale(${inner / 64})">${glyph(20, top, bottom)}${glyph(45, top, bottom)}</g></svg>`;
};

const EMBER = '#FF5B22', INK = '#1A1714', PAPER = '#F3EDE2';
fs.writeFileSync(pub('favicon.svg'), markSvg(INK, EMBER, PAPER, 0.1, 14));
const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toFile(pub(file));
await png(markSvg(INK, EMBER, PAPER, 0.12, 0), 180, 'icons/apple-touch-icon.png');
await png(markSvg(INK, EMBER, PAPER, 0.12, 14), 192, 'icons/icon-192.png');
await png(markSvg(INK, EMBER, PAPER, 0.12, 14), 512, 'icons/icon-512.png');
await png(markSvg(INK, EMBER, PAPER, 0.22, 0), 512, 'icons/maskable-512.png');
await png(markSvg(null, EMBER, INK, 0.02), 64, 'icons/mark-64.png');

fs.writeFileSync(pub('manifest.webmanifest'), JSON.stringify({
  name: 'Philosophew',
  short_name: 'Philosophew',
  description: 'ตู้สุ่มปรัชญา สุ่มคำคมจากนักปรัชญาตัวจริง พร้อมแหล่งที่มา',
  lang: 'th',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: PAPER,
  theme_color: PAPER,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

// OG: a designed card rendered by the browser so Thai and Fraunces are exact.
// public domain faces only: a tinted copy is an adaptation, so CC BY would need a credit on the card and CC BY-SA would
// pass its licence on to the whole image
const portraits = ['epictetus', 'socrates', 'laozi', 'albert-camus', 'soren-kierkegaard', 'friedrich-nietzsche', 'aristotle', 'zhuangzi']
  .filter((id) => fs.existsSync(pub('portraits', `${id}-thumb.webp`)));
const tiles = portraits.map((id, i) => `<div class="p" style="--i:${i}"><img src="http://localhost:5178/portraits/${id}-thumb.webp"></div>`).join('');
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;700&family=Fraunces:ital,opsz,wght@0,9..144,900;1,9..144,800&family=Noto+Serif+Thai:wght@800&display=swap">
<style>
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:${PAPER};font-family:Anuphan;color:${INK};position:relative;overflow:hidden}
.grain{position:absolute;inset:0;opacity:.35;background-image:radial-gradient(circle at 1px 1px,rgba(0,0,0,.08) .8px,transparent 1.2px);background-size:5px 5px}
.l{position:absolute;left:72px;top:88px;width:600px}
.m{width:92px;height:92px}
h1{font:900 104px/1 Fraunces;font-variation-settings:'opsz' 144;letter-spacing:-.035em;margin:26px 0 0}
h1 em{font-style:italic;font-weight:800;color:${EMBER}}
p{font:800 40px/1.35 'Noto Serif Thai';margin-top:26px}
small{display:block;font:500 25px/1.5 Anuphan;color:#6b6258;margin-top:14px}
.r{position:absolute;right:-40px;top:-30px;width:560px;height:700px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;transform:rotate(-8deg)}
.p{aspect-ratio:4/5;border-radius:999px 999px 18px 18px;overflow:hidden;background:#A8702F;position:relative;margin-top:calc(var(--i) % 3 * 34px)}
.p img{width:100%;height:100%;object-fit:cover;mix-blend-mode:screen;filter:grayscale(1) contrast(1.1)}
.p::after{content:'';position:absolute;inset:0;background:#F2EDE4;mix-blend-mode:multiply}
.p:nth-child(2n){background:#1F4F8C}.p:nth-child(3n){background:#C8412B}.p:nth-child(5n){background:#2F7D6C}
</style></head><body><div class="grain"></div>
<div class="r">${tiles}</div>
<div class="l">${markSvg(null, EMBER, INK, 0.02).replace('<svg ', '<svg class="m" ')}
<h1>philoso<em>phew</em></h1>
<p>สุ่มคำคมปรัชญา<br>แล้วหายใจออก</p>
<small>ห้าตู้ ห้าสำนักคิด คำพูดจริงพร้อมที่มา</small></div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.screenshot({ path: pub('og.png') });
// a palette PNG looks the same and weighs a third (471 KB to about 180): WhatsApp drops previews over about 300 KB
fs.writeFileSync(pub('og.png'), await sharp(pub('og.png')).png({ palette: true, quality: 95, effort: 10, compressionLevel: 9, dither: 0.6 }).toBuffer());
await browser.close();
console.log('brand assets written');
