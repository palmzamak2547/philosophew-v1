import { defineConfig, loadEnv, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The faces the first screen needs, preloaded so the first words never wait on CSS discovery; the lamp's italic
// only when the lamp will show. A preload is only used if it is fetched exactly as the stylesheet then asks for
// the font, and that differs by engine (Blink and Gecko fetch fonts as CORS requests, WebKit does not, so a
// static tag doubled the download in one or the other). So the build only names the files, and public/theme.js,
// which already decides before first paint whether the lamp shows, adds each preload in the matching form.
const PRELOAD = [/anuphan-thai-wght-normal/, /fraunces-latin-opsz-normal/];
const RITUAL = [/trirong-thai-400-italic/];

function preloadFonts(): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const files = Object.keys(ctx.bundle || {}).filter((f) => f.endsWith('.woff2'));
        const meta = (name: string, list: RegExp[]) => files.filter((f) => list.some((r) => r.test(f))).map((f) => `<meta name="${name}" content="/${f}">`);
        const tags = [...meta('pw-font', PRELOAD), ...meta('pw-font-ritual', RITUAL)].join('\n');
        return html.replace('<script src="/theme.js"></script>', `${tags}\n<script src="/theme.js"></script>`); // read by theme.js, so before it
      },
    },
  };
}

// The hall and the lamp are chunks of their own (with three.js), loaded on demand so shared links open without the
// 3D engine. The hall's own page must not wait for them: index.html preloads their code and everything it imports,
// marked data-hall, and scripts/prerender.mjs drops those links from the quote and philosopher pages.
function hallPreload(): Plugin {
  return {
    name: 'hall-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunks = new Map(Object.values(ctx.bundle || {}).flatMap((f) => (f.type === 'chunk' ? [[f.fileName, f] as const] : [])));
        const want = new Set<string>();
        const walk = (name: string) => { const c = chunks.get(name); if (!c || want.has(name)) return; want.add(name); c.imports.forEach(walk); };
        chunks.forEach((c) => { if (/[\\/]src[\\/]ui[\\/](hall|ritual)\.ts$/.test(c.facadeModuleId || '')) walk(c.fileName); });
        if (!want.size) throw new Error('hall-preload: no hall or ritual chunk (were they imported statically again?)');
        const links = [...want].filter((f) => !html.includes(`/${f}"`)).map((f) => `<link rel="modulepreload" crossorigin href="/${f}" data-hall>`);
        return html.replace('</head>', `${links.join('\n')}\n</head>`);
      },
    },
  };
}

// Offline: the service worker (public/sw.js) is handed this build's files and a version made from their contents,
// so every deploy installs a new worker that saves exactly its own files. Saved: the page, the code of every page
// and machine a reader can reach (not the moderators' page), the Thai and Latin cuts of every face (Latin
// Extended, rare diacritics, is saved on first use), and the quotes and thinkers (the big library is saved as it
// is read). Everything else the worker answers from the network.
function offlineFiles(): Plugin {
  let outDir = '', publicDir = '';
  return {
    name: 'offline-files',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); publicDir = c.publicDir; },
    writeBundle(_out, bundle) {
      const files = new Set(['/', '/theme.js', '/favicon.svg', '/manifest.webmanifest']);
      const chunks = new Map(Object.values(bundle).flatMap((f) => (f.type === 'chunk' ? [[f.fileName, f] as const] : [])));
      const walk = (name: string) => {
        const c = chunks.get(name);
        if (!c || files.has(`/${name}`) || /[\\/]src[\\/]ui[\\/]admin\.ts$/.test(c.facadeModuleId || '')) return;
        files.add(`/${name}`);
        c.viteMetadata?.importedCss.forEach((css) => files.add(`/${css}`));
        [...c.imports, ...c.dynamicImports].forEach(walk);
      };
      chunks.forEach((c) => { if (c.isEntry) walk(c.fileName); });
      for (const f of Object.keys(bundle)) if (f.endsWith('.woff2') && /-(thai|latin)-/.test(f) && !f.includes('-latin-ext-')) files.add(`/${f}`);
      const data = (dir: string): string[] => readdirSync(path.join(outDir, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === 'library' ? [] : data(`${dir}/${e.name}`)) : e.name.endsWith('.json') ? [`/${dir}/${e.name}`] : []);
      data('data').concat('/data/library/index.json').forEach((f) => files.add(f));

      const list = [...files].sort();
      const source = readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
      const hash = createHash('sha256').update(source);
      let bytes = 0;
      for (const f of list) {
        const file = path.join(outDir, f === '/' ? 'index.html' : f);
        if (!existsSync(file)) throw new Error(`offline-files: ${f} is not in the build`);
        const body = readFileSync(file);
        bytes += body.length;
        hash.update(f);
        if (!f.startsWith('/assets/')) hash.update(body); // hashed names already carry their content
      }
      const version = hash.digest('hex').slice(0, 12);
      writeFileSync(path.join(outDir, 'sw.js'), `self.__PW = ${JSON.stringify({ version, files: list })};\n${source}`);
      // every reader downloads this once (then only what changes): watch it when adding files to public/data
      this.info?.(`service worker ${version}: ${list.length} files, ${(bytes / 1048576).toFixed(1)} MB saved for offline`);
    },
  };
}

// Frosted glass must reach every engine. The CSS minifier (Lightning CSS) merges a standard declaration and its
// -webkit- twin into one, and when the prefixed one comes second it keeps only that: Chromium and Firefox then drew
// no blur at all (header, dock, pills, chips, panels, scrims). The styles write the prefixed one first; this fails the
// build if a prefixed backdrop-filter ever ships without its standard partner again.
function frostedEverywhere(): Plugin {
  return {
    name: 'frosted-everywhere',
    apply: 'build',
    writeBundle(_out, bundle) { // the minified CSS, as shipped
      for (const f of Object.values(bundle)) {
        if (f.type !== 'asset' || !f.fileName.endsWith('.css')) continue;
        const css = String(f.source);
        const prefixed = css.match(/-webkit-backdrop-filter:/g)?.length || 0;
        const standard = css.match(/(?<!-webkit-)backdrop-filter:/g)?.length || 0;
        if (prefixed > standard) throw new Error(`frosted-everywhere: ${f.fileName} has ${prefixed} -webkit-backdrop-filter but ${standard} backdrop-filter (write the -webkit- one first)`);
      }
    },
  };
}

// Dev mirrors production routing: /api -> the Neon Function.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const fn = env.NEON_FUNCTION_API_BASE_URL?.replace(/\/$/, '');
  return {
    plugins: [preloadFonts(), hallPreload(), offlineFiles(), frostedEverywhere()],
    build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
    server: {
      proxy: {
        ...(fn ? { '/api': { target: fn, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, '') } } : {}),
      },
    },
  };
});
