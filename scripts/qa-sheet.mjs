// Contact sheet of every machine (browse + room) for one viewport: node scripts/qa-sheet.mjs [mobile|desktop] [out.png] [extra steps]
import { chromium, devices } from 'playwright';
import sharp from 'sharp';

const mode = process.argv[2] || 'mobile';
const out = process.argv[3] || `work/shots/sheet-${mode}.png`;
const pull = process.argv.includes('--pull');
const dark = process.argv.includes('--dark');
const en = process.argv.includes('--en');
const mobile = mode === 'mobile';
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  ...(mobile ? devices['iPhone 13'] : {}),
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: dark ? 'dark' : 'light',
  locale: en ? 'en-GB' : 'th-TH',
  timezoneId: en ? 'Europe/London' : 'Asia/Bangkok',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.click('[data-skip]').catch(() => {});
await page.waitForTimeout(2500);
const shots = [];
for (const id of ['stoic', 'existential', 'eastern', 'absurd', 'socratic']) {
  await page.evaluate((s) => { history.pushState({ idx: 1 }, '', '/s/' + s); dispatchEvent(new PopStateEvent('popstate')); }, id);
  await page.waitForTimeout(3800);
  shots.push(await page.screenshot());
  if (pull) {
    await page.click('[data-pull]').catch(() => {});
    if (id === 'existential') { await page.waitForTimeout(400); await page.click('[data-pull]').catch(() => {}); }
    await page.waitForTimeout(id === 'absurd' ? 7000 : id === 'socratic' ? 7500 : 5000);
    shots.push(await page.screenshot());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }
}
await page.evaluate(() => { history.pushState({ idx: 1 }, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
await page.waitForTimeout(3000);
shots.push(await page.screenshot());
await browser.close();
const w = mobile ? 390 : 720, h = mobile ? 844 : 450;
const cols = pull ? 4 : 3;
const tiles = await Promise.all(shots.map((b) => sharp(b).resize(w, h).png().toBuffer()));
const rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: cols * w + (cols - 1) * 8, height: rows * h + (rows - 1) * 8, channels: 3, background: '#222' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * (w + 8), top: Math.floor(i / cols) * (h + 8) })))
  .png().toFile(out);
console.log('sheet', out, 'errors:', errors.length ? errors.slice(0, 8) : 'none');
