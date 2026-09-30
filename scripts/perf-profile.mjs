// CPU profile of a page load on a mid-range phone profile; prints the functions with the most self time.
//   BASE=http://localhost:4173 node scripts/perf-profile.mjs [path=/] [--cpu 4] [--ms 7000]
import { chromium, devices } from 'playwright';

const args = process.argv.slice(2);
const path = args.find((a) => a.startsWith('/')) || '/';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : Number(args[i + 1]); };
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
await ctx.addInitScript(() => {
  const key = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!localStorage.getItem('pw.state.v1')) localStorage.setItem('pw.state.v1', JSON.stringify({ day: key, streak: 3, best: 3, flames: 5, xp: 40, lit: 3, introDone: true }));
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: opt('cpu', 4) });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
await page.goto((process.env.BASE || 'http://localhost:5178') + path, { waitUntil: 'load' });
await page.waitForTimeout(opt('ms', 7000));
const { profile } = await cdp.send('Profiler.stop');
// self time per function, from sample counts
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = (profile.endTime - profile.startTime) / 1000 / profile.samples.length;
for (const id of profile.samples) {
  const n = byId.get(id);
  const f = n.callFrame;
  const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + dt);
}
const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 28);
for (const [k, ms] of top) console.log(ms.toFixed(0).padStart(6), 'ms', k);
await browser.close();
