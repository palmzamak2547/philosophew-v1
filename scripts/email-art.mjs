// The picture at the top of the sign-in email (api/email.ts): the lamp in its niche, as on the accounts design board.
// node scripts/email-art.mjs -> public/email/lamp.png (1200 x 340, shown at 600 x 170; a small palette PNG)
// With --preview <dir>: also renders the email itself (with a sample code and today's-line gift) at desktop and phone
// widths, light and dark, for a look before it ships.
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'public', 'email', 'lamp.png');
const hero = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
body{width:600px;height:170px;overflow:hidden;position:relative;background:#140E0A}
.room{position:absolute;inset:0;background:
  radial-gradient(ellipse 30% 70% at 50% 92%,rgba(255,170,80,.62),rgba(255,120,40,.18) 45%,transparent 72%),
  radial-gradient(ellipse 70% 90% at 50% 120%,rgba(255,91,34,.16),transparent 70%),
  linear-gradient(180deg,#1B130E,#0F0A07)}
.grain{position:absolute;inset:0;opacity:.18;mix-blend-mode:screen;background-image:radial-gradient(circle at 1px 1px,rgba(255,220,180,.25) .6px,transparent 1px);background-size:4px 4px}
.niche{position:absolute;left:50%;bottom:0;width:104px;height:138px;transform:translateX(-50%);border-radius:52px 52px 0 0;border:1.5px solid rgba(232,178,92,.62);border-bottom:0;
  background:radial-gradient(ellipse 70% 55% at 50% 88%,rgba(255,176,90,.38),rgba(40,24,12,.0) 72%)}
.ledge{position:absolute;left:50%;bottom:18px;width:64px;height:6px;transform:translateX(-50%);border-radius:3px;background:linear-gradient(90deg,transparent,rgba(232,178,92,.35),transparent)}
.flame{position:absolute;left:50%;bottom:30px;width:13px;height:28px;transform:translateX(-50%);border-radius:50% 50% 45% 45%/70% 70% 30% 30%;
  background:radial-gradient(ellipse at 50% 72%,#fff 0 20%,#FFD58A 42%,#FF8A2A 76%,transparent 77%);filter:drop-shadow(0 0 12px rgba(255,160,60,.95)) drop-shadow(0 0 28px rgba(255,120,40,.6))}
.halo{position:absolute;left:50%;bottom:10px;width:150px;height:110px;transform:translateX(-50%);background:radial-gradient(closest-side,rgba(255,180,90,.28),transparent);filter:blur(6px)}
</style></head><body><div class="room"></div><div class="grain"></div><div class="halo"></div><div class="niche"></div><div class="ledge"></div><div class="flame"></div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 170 }, deviceScaleFactor: 2 });
  await page.setContent(hero);
  const png = await page.screenshot({ type: 'png' });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(png).png({ palette: true, quality: 90, effort: 10, colors: 128 }).toFile(out);
  console.log(`${path.relative(root, out)}: ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);

  const i = process.argv.indexOf('--preview');
  if (i > 0) {
    const dir = path.resolve(process.argv[i + 1] || 'work/email');
    fs.mkdirSync(dir, { recursive: true });
    register('./ts-hooks.mjs', import.meta.url);
    const { codeEmail } = await import('../api/email.ts');
    // a real line from the site's data (the first checked, short Stoic one), as the API's gift would be
    const read = (p) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', p), 'utf8'));
    const line = read('quotes/stoic.json').find((q) => q.verify === 'primary' && q.th.length <= 150 && q.source?.work);
    const gift = { th: line.th, by: read('authors.json')[line.author].th, work: line.source.work };
    const mail = codeEmail('482913', gift);
    // pictures from this build, not the live site (they may not be deployed yet)
    const local = mail.html.replaceAll('https://philosophew.lol/email/lamp.png', `data:image/png;base64,${fs.readFileSync(out).toString('base64')}`)
      .replaceAll('https://philosophew.lol/icons/icon-192.png', `data:image/png;base64,${fs.readFileSync(path.join(root, 'public/icons/icon-192.png')).toString('base64')}`);
    for (const [name, width, scheme] of [['desktop', 900, 'light'], ['phone', 390, 'light'], ['desktop-dark', 900, 'dark'], ['phone-dark', 390, 'dark']]) {
      const p = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
      await p.setContent(local);
      await p.screenshot({ path: path.join(dir, `email-${name}.png`), fullPage: true });
      await p.close();
    }
    fs.writeFileSync(path.join(dir, 'email.txt'), `Subject: ${mail.subject}\n\n${mail.text}\n`);
    console.log(`previews in ${dir}`);
  }
} finally {
  await browser.close();
}
