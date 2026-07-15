// One-time seeding for the "New" tab: builds data/item-dates.json, a ledger
// of when each item id was first added to the game.
//
// Neither the Hypixel API nor NEU item files carry added-dates, but the NEU
// repo's git history does: an item file that exists today but was absent
// from the repo tree on Jan 1 of the current year was added this year.
// Two GitHub API requests total (last commit before Jan 1 + its full tree).
//
// Ledger semantics:
//   - present in the Jan-1 tree (or unknown to NEU) -> "<lastyear>-12-31"
//     (proven/assumed to pre-date this year)
//   - in NEU today but not on Jan 1 -> "<year>-01-01" (added this year; the
//     exact day within the year is unknown for seeded entries)
// From here on, fetch-data.mjs and the app's live refresh append exact
// first-seen dates for genuinely new ids, so the ledger stays accurate.
//
// Run once:  node scripts/seed-item-dates.mjs   (then `npm run data:pack`
// or `npm run data` is NOT required — items.json is stamped in place)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITEMS_FILE = path.join(ROOT, 'data', 'items.json');
const DATES_FILE = path.join(ROOT, 'data', 'item-dates.json');
const NEU_TARBALL = path.join(ROOT, '.cache', 'neu.tar.gz');
const REPO = 'NotEnoughUpdates/NotEnoughUpdates-REPO';

const year = new Date().getFullYear();

async function gh(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'skyblock-item-browser', accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// ---- NEU item files as of Jan 1 this year (via git tree) -----------------
console.log(`[seed] finding ${REPO} tree as of ${year}-01-01...`);
const commits = await gh(
  `https://api.github.com/repos/${REPO}/commits?until=${year}-01-01T00:00:00Z&per_page=1`,
);
if (!commits.length) throw new Error('no baseline commit found');
const baseSha = commits[0].sha;
console.log(`[seed] baseline commit ${baseSha.slice(0, 10)} (${commits[0].commit.committer.date})`);

const tree = await gh(`https://api.github.com/repos/${REPO}/git/trees/${baseSha}?recursive=1`);
if (tree.truncated) throw new Error('baseline tree truncated — unexpected repo size');
const baseline = new Set();
for (const e of tree.tree) {
  const m = /^items\/(.+)\.json$/.exec(e.path);
  if (m) baseline.add(m[1]);
}
console.log(`[seed] ${baseline.size} NEU item files existed on ${year}-01-01`);

// ---- NEU item files today (cached tarball) --------------------------------
const raw = zlib.gunzipSync(fs.readFileSync(NEU_TARBALL));
const current = new Set();
for (let pos = 0; pos + 512 <= raw.length; ) {
  const name = raw.toString('utf8', pos, pos + 100).replace(/\0.*$/, '');
  const size = parseInt(raw.toString('ascii', pos + 124, pos + 136).trim(), 8) || 0;
  const m = /items\/(.+)\.json$/.exec(name);
  if (m) current.add(m[1]);
  pos += 512 + Math.ceil(size / 512) * 512;
}
console.log(`[seed] ${current.size} NEU item files today`);

// ---- build the ledger over our dataset ids -------------------------------
const dataset = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
// dataset id -> candidate NEU file names (pets are per-rarity "TYPE;N" files)
const neuNames = (id) =>
  id.startsWith('PET_')
    ? [0, 1, 2, 3, 4, 5].map((r) => `${id.slice(4)};${r}`)
    : [id];

const preYear = `${year - 1}-12-31`;
const thisYear = `${year}-01-01`;
const ledger = {};
let fresh = 0;
for (const it of dataset.items) {
  const names = neuNames(it.id);
  const inCurrent = names.some((n) => current.has(n));
  const inBaseline = names.some((n) => baseline.has(n));
  const isNew = inCurrent && !inBaseline;
  ledger[it.id] = isNew ? thisYear : preYear;
  it.addedAt = ledger[it.id];
  if (isNew) fresh++;
}
dataset.meta.generatedAt = new Date().toISOString();

fs.writeFileSync(DATES_FILE, JSON.stringify(ledger, null, 1));
fs.writeFileSync(ITEMS_FILE, JSON.stringify(dataset));
console.log(`[seed] ${fresh} items added in ${year}; ${dataset.items.length - fresh} pre-${year}`);
console.log(`[seed] wrote data/item-dates.json + stamped items.json (commit item-dates.json!)`);
