// Visual QA helper.
//   node scripts/shot.mjs <url> <out.png> [--w 390] [--h 844] [--mobile] [--full] [--wait 1500]
//     [--dark] [--reduced] [--click "sel"] [--eval "js"] [--lang en]
//     [--steps "click:sel|wait:ms|shot:file.png|eval:js|key:Space|hold:sel:ms"]
// ponytail: one headless page per call; batch mode when this gets slow.
import { chromium, devices } from 'playwright';

const [url, out, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i < 0 ? d : rest[i + 1]; };
const flag = (k) => rest.includes('--' + k);

const w = +opt('w', flag('mobile') ? 390 : 1440), h = +opt('h', flag('mobile') ? 844 : 900);
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  ...(flag('mobile') ? devices['iPhone 13'] : {}),
  viewport: { width: w, height: h },
  deviceScaleFactor: +opt('dpr', 2),
  colorScheme: flag('dark') ? 'dark' : 'light',
  reducedMotion: flag('reduced') ? 'reduce' : 'no-preference',
  locale: opt('lang', 'th') === 'en' ? 'en-US' : 'th-TH',
  timezoneId: opt('lang', 'th') === 'en' ? 'Europe/London' : 'Asia/Bangkok',
});
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => logs.push('[goto] ' + e.message));
const click = opt('click');
if (click) await page.click(click, { timeout: 8000 }).catch((e) => logs.push('[click] ' + e.message.split('\n')[0]));
const js = opt('eval');
if (js) console.log('eval:', JSON.stringify(await page.evaluate(js).catch((e) => 'ERR ' + e.message)));
await page.waitForTimeout(+opt('wait', 1200));
const steps = opt('steps');
if (steps) {
  for (const step of steps.split('|')) {
    const [kind, ...argParts] = step.split(':');
    const arg = argParts.join(':');
    try {
      if (kind === 'click') await page.click(arg, { timeout: 8000 });
      else if (kind === 'wait') await page.waitForTimeout(+arg);
      else if (kind === 'shot') { await page.screenshot({ path: arg }); console.log('shot', arg); }
      else if (kind === 'eval') console.log('eval:', JSON.stringify(await page.evaluate(arg)));
      else if (kind === 'key') await page.keyboard.press(arg);
      else if (kind === 'hold') {
        const [sel, ms] = [arg.slice(0, arg.lastIndexOf(':')), +arg.slice(arg.lastIndexOf(':') + 1)];
        const box = await page.locator(sel).first().boundingBox();
        if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); }
      }
    } catch (e) { logs.push(`[step ${step}] ${e.message.split('\n')[0]}`); }
  }
}
if (out && out !== '-') { await page.screenshot({ path: out, fullPage: flag('full') }); console.log('shot', out); }
if (logs.length) console.log(logs.filter((l) => !/THREE\.Clock/.test(l)).slice(0, 30).join('\n'));
await browser.close();
