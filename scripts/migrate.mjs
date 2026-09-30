// node scripts/migrate.mjs  -> applies db/*.sql in order (every file is idempotent).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
  }),
);
const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing in .env.local (run neon env pull)');
const client = new pg.Client({ connectionString: url });
await client.connect();
for (const f of fs.readdirSync(path.join(root, 'db')).filter((f) => f.endsWith('.sql')).sort()) {
  await client.query(fs.readFileSync(path.join(root, 'db', f), 'utf8'));
  console.log('applied', f);
}
const r = await client.query("select table_name from information_schema.tables where table_schema = 'pw' order by 1");
console.log('pw tables:', r.rows.map((x) => x.table_name).join(', '));
await client.end();
