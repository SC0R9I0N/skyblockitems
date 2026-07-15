// Fills data/item-dates.json with REAL release dates from the official wiki.
//
// wiki.hypixel.net item pages carry their history as {{SkyBlock Version}}
// blocks inside the |history= parameter:
//     {{SkyBlock Version |customdate = June 12th, 2025
//                        |change1 = '''6th Anniversary Barn Skin''' Added.}}
//     {{SkyBlock Version |patch = 2061182 |change1 = '''...''' Added.}}
// A |patch= id resolves through Template:SkyBlock Version/<id>, whose body
// contains the actual date ("June 11th, 2019"). The entry whose change text
// says "Added" (falling back to the first entry) is the item's release.
//
// Wiki dates override the coarse seeded dates (seed-item-dates.mjs); items
// without an official wiki page keep their ledger value. Results are cached
// in .cache/wiki-release-dates.json, so re-runs only fetch new pages.
//
// Run:  npm run data:dates   (then rebuild; items.json is re-stamped here)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITEMS_FILE = path.join(ROOT, 'data', 'items.json');
const DATES_FILE = path.join(ROOT, 'data', 'item-dates.json');
const CACHE_FILE = path.join(ROOT, '.cache', 'wiki-release-dates.json');
const API = 'https://wiki.hypixel.net/api.php';
const BATCH = 50;
const DELAY_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ action: 'query', format: 'json', ...params })}`;
  const res = await fetch(url, { headers: { 'user-agent': 'skyblock-item-browser' } });
  if (!res.ok) throw new Error(`wiki API ${res.status}`);
  return res.json();
}

/** fetch raw wikitext for many titles, following redirects + continuation */
async function fetchWikitexts(titles) {
  const out = new Map(); // requested title -> wikitext|null
  const redirect = new Map();
  let params = {
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    redirects: '1',
    titles: titles.join('|'),
  };
  for (;;) {
    const j = await api(params);
    for (const r of j.query?.redirects ?? []) redirect.set(r.to, r.from);
    for (const p of Object.values(j.query?.pages ?? {})) {
      const text = p.revisions?.[0]?.slots?.main?.['*'];
      if (text === undefined) continue;
      const requested = redirect.get(p.title) ?? p.title;
      out.set(requested, text);
    }
    if (!j.continue) break;
    params = { ...params, ...j.continue };
    await sleep(DELAY_MS);
  }
  for (const t of titles) if (!out.has(t)) out.set(t, null);
  return out;
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "June 11th, 2019" -> "2019-06-11" (null if unparseable) */
function parseDate(text) {
  const m = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(text ?? '');
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

/** the release entry of a page: {patch} or {date} or null */
function releaseEntry(wikitext) {
  const blocks = [...wikitext.matchAll(/\{\{SkyBlock Version([\s\S]*?)\n\}\}/g)].map((m) => m[1]);
  if (!blocks.length) return null;
  // the entry that introduced the item; pages list history chronologically
  const added = blocks.find((b) => /change\d+\s*=[^\n]*\bAdded\b/.test(b)) ?? blocks[0];
  const patch = /\|\s*patch\s*=\s*(\d+)/.exec(added)?.[1];
  if (patch) return { patch };
  const custom = /\|\s*customdate\s*=\s*([^\n|]+)/.exec(added)?.[1];
  const date = parseDate(custom);
  return date ? { date } : null;
}

// ------------------------------------------------------------------- main
const dataset = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
const ledger = JSON.parse(fs.readFileSync(DATES_FILE, 'utf8'));
let cache = { pages: {}, patches: {} }; // pages: title -> ISO date | null
try {
  cache = { pages: {}, patches: {}, ...JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) };
} catch {}

// official-wiki page title per item (set pages may cover several items)
const titleToIds = new Map();
for (const it of dataset.items) {
  const url = (it.wiki ?? []).find((u) => u.includes('wiki.hypixel.net'));
  if (!url) continue;
  const title = decodeURIComponent(new URL(url).pathname.replace(/^\//, '')).replace(/_/g, ' ');
  if (!title || title.includes(':')) continue;
  if (!titleToIds.has(title)) titleToIds.set(title, []);
  titleToIds.get(title).push(it.id);
}

const todo = [...titleToIds.keys()].filter((t) => !(t in cache.pages));
console.log(`[dates] ${titleToIds.size} wiki pages for ${dataset.items.length} items; ${todo.length} to fetch`);

// pass 1: page wikitexts -> patch id or direct date
const pendingPatch = new Map(); // title -> patch id
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const texts = await fetchWikitexts(batch);
  for (const [title, text] of texts) {
    if (!text) {
      cache.pages[title] = null;
      continue;
    }
    const entry = releaseEntry(text);
    if (!entry) cache.pages[title] = null;
    else if (entry.date) cache.pages[title] = entry.date;
    else pendingPatch.set(title, entry.patch);
  }
  process.stdout.write(`\r[dates] pages ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  await sleep(DELAY_MS);
}
if (todo.length) console.log();

// pass 2: resolve patch ids -> dates via Template:SkyBlock Version/<id>
const patchIds = [...new Set([...pendingPatch.values()])].filter((p) => !(p in cache.patches));
console.log(`[dates] ${pendingPatch.size} pages need a patch date; ${patchIds.length} patch templates to fetch`);
for (let i = 0; i < patchIds.length; i += BATCH) {
  const batch = patchIds.slice(i, i + BATCH);
  const texts = await fetchWikitexts(batch.map((p) => `Template:SkyBlock Version/${p}`));
  for (const [title, text] of texts) {
    const id = title.split('/').pop();
    cache.patches[id] = parseDate(text ?? '');
  }
  process.stdout.write(`\r[dates] patches ${Math.min(i + BATCH, patchIds.length)}/${patchIds.length}`);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  await sleep(DELAY_MS);
}
if (patchIds.length) console.log();
for (const [title, patch] of pendingPatch) cache.pages[title] = cache.patches[patch] ?? null;
fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

// merge: wiki dates override the ledger; stamp the dataset
let updated = 0, resolved = 0;
for (const [title, ids] of titleToIds) {
  const date = cache.pages[title];
  if (!date) continue;
  resolved++;
  for (const id of ids) {
    if (ledger[id] !== date) {
      ledger[id] = date;
      updated++;
    }
  }
}
for (const it of dataset.items) if (ledger[it.id]) it.addedAt = ledger[it.id];
dataset.meta.generatedAt = new Date().toISOString();
fs.writeFileSync(DATES_FILE, JSON.stringify(ledger, null, 1));
fs.writeFileSync(ITEMS_FILE, JSON.stringify(dataset));

const years = {};
for (const it of dataset.items) years[(it.addedAt ?? '?').slice(0, 4)] = (years[(it.addedAt ?? '?').slice(0, 4)] ?? 0) + 1;
console.log(`[dates] ${resolved}/${titleToIds.size} pages dated; ${updated} ledger entries updated`);
console.log('[dates] items by release year:', JSON.stringify(years));
