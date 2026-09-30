// Tell the IndexNow engines (Bing, Yandex, Naver, Seznam, Yep) which pages exist or changed. Run it once after a
// deploy, from the same build (it reads dist/sitemap.xml):
//   node scripts/indexnow.mjs --dry          show what would be sent; contacts nothing
//   node scripts/indexnow.mjs                every URL in dist/sitemap.xml
//   node scripts/indexnow.mjs /q/abc /p/x    only these pages (after a small change)
// The key is public by design: https://philosophew.lol/<KEY>.txt must answer with it (public/<KEY>.txt), so the deploy
// that carries that file has to be live first; the script checks, `--force` skips the check. One endpoint shares the
// submission with every IndexNow engine. Google does not take part: it reads the sitemap (Search Console).
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.INDEXNOW_KEY || ''; // the live site's key stays out of this repository: use your own
if (!KEY) throw new Error('set INDEXNOW_KEY to your IndexNow key, and serve it as public/<key>.txt');
const HOST = 'philosophew.lol';
const SITE = `https://${HOST}`;
const KEY_URL = `${SITE}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH = 10000; // the protocol's limit per request
const MEANING = {
  200: 'OK, submitted',
  202: 'accepted, the key is still being checked',
  400: 'bad request (the body is malformed)',
  403: 'forbidden: the key file is missing or does not hold the key',
  422: 'unprocessable: a URL is not on this host, or the key does not match',
  429: 'too many requests: wait before submitting again',
};

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

if (fs.readFileSync(path.join(root, 'public', `${KEY}.txt`), 'utf8').trim() !== KEY) throw new Error(`public/${KEY}.txt must hold the key`);

let urls = args.filter((a) => !a.startsWith('--')).map((p) => (/^https?:/.test(p) ? p : SITE + (p.startsWith('/') ? p : `/${p}`)));
if (!urls.length) {
  const sitemap = path.join(root, 'dist', 'sitemap.xml');
  if (!fs.existsSync(sitemap)) throw new Error('no dist/sitemap.xml: run npm run build first');
  urls = [...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => unxml(m[1])); // page locs, not image:loc
}
urls = [...new Set(urls)];
const foreign = urls.filter((u) => new URL(u).host !== HOST);
if (foreign.length) throw new Error(`not on ${HOST}: ${foreign.join(', ')}`);
if (!urls.length) throw new Error('nothing to submit');

if (!dry && !force) {
  const live = await fetch(KEY_URL, { redirect: 'manual' }).then((r) => (r.ok ? r.text() : `HTTP ${r.status}`), (e) => e.message);
  if (live.trim() !== KEY) {
    console.error(`${KEY_URL} answered "${live.trim().slice(0, 60)}", not the key: deploy first (or --force)`);
    process.exit(1);
  }
}

for (let i = 0; i < urls.length; i += BATCH) {
  const urlList = urls.slice(i, i + BATCH);
  const body = { host: HOST, key: KEY, keyLocation: KEY_URL, urlList };
  if (dry) {
    console.log(`[dry] POST ${ENDPOINT} with ${urlList.length} URLs:`);
    console.log(JSON.stringify({ ...body, urlList: urlList.length > 4 ? [...urlList.slice(0, 4), `... ${urlList.length - 4} more`] : urlList }, null, 2));
    continue;
  }
  const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  console.log(`${r.status} ${MEANING[r.status] || r.statusText} (${urlList.length} URLs)`);
  if (r.status >= 300) {
    const text = await r.text().catch(() => '');
    if (text) console.error(text.slice(0, 500));
    process.exitCode = 1;
    break;
  }
}
