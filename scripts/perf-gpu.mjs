// Frame timing on the real GPU (not SwiftShader).
//   node scripts/perf-gpu.mjs [url] [--mobile] [--seconds 6] [--hold]
// Prints the GPU in use, frames per second, the worst frames, and the stage quality level.
import { chromium, devices } from 'playwright';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) || 'http://localhost:5178/';
const flag = (k) => args.includes('--' + k);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const mobile = flag('mobile');
const ctx = await browser.newContext({
  ...(mobile ? devices['iPhone 13'] : {}),
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: mobile ? 3 : 1,
  locale: 'th-TH',
  timezoneId: 'Asia/Bangkok',
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url, { waitUntil: 'domcontentloaded' });
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('GPU:', gpu);
await page.waitForTimeout(+opt('wait', 3500));
if (flag('hold')) { await page.mouse.move(195, 420); await page.mouse.down(); }
const r = await page.evaluate(async (secs) => {
  const times = [];
  let last = performance.now();
  await new Promise((done) => {
    const end = last + secs * 1000;
    const f = (now) => { times.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else done(); };
    requestAnimationFrame(f);
  });
  times.shift();
  const sorted = [...times].sort((a, b) => b - a);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const L = window.__lamp;
  return { frames: times.length, fps: +(1000 / avg).toFixed(1), worst: sorted.slice(0, 5).map((x) => +x.toFixed(1)), over33: times.filter((x) => x > 33).length, quality: L ? L.stage.quality : null, canvas: [document.querySelector('#gl canvas')?.width, document.querySelector('#gl canvas')?.height] };
}, +opt('seconds', 6));
console.log(JSON.stringify(r));
if (errs.length) console.log('errors:', errs.slice(0, 5));
await browser.close();
