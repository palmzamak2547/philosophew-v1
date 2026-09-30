// Film the daily breath frame by frame.
//   node scripts/qa-ritual.mjs [mobile|desktop] <outDir> [--returning] [--en] [--reduced] [--video] [--url http://localhost:5178/]
// Writes 01-idle.png ... 09-hall.png and prints console errors. --video also records the run in real
// time and tiles it into sheet.png (2 frames a second), because screenshots stall a software GPU.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const [kind = 'mobile', out = 'work/ritual', ...rest] = process.argv.slice(2);
const flag = (k) => rest.includes('--' + k);
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i < 0 ? d : rest[i + 1]; };
mkdirSync(out, { recursive: true });
const mobile = kind === 'mobile';
const browser = await chromium.launch({ args: flag('soft') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  ...(mobile ? devices['iPhone 13'] : {}),
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: mobile && !flag('video') ? 2 : 1,
  reducedMotion: flag('reduced') ? 'reduce' : 'no-preference',
  colorScheme: flag('dark') ? 'dark' : 'light',
  locale: flag('en') ? 'en-US' : 'th-TH',
  timezoneId: flag('en') ? 'Europe/London' : 'Asia/Bangkok',
  ...(flag('video') ? { recordVideo: { dir: out, size: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } } } : {}),
});
if (flag('returning')) {
  await ctx.addInitScript(() => {
    const d = new Date(Date.now() - 86400000);
    const key = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    if (!localStorage.getItem('pw.state.v1')) localStorage.setItem('pw.state.v1', JSON.stringify({ day: key, streak: 4, best: 4, flames: 2, xp: 120 }));
  });
}
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/THREE\.Clock|GPU stall|swiftshader/i.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(opt('url', 'http://localhost:5178/'), { waitUntil: 'domcontentloaded' });
const shot = (n) => (flag('video') ? Promise.resolve() : page.screenshot({ path: `${out}/${n}.png` }));
const W = mobile ? 390 : 1440, H = mobile ? 844 : 900;
await page.waitForTimeout(3200);
await shot('01-idle');
await page.mouse.move(W / 2, H / 2);
await page.mouse.down();
await page.waitForTimeout(700);
await shot('02-caught');
await page.waitForTimeout(1100);
await shot('03-mid');
await page.waitForTimeout(+opt('hold', 1900));
await shot('04-full');
await page.mouse.up();
await page.waitForTimeout(350);
await shot('05-out-a');
await page.waitForTimeout(450);
await shot('06-out-b');
await page.waitForTimeout(700);
await shot('07-out-c');
await page.waitForTimeout(2200);
await shot('08-after');
const go = await page.$('[data-go]');
if (go) { await go.click(); await page.waitForTimeout(1600); }
else await page.waitForTimeout(2000);
await shot('09-hall');
console.log(logs.slice(0, 30).join('\n') || 'no console errors');
await browser.close();
