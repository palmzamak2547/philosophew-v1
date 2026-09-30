// Long tasks (main-thread stalls over 50 ms) on a mid-range phone profile: 4x CPU slowdown, real GPU.
//   node scripts/perf-longtasks.mjs [path=/] [--cpu 4]
// Skips the breath (seeds today's check-in), opens the page, then walks through every machine.
import { chromium, devices } from 'playwright';

const args = process.argv.slice(2);
const path = args.find((a) => a.startsWith('/')) || '/';
const cpu = Number(args[args.indexOf('--cpu') + 1]) || 4;
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
await ctx.addInitScript(() => {
  const key = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!localStorage.getItem('pw.state.v1')) localStorage.setItem('pw.state.v1', JSON.stringify({ day: key, streak: 3, best: 3, flames: 5, xp: 40, lit: 3, introDone: true }));
  window.__long = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true });
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
const t0 = Date.now();
await page.goto((process.env.BASE || 'http://localhost:5178') + path, { waitUntil: 'load' });
console.log('load', Date.now() - t0, 'ms');
await page.waitForTimeout(6000);
const mark = async (label) => {
  const l = await page.evaluate(() => { const x = window.__long; window.__long = []; return x; });
  const total = l.reduce((a, b) => a + b.d, 0);
  console.log(label.padEnd(18), 'long tasks:', l.length, 'total', total, 'ms', 'worst', Math.max(0, ...l.map((x) => x.d)), 'ms');
};
await mark('first screen');
console.log('measures', JSON.stringify(await page.evaluate(() => performance.getEntriesByType('measure').filter((m) => m.name.startsWith('pw:')).map((m) => [m.name, Math.round(m.duration)]))));
for (const id of ['stoic', 'existential', 'eastern', 'absurd', 'socratic']) {
  await page.evaluate((s) => { history.pushState({ idx: 1 }, '', '/s/' + s); dispatchEvent(new PopStateEvent('popstate')); }, id);
  await page.waitForTimeout(4500);
  await mark('room ' + id);
}
await browser.close();
