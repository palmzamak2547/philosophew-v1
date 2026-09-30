#!/usr/bin/env node
// scripts/data/portraits.mjs
//
// Builds data/portraits.json, data/portraits-report.md and public/portraits/*.webp
// for every author in data/roster.json. Re-runnable: caches Wikidata/Commons
// lookups and raw downloads under data/portraits-raw/, so reruns after editing
// scripts/data/portraits-overrides.mjs only redo the cheap local work.
//
// Usage:
//   node scripts/data/portraits.mjs resolve [--id=a,b] [--force]   # Wikidata metadata
//   node scripts/data/portraits.mjs images  [--id=a,b] [--force]   # pick + fetch license + download
//   node scripts/data/portraits.mjs process [--id=a,b]             # sharp crop/grayscale/resize (local only)
//   node scripts/data/portraits.mjs write   [--id=a,b]             # emit portraits.json + report.md (--id: only those
//                                                                  # entries, the rest of portraits.json untouched)
//   node scripts/data/portraits.mjs all     [--id=a,b] [--force]   # resolve + images + process + write
//   node scripts/data/portraits.mjs status                         # compact table of current state
//
// Requests to Wikimedia are sequential, ~320ms apart, with a PhilosophewBot
// User-Agent, and back off on 403/429. No email or personal data in any
// header or URL.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  QID_OVERRIDE,
  SEARCH_TERM_OVERRIDE,
  IMAGE_OVERRIDE,
  SYMBOL_IDS,
  KIND_OVERRIDE,
  CROP_OVERRIDES,
  METADATA_OVERRIDE,
  NO_IMAGE,
  NOTE_OVERRIDE,
  SOURCE_OVERRIDE,
  DESCREEN,
  ARTIST_OVERRIDE,
  LICENSE_OVERRIDE,
} from './portraits-overrides.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ROSTER_PATH = path.join(ROOT, 'data/roster.json');
const RAW_DIR = path.join(ROOT, 'data/portraits-raw');
const OUT_DIR = path.join(ROOT, 'public/portraits');
const WIKIDATA_CACHE_PATH = path.join(RAW_DIR, 'wikidata-cache.json');
const IMAGE_CACHE_PATH = path.join(RAW_DIR, 'image-cache.json');
const PORTRAITS_JSON_PATH = path.join(ROOT, 'data/portraits.json');
const REPORT_PATH = path.join(ROOT, 'data/portraits-report.md');

const USER_AGENT = 'PhilosophewBot/0.1 (https://philosophew.lol)';
const MIN_INTERVAL_MS = 320;

// ---------------------------------------------------------------- utilities

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function wmFetch(url, { binary = false, attempt = 1 } = {}) {
  await throttle();
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  } catch (err) {
    if (attempt > 5) throw err;
    const backoff = 1500 * attempt;
    console.log(`  [network error] ${err.message} -- retrying in ${backoff}ms`);
    await sleep(backoff);
    return wmFetch(url, { binary, attempt: attempt + 1 });
  }
  if (res.status === 403 || res.status === 429) {
    if (attempt > 6) throw new Error(`giving up on ${url} after ${attempt} attempts (HTTP ${res.status})`);
    const backoff = Math.min(30000, 2000 * 2 ** (attempt - 1));
    console.log(`  [throttle] HTTP ${res.status} -- backing off ${backoff}ms (attempt ${attempt})`);
    await sleep(backoff);
    return wmFetch(url, { binary, attempt: attempt + 1 });
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
}

async function loadJSON(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function saveJSON(p, data) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (const tok of argv) {
    if (tok.startsWith('--')) {
      const [k, v] = tok.slice(2).split('=');
      args[k] = v === undefined ? true : v;
    } else {
      args._.push(tok);
    }
  }
  return args;
}

function selectIds(allIds, args) {
  if (!args.id) return allIds;
  const wanted = new Set(String(args.id).split(',').map((s) => s.trim()).filter(Boolean));
  return allIds.filter((id) => wanted.has(id));
}

function stripHtml(html) {
  if (!html) return null;
  const text = String(html)
    // Commons extmetadata (e.g. Artist "Unknown author") commonly repeats
    // the visible text once more inside a display:none span for machine
    // readability. Drop those hidden duplicates before stripping tags, or
    // we'd end up with "Unknown authorUnknown author".
    .replace(/<span[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length ? text : null;
}

// ------------------------------------------------------------- resolve step

const PHIL_KEYWORDS = [
  'philosoph', 'stoic', 'monk', 'buddhis', 'zen', 'chan ', 'taois', 'theologia', 'theologian',
  'logician', 'mathematician', 'physicist', 'writer', 'author', 'novelist', 'playwright', 'poet',
  'essayist', 'psychiatrist', 'psychoanalyst', 'astronomer', 'scientist', 'sage', 'teacher',
  'preacher', 'bhikkhu', 'patriarch', 'master', 'emperor', 'statesman', 'orator', 'jurist',
  'roshi', 'rabbi', 'existential', 'absurd', 'haiku', 'zen master', 'political theorist',
];

function scoreCandidate(entity, rosterEn) {
  let score = 0;
  const label = (entity.labels?.en?.value || '').toLowerCase();
  const rosterLower = rosterEn.toLowerCase();
  if (label === rosterLower) score += 10;
  const enTitle = entity.sitelinks?.enwiki?.title;
  if (enTitle && enTitle.toLowerCase() === rosterLower) score += 5;
  const desc = (entity.descriptions?.en?.value || '').toLowerCase();
  if (PHIL_KEYWORDS.some((kw) => desc.includes(kw))) score += 3;
  return score;
}

function isHuman(entity) {
  const p31 = entity.claims?.P31 || [];
  return p31.some((c) => c.mainsnak?.datavalue?.value?.id === 'Q5');
}

function getTimeClaim(entity, prop) {
  const claim = entity.claims?.[prop]?.[0];
  if (!claim || claim.mainsnak?.snaktype !== 'value') return null;
  const dv = claim.mainsnak.datavalue?.value;
  if (!dv || !dv.time) return null;
  const m = /^([+-]\d+)-(\d\d)-(\d\d)T/.exec(dv.time);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const precision = dv.precision ?? 11;
  let circa = precision < 9; // less precise than "year"
  // P1480 "sourcing circumstances" qualifier, e.g. circa (Q5727902)
  const quals = claim.qualifiers?.P1480 || [];
  if (quals.some((q) => q.datavalue?.value?.id === 'Q5727902')) circa = true;
  return { year, circa };
}

async function wbSearch(term) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=en&type=item&format=json&limit=8`;
  const data = await wmFetch(url);
  return data.search || [];
}

async function wbGetEntities(ids) {
  if (!ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join('|')}&props=labels|descriptions|claims|sitelinks&languages=en|th&sitefilter=enwiki|thwiki&format=json`;
    const data = await wmFetch(url);
    Object.assign(out, data.entities || {});
  }
  return out;
}

async function resolveAuthor(author, cache, force) {
  const { id, en } = author;
  if (!force && cache[id] && !cache[id].error) {
    console.log(`resolve  ${id.padEnd(24)} cached -> ${cache[id].qid}`);
    return cache[id];
  }
  try {
    let qid = QID_OVERRIDE[id];
    let entity;
    if (qid) {
      const entities = await wbGetEntities([qid]);
      entity = entities[qid];
      if (!entity) throw new Error(`QID_OVERRIDE ${qid} not found`);
    } else {
      const term = SEARCH_TERM_OVERRIDE[id] || en;
      const hits = await wbSearch(term);
      const candQids = hits.map((h) => h.id);
      const entities = await wbGetEntities(candQids);
      const humans = candQids.map((q) => entities[q]).filter((e) => e && isHuman(e));
      if (!humans.length) {
        throw new Error(`no human candidate found for search "${term}" (${hits.length} raw hits)`);
      }
      humans.sort((a, b) => scoreCandidate(b, en) - scoreCandidate(a, en));
      entity = humans[0];
      qid = entity.id;
      const top = humans.slice(0, 3).map((e) => `${e.id}:${scoreCandidate(e, en)}(${e.descriptions?.en?.value || 'no desc'})`).join(' | ');
      console.log(`resolve  ${id.padEnd(24)} ${qid.padEnd(10)} candidates: ${top}`);
    }

    const labelTh = entity.labels?.th?.value || null;
    const sitelinkEn = entity.sitelinks?.enwiki?.title || null;
    const sitelinkTh = entity.sitelinks?.thwiki?.title || null;
    const born = getTimeClaim(entity, 'P569');
    const died = getTimeClaim(entity, 'P570');
    const p18claim = entity.claims?.P18?.[0];
    const p18 = p18claim?.mainsnak?.datavalue?.value || null;
    const commonsCatClaim = entity.claims?.P373?.[0];
    const commonsCategory = commonsCatClaim?.mainsnak?.datavalue?.value || null;

    const result = {
      qid,
      label_en: entity.labels?.en?.value || en,
      label_th: labelTh,
      description_en: entity.descriptions?.en?.value || null,
      sitelink_en: sitelinkEn,
      sitelink_th: sitelinkTh,
      born: born ? born.year : null,
      died: died ? died.year : null,
      circa: Boolean((born && born.circa) || (died && died.circa)),
      p18,
      commons_category: commonsCategory,
      error: null,
    };
    if (METADATA_OVERRIDE[id]) {
      Object.assign(result, METADATA_OVERRIDE[id]);
      console.log(`         [metadata override applied: ${JSON.stringify(METADATA_OVERRIDE[id])}]`);
    }
    console.log(`         -> th="${labelTh || ''}" born=${result.born} died=${result.died} circa=${result.circa} p18=${p18 ? 'yes' : 'no'}`);
    cache[id] = result;
    return result;
  } catch (err) {
    console.log(`resolve  ${id.padEnd(24)} ERROR: ${err.message}`);
    cache[id] = { error: err.message };
    return cache[id];
  }
}

async function cmdResolve(authors, args) {
  const cache = await loadJSON(WIKIDATA_CACHE_PATH, {});
  const ids = selectIds(authors.map((a) => a.id), args);
  for (const author of authors) {
    if (!ids.includes(author.id)) continue;
    await resolveAuthor(author, cache, Boolean(args.force));
    await saveJSON(WIKIDATA_CACHE_PATH, cache);
  }
  const errors = Object.entries(cache).filter(([id, v]) => ids.includes(id) && v.error);
  console.log(`\nresolve done: ${ids.length - errors.length}/${ids.length} ok, ${errors.length} error(s)`);
  if (errors.length) console.log('  errors:', errors.map(([id]) => id).join(', '));
}

// --------------------------------------------------------------- images step

function extFromUrl(u) {
  const m = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(u);
  return m ? m[1].toLowerCase() : 'jpg';
}

function inferAttributionRequired(extmetadata) {
  const explicit = extmetadata?.AttributionRequired?.value;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  const short = (extmetadata?.LicenseShortName?.value || '').toLowerCase();
  if (short.includes('cc0') || short.includes('public domain') || short.startsWith('pd')) return false;
  if (short.includes('cc by')) return true;
  return true; // safe default
}

async function commonsImageInfo(fileTitle) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1400&format=json`;
  const data = await wmFetch(url);
  const pages = data.query?.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined || !page.imageinfo?.length) return null;
  const info = page.imageinfo[0];
  const em = info.extmetadata || {};
  return {
    title: page.title,
    url: info.thumburl || info.url,
    origUrl: info.url,
    width: info.thumbwidth || info.width,
    height: info.thumbheight || info.height,
    mime: info.mime,
    license_short: em.LicenseShortName?.value || (em.UsageTerms?.value ?? null),
    license_url: em.LicenseUrl?.value || null,
    artist: stripHtml(em.Artist?.value),
    credit: stripHtml(em.Credit?.value),
    attribution_required: inferAttributionRequired(em),
    source_page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
  };
}

async function commonsCategoryMembers(category) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent('Category:' + category)}&cmnamespace=6&cmlimit=50&format=json`;
  const data = await wmFetch(url);
  return (data.query?.categorymembers || []).map((m) => m.title);
}

async function commonsSearch(term) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srnamespace=6&srlimit=12&format=json`;
  const data = await wmFetch(url);
  return (data.query?.search || []).map((m) => m.title);
}

async function pickImageForAuthor(id, wd, author) {
  if (IMAGE_OVERRIDE[id]) return IMAGE_OVERRIDE[id];
  if (wd.p18) return `File:${wd.p18}`;
  // No P18: try Commons category, then a plain search, and print candidates
  // for manual curation via IMAGE_OVERRIDE.
  let candidates = [];
  if (wd.commons_category) {
    candidates = await commonsCategoryMembers(wd.commons_category);
  }
  if (!candidates.length) {
    candidates = await commonsSearch(author.en);
  }
  if (candidates.length) {
    console.log(`images   ${id.padEnd(24)} NO P18 -- candidates: ${candidates.slice(0, 8).join(' | ')}`);
  } else {
    console.log(`images   ${id.padEnd(24)} NO P18 -- no Commons candidates found`);
  }
  return null; // needs manual IMAGE_OVERRIDE
}

async function downloadRaw(id, url, { refresh = false } = {}) {
  await fs.mkdir(RAW_DIR, { recursive: true });
  const ext = extFromUrl(url);
  const dest = path.join(RAW_DIR, `${id}.${ext}`);
  // refresh: the image changed (another file was picked), so the raw file on disk is the old picture.
  if (!refresh) {
    try {
      await fs.access(dest);
      return { dest, ext, cached: true };
    } catch {
      // fall through to download
    }
  }
  const buf = await wmFetch(url, { binary: true });
  await fs.writeFile(dest, buf);
  return { dest, ext, cached: false };
}

async function imagesForAuthor(author, wdCache, imgCache, force) {
  const { id } = author;
  const wd = wdCache[id];
  if (SYMBOL_IDS.has(id)) {
    imgCache[id] = { symbol: true };
    console.log(`images   ${id.padEnd(24)} symbol (no human image)`);
    return;
  }
  if (NO_IMAGE[id]) {
    imgCache[id] = { error: NO_IMAGE[id] };
    console.log(`images   ${id.padEnd(24)} NO IMAGE: ${NO_IMAGE[id]}`);
    return;
  }
  if (!wd || wd.error) {
    console.log(`images   ${id.padEnd(24)} SKIP (no resolved Wikidata entity)`);
    imgCache[id] = { error: 'no wikidata entity' };
    return;
  }
  // A cached pick only stands while it is still the file IMAGE_OVERRIDE or SOURCE_OVERRIDE asks for.
  const prev = imgCache[id];
  const src = SOURCE_OVERRIDE[id];
  const wanted = src ? src.title : IMAGE_OVERRIDE[id];
  const stale = Boolean(wanted && prev?.title !== wanted);
  if (!force && !stale && prev && !prev.error) {
    console.log(`images   ${id.padEnd(24)} cached -> ${prev.title}`);
    return;
  }
  try {
    if (src) {
      // Not on Commons: the scan comes from its own archive and the licence evidence is written out by hand.
      const { ext } = await downloadRaw(id, src.url, { refresh: prev?.title !== src.title || prev?.url !== src.url });
      imgCache[id] = {
        title: src.title,
        url: src.url,
        origUrl: src.url,
        license_short: src.license,
        license_url: src.license_url || null,
        artist: src.artist || null,
        credit: src.credit || null,
        attribution_required: Boolean(src.attribution_required),
        source_page: src.source_page,
        ext,
      };
      console.log(`images   ${id.padEnd(24)} ${src.title} (${src.license}, from ${new URL(src.source_page).host})`);
      return;
    }
    const fileTitle = await pickImageForAuthor(id, wd, author);
    if (!fileTitle) {
      imgCache[id] = { error: 'no image candidate, needs IMAGE_OVERRIDE' };
      return;
    }
    const info = await commonsImageInfo(fileTitle);
    if (!info) {
      imgCache[id] = { error: `imageinfo lookup failed for ${fileTitle}` };
      console.log(`images   ${id.padEnd(24)} ERROR: imageinfo lookup failed for ${fileTitle}`);
      return;
    }
    if (/svg|xml/i.test(info.mime)) {
      imgCache[id] = { error: `${fileTitle} is SVG, needs a raster IMAGE_OVERRIDE` };
      console.log(`images   ${id.padEnd(24)} ERROR: ${fileTitle} is SVG`);
      return;
    }
    const { ext } = await downloadRaw(id, info.url, { refresh: prev?.title !== info.title });
    imgCache[id] = { ...info, ext };
    console.log(`images   ${id.padEnd(24)} ${info.title} (${info.license_short}, attrib=${info.attribution_required})`);
  } catch (err) {
    imgCache[id] = { error: err.message };
    console.log(`images   ${id.padEnd(24)} ERROR: ${err.message}`);
  }
}

async function cmdImages(authors, args) {
  const wdCache = await loadJSON(WIKIDATA_CACHE_PATH, {});
  const imgCache = await loadJSON(IMAGE_CACHE_PATH, {});
  const ids = selectIds(authors.map((a) => a.id), args);
  for (const author of authors) {
    if (!ids.includes(author.id)) continue;
    await imagesForAuthor(author, wdCache, imgCache, Boolean(args.force));
    await saveJSON(IMAGE_CACHE_PATH, imgCache);
  }
  const errors = Object.entries(imgCache).filter(([id, v]) => ids.includes(id) && v.error);
  console.log(`\nimages done: ${ids.length - errors.length}/${ids.length} ok, ${errors.length} error/needs-override`);
  if (errors.length) console.log('  needs attention:', errors.map(([id]) => id).join(', '));
}

// -------------------------------------------------------------- process step

function eraGuessKind(wd) {
  const year = wd?.died ?? wd?.born;
  if (year == null) return 'painting';
  return year < 1840 ? 'painting' : 'photo';
}

async function processOne(id, imgCache, wdCache) {
  const img = imgCache[id];
  if (!img || img.symbol || img.error) return { skipped: true };
  const rawPath = path.join(RAW_DIR, `${id}.${img.ext}`);
  const buf = await fs.readFile(rawPath);
  const meta = await sharp(buf).rotate().metadata();
  const width = meta.width;
  const height = meta.height;

  const override = CROP_OVERRIDES[id];
  let base = sharp(buf).rotate();
  if (override) {
    const left = Math.max(0, Math.min(width - 1, Math.round(override.left * width)));
    const top = Math.max(0, Math.min(height - 1, Math.round(override.top * height)));
    const w = Math.max(1, Math.min(width - left, Math.round(override.width * width)));
    const h = Math.max(1, Math.min(height - top, Math.round(override.height * height)));
    base = base.extract({ left, top, width: w, height: h });
  }
  // A halftone print (a face screened into dots for a magazine page) is blurred just enough to melt the dots
  // before it is scaled down, or the screen beats against the new pixel grid (moire). sharp runs blur after
  // resize within one pipeline, so the blurred crop is made first and resized from there.
  if (DESCREEN[id]) base = sharp(await base.blur(DESCREEN[id]).png().toBuffer());
  const position = override ? 'centre' : sharp.strategy.attention;

  await fs.mkdir(OUT_DIR, { recursive: true });
  const mainBuf = await base
    .clone()
    .resize(720, 900, { fit: 'cover', position })
    .grayscale()
    .normalise()
    .webp({ quality: 72 })
    .toBuffer();
  await fs.writeFile(path.join(OUT_DIR, `${id}.webp`), mainBuf);

  const thumbBuf = await base
    .clone()
    .resize(240, 300, { fit: 'cover', position })
    .grayscale()
    .normalise()
    .webp({ quality: 72 })
    .toBuffer();
  await fs.writeFile(path.join(OUT_DIR, `${id}-thumb.webp`), thumbBuf);

  return { skipped: false, manual: Boolean(override) };
}

async function cmdProcess(authors, args) {
  const wdCache = await loadJSON(WIKIDATA_CACHE_PATH, {});
  const imgCache = await loadJSON(IMAGE_CACHE_PATH, {});
  const ids = selectIds(authors.map((a) => a.id), args);
  let done = 0;
  let skipped = 0;
  for (const author of authors) {
    if (!ids.includes(author.id)) continue;
    const r = await processOne(author.id, imgCache, wdCache);
    if (r.skipped) {
      skipped++;
    } else {
      done++;
      console.log(`process  ${author.id.padEnd(24)} ok${r.manual ? ' (manual crop)' : ' (auto attention crop)'}`);
    }
  }
  console.log(`\nprocess done: ${done} written, ${skipped} skipped (symbol/error/no image yet)`);
}

// ---------------------------------------------------------------- write step

function wikiUrl(lang, title) {
  if (!title) return null;
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

async function cmdWrite(authors, roster, args = {}) {
  const wdCache = await loadJSON(WIKIDATA_CACHE_PATH, {});
  const imgCache = await loadJSON(IMAGE_CACHE_PATH, {});
  // --id=a,b rebuilds only those entries. Every other entry of portraits.json stays exactly as it is: some carry
  // credits tidied by hand (artist, artist_note) that the caches do not know. The report is left alone then.
  const only = args.id ? new Set(selectIds(authors.map((a) => a.id), args)) : null;
  const portraits = {};
  const reportRows = [];
  const thDiffs = [];
  const unresolved = [];

  for (const author of authors) {
    const { id } = author;
    const wd = wdCache[id];
    const img = imgCache[id];

    if (!wd || wd.error) {
      unresolved.push(`${id}: Wikidata resolution failed (${wd?.error || 'not run'})`);
      reportRows.push({ id, kind: 'MISSING', license: '-', note: `unresolved: ${wd?.error || 'not run'}` });
      continue;
    }

    if (wd.label_th && wd.label_th !== author.th) {
      thDiffs.push({ id, roster_th: author.th, wikidata_th: wd.label_th });
    }

    const isSymbol = SYMBOL_IDS.has(id) || (img && img.symbol);
    let portraitBlock;
    if (isSymbol) {
      portraitBlock = {
        file: null,
        thumb: null,
        kind: 'symbol',
        title: null,
        artist: null,
        license: null,
        license_url: null,
        attribution_required: false,
        source_page: null,
      };
      reportRows.push({ id, kind: 'symbol', license: '-', note: 'app draws its own symbol, no human image used' });
    } else if (!img || img.error) {
      // No suitable free image, but we still have real Wikidata metadata for
      // this author (qid/dates/wiki links) -- keep the record, just leave
      // portrait.file null instead of dropping the author entirely.
      unresolved.push(`${id}: no usable image (${img?.error || 'images step not run'})`);
      reportRows.push({ id, kind: 'MISSING', license: '-', note: `no image: ${img?.error || 'not run'}` });
      portraitBlock = {
        file: null,
        thumb: null,
        kind: null,
        title: null,
        artist: null,
        license: null,
        license_url: null,
        attribution_required: false,
        source_page: null,
      };
    } else {
      const kind = KIND_OVERRIDE[id] || eraGuessKind(wd);
      portraitBlock = {
        file: `/portraits/${id}.webp`,
        thumb: `/portraits/${id}-thumb.webp`,
        kind,
        title: img.title,
        artist: ARTIST_OVERRIDE[id] || img.artist || null,
        license: img.license_short || null,
        license_url: img.license_url || null,
        attribution_required: Boolean(img.attribution_required),
        source_page: img.source_page,
        ...LICENSE_OVERRIDE[id],
      };
      reportRows.push({
        id,
        kind,
        license: portraitBlock.license || 'unknown',
        note: portraitBlock.attribution_required ? 'attribution required' : 'no attribution required',
      });
    }
    if (NOTE_OVERRIDE[id]) portraitBlock.note = NOTE_OVERRIDE[id];

    portraits[id] = {
      qid: wd.qid,
      th_label: wd.label_th || null,
      born: wd.born,
      died: wd.died,
      circa: wd.circa,
      wiki_en: wikiUrl('en', wd.sitelink_en),
      wiki_th: wikiUrl('th', wd.sitelink_th),
      portrait: portraitBlock,
    };
  }

  if (only) {
    const current = await loadJSON(PORTRAITS_JSON_PATH, {});
    const merged = {};
    for (const { id } of authors) {
      const entry = only.has(id) ? portraits[id] : current[id];
      if (entry) merged[id] = entry;
    }
    await saveJSON(PORTRAITS_JSON_PATH, merged);
    JSON.parse(await fs.readFile(PORTRAITS_JSON_PATH, 'utf8'));
    console.log(`\nwrite done: rebuilt ${[...only].join(', ')}; every other entry kept as it was; report not rewritten`);
    return;
  }

  await saveJSON(PORTRAITS_JSON_PATH, portraits);

  // -- validate JSON round-trips cleanly (per DATA-BRIEF.md instructions)
  JSON.parse(await fs.readFile(PORTRAITS_JSON_PATH, 'utf8'));

  const kindCounts = {};
  const licenseCounts = {};
  let attribRequiredCount = 0;
  for (const row of reportRows) {
    if (row.kind === 'MISSING') continue;
    kindCounts[row.kind] = (kindCounts[row.kind] || 0) + 1;
    licenseCounts[row.license] = (licenseCounts[row.license] || 0) + 1;
    if (row.note === 'attribution required') attribRequiredCount++;
  }

  const lines = [];
  lines.push('# Portraits report');
  lines.push('');
  lines.push(`Generated by scripts/data/portraits.mjs. ${Object.keys(portraits).length}/${authors.length} roster authors have an entry in data/portraits.json.`);
  lines.push('');
  lines.push('## Per author');
  lines.push('');
  lines.push('| id | kind | license | note |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of reportRows) {
    lines.push(`| ${row.id} | ${row.kind} | ${row.license} | ${row.note} |`);
  }
  lines.push('');
  lines.push('## Kind breakdown');
  lines.push('');
  for (const [k, v] of Object.entries(kindCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push('## License breakdown');
  lines.push('');
  for (const [k, v] of Object.entries(licenseCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('');
  lines.push(`Attribution required for ${attribRequiredCount} of ${reportRows.filter((r) => r.kind !== 'MISSING' && r.kind !== 'symbol').length} human-image portraits.`);
  lines.push('');
  lines.push('## Thai label differs from roster.json (roster.json left unchanged)');
  lines.push('');
  if (thDiffs.length) {
    lines.push('| id | roster.json th | Wikidata th label |');
    lines.push('| --- | --- | --- |');
    for (const d of thDiffs) lines.push(`| ${d.id} | ${d.roster_th} | ${d.wikidata_th} |`);
  } else {
    lines.push('None -- every Wikidata Thai label matched roster.json (or Wikidata had no Thai label).');
  }
  lines.push('');
  lines.push('## Unresolved / no suitable free image');
  lines.push('');
  if (unresolved.length) {
    for (const u of unresolved) lines.push(`- ${u}`);
  } else {
    lines.push('None.');
  }
  lines.push('');

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, lines.join('\n'), 'utf8');

  console.log(`\nwrite done: ${Object.keys(portraits).length}/${authors.length} authors in portraits.json`);
  console.log(`  kinds: ${JSON.stringify(kindCounts)}`);
  console.log(`  th label diffs: ${thDiffs.length}`);
  console.log(`  unresolved: ${unresolved.length}`);
}

// ---------------------------------------------------------------- status cmd

async function cmdStatus(authors) {
  const wdCache = await loadJSON(WIKIDATA_CACHE_PATH, {});
  const imgCache = await loadJSON(IMAGE_CACHE_PATH, {});
  let resolved = 0;
  let imaged = 0;
  let processed = 0;
  for (const { id } of authors) {
    const wd = wdCache[id];
    const img = imgCache[id];
    if (wd && !wd.error) resolved++;
    if (img && (!img.error)) imaged++;
    try {
      await fs.access(path.join(OUT_DIR, `${id}.webp`));
      processed++;
    } catch {
      if (img && img.symbol) processed++; // symbols have no file by design
    }
  }
  console.log(`authors: ${authors.length}`);
  console.log(`resolved (wikidata): ${resolved}/${authors.length}`);
  console.log(`images picked: ${imaged}/${authors.length}`);
  console.log(`webp written or symbol: ${processed}/${authors.length}`);
}

// --------------------------------------------------------------------- main

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const roster = JSON.parse(await fs.readFile(ROSTER_PATH, 'utf8'));
  const authors = roster.authors;

  switch (cmd) {
    case 'resolve':
      await cmdResolve(authors, args);
      break;
    case 'images':
      await cmdImages(authors, args);
      break;
    case 'process':
      await cmdProcess(authors, args);
      break;
    case 'write':
      await cmdWrite(authors, roster, args);
      break;
    case 'status':
      await cmdStatus(authors);
      break;
    case 'all':
      await cmdResolve(authors, args);
      await cmdImages(authors, args);
      await cmdProcess(authors, args);
      await cmdWrite(authors, roster, args);
      break;
    default:
      console.log('usage: node scripts/data/portraits.mjs <resolve|images|process|write|status|all> [--id=a,b] [--force]');
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
