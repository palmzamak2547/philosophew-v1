// Philosophew service worker: the app opens offline after one visit, and a new deploy always takes over.
// The build (offlineFiles in vite.config.ts) puts this build's file list and a version made from their contents
// on the first line, so every deploy is a new worker:
//   install   saves every file of this build, all or nothing: the page, the code of every page and machine,
//             the Thai and Latin type, the quotes and the thinkers. Then it takes over at once.
//   activate  deletes older builds' files, keeping the one just before (a tab still running it can finish
//             opening its pages), and takes control of open tabs.
//   pages     network first; the saved page when the network is gone or too slow.
//   /assets   content-hashed, so cache first; files saved later (Latin Extended type) join this build's cache.
//   /data, /portraits and the other saved files: answer from the cache, refresh behind (stale-while-revalidate).
//   /api, other origins, anything else: never touched here.
const BUILD = self.__PW || { version: 'dev', files: [] };
const SHELL = `pw-shell-${BUILD.version}`;
const RUNTIME = 'pw-runtime-1'; // portraits and library pages, saved as they are read, kept across deploys
const SAVED = new Set(BUILD.files);
const SLOW = 4000; // ms a page request may take before the saved page opens instead

const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html');
// Vercel answers a missing file with the app's page (the SPA rewrite): never keep that under a file's name
const keepable = (res, page = false) => res.ok && !res.redirected && isHtml(res) === page;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // this file as it sits in public/ (the dev server, or a folder caught mid-build) has no list: it never takes over
    if (!self.__PW) throw new Error('sw.js was not built: no file list');
    try {
      const got = await Promise.all(BUILD.files.map(async (url) => {
        // a hashed file an earlier build already saved is the same file (a deploy only downloads what changed);
        // the rest is checked with the server
        const hashed = url.startsWith('/assets/');
        const res = (hashed && (await caches.match(url))) || (await fetch(url, { cache: hashed ? 'default' : 'no-cache' }));
        if (!keepable(res, url === '/')) throw new Error(`${url}: ${res.status}`);
        return [url, res];
      }));
      // a deploy can land mid-install: the saved page must only ask for files saved with it
      const page = got.find(([url]) => url === '/');
      if (page) {
        const text = await page[1].clone().text();
        for (const [ref] of text.matchAll(/\/assets\/[^"'\s)>]+/g)) if (!SAVED.has(ref)) throw new Error(`page from another build asks for ${ref}`);
      }
      const cache = await caches.open(SHELL);
      await Promise.all(got.map(([url, res]) => cache.put(url, res)));
    } catch (err) {
      await caches.delete(SHELL); // nothing half-saved; the browser tries again on the next visit
      throw err;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys(); // oldest first
    const before = names.filter((n) => n.startsWith('pw-shell-') && n !== SHELL).pop();
    await Promise.all(names.filter((n) => n !== SHELL && n !== RUNTIME && n !== before).map((n) => caches.delete(n)));
    await self.registration.navigationPreload?.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') return e.respondWith(openPage(e));
  if (url.pathname.startsWith('/assets/')) return e.respondWith(cacheFirst(e));
  if (SAVED.has(url.pathname) || url.pathname.startsWith('/data/') || url.pathname.startsWith('/portraits/')) return e.respondWith(refresh(e, url));
});

async function openPage(e) {
  const net = Promise.resolve(e.preloadResponse).then((pre) => pre || fetch(e.request));
  try {
    const res = await Promise.race([net, new Promise((_, slow) => setTimeout(slow, SLOW))]);
    if (res.status < 500) return res;
  } catch { /* offline, or too slow to wait for */ }
  e.waitUntil(net.then(() => {}, () => {}));
  return (await caches.match('/', { cacheName: SHELL })) || (await caches.match('/')) || net;
}

async function cacheFirst(e) {
  const hit = await caches.match(e.request, { ignoreVary: true }); // this build, the one before, or saved on first use
  if (hit) return hit;
  const res = await fetch(e.request);
  if (keepable(res)) {
    const copy = res.clone();
    e.waitUntil(caches.open(SHELL).then((c) => c.put(e.request, copy)));
  }
  return res;
}

async function refresh(e, url) {
  const cache = await caches.open(SAVED.has(url.pathname) ? SHELL : RUNTIME);
  const hit = await cache.match(e.request, { ignoreVary: true });
  const net = fetch(e.request).then((res) => {
    if (keepable(res)) {
      const copy = res.clone();
      e.waitUntil(cache.put(e.request, copy));
    }
    return res;
  });
  if (!hit) return url.pathname.startsWith('/portraits/') ? net.catch(blank) : net;
  e.waitUntil(net.catch(() => {}));
  return hit;
}

// a portrait not saved yet, offline: the frame stays empty (its print colour) rather than showing a broken image
const blank = () => new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 5"/>', { headers: { 'content-type': 'image/svg+xml' } });
