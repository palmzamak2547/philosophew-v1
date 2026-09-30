// Every quote's own link picture (og:image), drawn by the app's renderLinkCard (src/core/sharecard.ts) in Thai:
// public/og/q/<id>.jpg, 1200 x 630, mozjpeg. The prerender uses a quote's picture when it exists (else its school's).
// Needs the dev server (npm run dev).   node scripts/og-quotes.mjs [--all | --only id,id] [--sheet out.png]
// Without --all it draws only the quotes that have no picture yet, so a run cut short (the dev server reloads the page
// when a source file changes) goes on where it stopped.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const BASE = process.env.BASE || 'http://localhost:5178';
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const only = arg('--only')?.split(',');
const have = process.argv.includes('--all') || only ? [] : fs.existsSync(path.join(root, 'public/og/q')) ? fs.readdirSync(path.join(root, 'public/og/q')).map((f) => f.replace(/\.jpg$/, '')) : [];
const out = path.join(root, 'public/og/q');
fs.mkdirSync(out, { recursive: true });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 800, height: 600 }, locale: 'th-TH', serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('pw.state.v1', JSON.stringify({ v: 1, day: '', introDone: true, settings: { lang: 'th', sound: false, haptics: false, theme: 'light', name: '', volume: 0.8 } })); } catch {} });
const page = await ctx.newPage();
let n = 0, bytes = 0;
const made = [];
await page.exposeFunction('saveLink', async (id, b64) => {
  const jpg = await sharp(Buffer.from(b64, 'base64')).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  fs.writeFileSync(path.join(out, `${id}.jpg`), jpg);
  n++; bytes += jpg.length; made.push(id);
  if (n % 50 === 0) console.log(`${n} drawn`);
});
await page.goto(`${BASE}/about`, { waitUntil: 'networkidle' });
const total = await page.evaluate(async ({ only, have }) => {
  const { renderLinkCard } = await import('/src/core/sharecard.ts');
  const { loadAllQuotes, loadAuthors } = await import('/src/core/data.ts');
  const quotes = (await loadAllQuotes()).filter((q) => (!only || only.includes(q.id)) && !have.includes(q.id));
  const authors = await loadAuthors();
  for (const q of quotes) {
    const c = await renderLinkCard(q, authors[q.author]);
    await window.saveLink(q.id, c.toDataURL('image/png').split(',')[1]);
  }
  return quotes.length;
}, { only, have });
const sheet = arg('--sheet');
if (sheet) { // a contact sheet of the first twelve drawn, to look at before a deploy
  const tiles = await Promise.all(made.slice(0, 12).map((id) => sharp(path.join(out, `${id}.jpg`)).resize(400, 210).toBuffer()));
  await sharp({ create: { width: 1224, height: 4 * 222 + 12, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((input, i) => ({ input, left: 12 + (i % 3) * 404, top: 12 + Math.floor(i / 3) * 222 }))).png().toFile(sheet);
}
await b.close();
console.log(`${total} link pictures in public/og/q, ${(bytes / 1024 / 1024).toFixed(1)} MB (${Math.round(bytes / Math.max(1, n) / 1024)} KB each)`);
