// node scripts/api-local.mjs [port]  -> the API (api/index.ts) on http://127.0.0.1:<port> (default 8787), with the
// database and secrets in .env.local, for local development: point the dev server at it with a .env.development.local
// holding NEON_FUNCTION_API_BASE_URL=http://127.0.0.1:8787 (vite.config.ts proxies /api there). Sign-in codes are printed
// here instead of mailed (DEV_LOG_CODES=1). Never used in production: the Neon Function serves the same app. It listens
// on this machine only (loopback): it holds the real database and prints codes, so nothing else on the network may reach it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
// PW_ENV_FILE: the main checkout's .env.local, for a worktree that has none (read here, never copied or printed)
for (const l of fs.readFileSync(process.env.PW_ENV_FILE || path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
process.env.DEV_LOG_CODES = '1';
register('./ts-hooks.mjs', import.meta.url);
const { default: app } = await import('../api/index.ts');
const port = Number(process.argv[2] || 8787);

http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || '127.0.0.1');
    const r = await app.fetch(new Request(`http://localhost:${port}${req.url}`, {
      method: req.method, headers, body: chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined,
    }));
    const out = {};
    r.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) out['set-cookie'] = cookies;
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"server"}');
  }
}).listen(port, '127.0.0.1', () => console.log(`api on http://127.0.0.1:${port} (codes print here)`));
