// node scripts/check-stage.mjs: the stage's resolution governor (src/gl/stage.ts governor) on made-up frame times.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);
const { governor } = await import('../src/gl/stage.ts');
const run = (frames) => { const g = governor(() => {}); for (const ms of frames) g.adapt(typeof ms === 'function' ? ms(g.quality) : ms); return g.quality; };
const n = (count, ms) => Array(count).fill(ms);
assert.equal(run(n(600, 16.7)), 1, '60 Hz: full resolution');
assert.equal(run(n(900, 33.3)), 1, 'a 30 Hz screen (Low Power Mode): stepping down does not help, so it is undone');
assert.ok(run(n(900, (q) => 45 * q * q)) < 1, 'frames that pixels slow down: fewer pixels, and it stays');
assert.equal(run([...n(300, 40), ...n(2000, 12)]), 1, 'fast again: the pixels come back');
console.log('stage governor: all checks passed');
