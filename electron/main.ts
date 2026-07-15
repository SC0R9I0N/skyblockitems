import { app, BrowserWindow, ipcMain, protocol, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// sbicon:// serves item icons: bundled → local cache → remote download (cached).
protocol.registerSchemesAsPrivileged([
  { scheme: 'sbicon', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

const dataDir = () =>
  app.isPackaged ? path.join(process.resourcesPath, 'data') : path.join(app.getAppPath(), 'data');
const userFile = (name: string) => path.join(app.getPath('userData'), name);

// ------------------------------------------------------------------ dataset

let iconUrls = new Map<string, string>(); // item id -> remote icon url

function indexIcons(jsonText: string) {
  try {
    const parsed = JSON.parse(jsonText);
    const map = new Map<string, string>();
    for (const it of parsed.items ?? []) {
      if (it.icon?.url) map.set(it.id, it.icon.url);
    }
    iconUrls = map;
  } catch (e) {
    console.error('failed to index icons', e);
  }
}

// Prefer the refreshed userData copy only while it's at least as new as the
// bundled dataset — otherwise an old refresh would shadow a pipeline update
// that added fields.
function loadDatasetText(): string {
  const userCopy = userFile('items.json');
  const bundled = path.join(dataDir(), 'items.json');
  const bundledText = fs.readFileSync(bundled, 'utf8');
  if (fs.existsSync(userCopy)) {
    try {
      const userText = fs.readFileSync(userCopy, 'utf8');
      const userGen = JSON.parse(userText)?.meta?.generatedAt ?? '';
      const bundledGen = JSON.parse(bundledText)?.meta?.generatedAt ?? '';
      if (userGen >= bundledGen) return userText; // ISO timestamps sort lexically
    } catch {
      /* corrupt user copy — fall through to bundled */
    }
  }
  return bundledText;
}

const HYPIXEL_ITEMS_URL = 'https://api.hypixel.net/v2/resources/skyblock/items';

// The app only ever talks to these public, unauthenticated hosts. Everything
// is a plain GET; no tokens, cookies, or account data are sent anywhere.
const ALLOWED_WIKI_HOSTS = new Set(['wiki.hypixel.net', 'hypixelskyblock.minecraft.wiki']);
const ALLOWED_ICON_HOSTS = new Set([
  'mc-heads.net',
  'raw.githubusercontent.com',
  'hypixelskyblock.minecraft.wiki',
  'wiki.hypixel.net',
]);

function hostAllowed(url: string, allowed: Set<string>): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && allowed.has(u.host);
  } catch {
    return false;
  }
}

// Re-fetch live Hypixel data and merge it over the bundled dataset.
// NEU enrichment (lore/recipes/wiki) is kept from the bundle; new items get
// basic entries so they at least show up.
async function refreshDataset(): Promise<string> {
  const res = await net.fetch(HYPIXEL_ITEMS_URL);
  if (!res.ok) throw new Error(`Hypixel API ${res.status}`);
  const fresh = (await res.json()) as any;
  if (!fresh.success) throw new Error('Hypixel API success=false');

  const dataset = JSON.parse(loadDatasetText());
  const byId = new Map<string, any>(dataset.items.map((i: any) => [i.id, i]));

  const W = new Set(['SWORD', 'BOW', 'LONGSWORD', 'WAND', 'GAUNTLET', 'ARROW', 'ARROW_POISON', 'FISHING_WEAPON']);
  const A = new Set(['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS']);
  const E = new Set(['NECKLACE', 'CLOAK', 'BELT', 'GLOVES', 'BRACELET', 'ACCESSORY']);
  const tabFor = (c: string) =>
    W.has(c) ? 'weapons' : A.has(c) ? 'armor' : E.has(c) ? 'equipment' : c === 'PET_ITEM' ? 'pet_items' : c === 'PET' ? 'pets' : 'misc';

  for (const h of fresh.items) {
    const existing = byId.get(h.id);
    if (existing) {
      existing.name = h.name ?? existing.name;
      existing.tier = h.tier ?? existing.tier;
      existing.stats = h.stats && Object.keys(h.stats).length ? h.stats : existing.stats;
      existing.npcSellPrice = h.npc_sell_price ?? existing.npcSellPrice;
      if (h.category && h.category !== existing.category) {
        existing.category = h.category;
        existing.tab = tabFor(h.category);
      }
    } else {
      let icon: any = { kind: 'none' };
      if (h.skin?.value) {
        try {
          const skin = JSON.parse(Buffer.from(h.skin.value, 'base64').toString('utf8'));
          const url = skin?.textures?.SKIN?.url;
          if (url) icon = { kind: 'skull', url: `https://mc-heads.net/head/${url.split('/').pop()}` };
        } catch {}
      }
      dataset.items.push({
        id: h.id,
        name: h.name ?? h.id,
        category: h.category ?? 'NONE',
        tab: tabFor(h.category ?? 'NONE'),
        tier: h.tier ?? 'COMMON',
        lore: [],
        stats: h.stats,
        npcSellPrice: h.npc_sell_price,
        icon,
        sources: [],
      });
    }
  }
  dataset.meta.refreshedAt = new Date().toISOString();
  const text = JSON.stringify(dataset);
  fs.writeFileSync(userFile('items.json'), text);
  return text;
}

// ----------------------------------------------------------------- favorites

type FavStore = { ids: string[] };

function readFavorites(): FavStore {
  try {
    return JSON.parse(fs.readFileSync(userFile('favorites.json'), 'utf8'));
  } catch {
    return { ids: [] };
  }
}

function writeFavorites(store: FavStore) {
  const file = userFile('favorites.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, file);
}

// ------------------------------------------------------------------ settings

const DEFAULT_SETTINGS = {
  darkMode: false,
  hideVanilla: false,
  showPetStats: true,
  showPowerStats: true,
};

function readSettings(): typeof DEFAULT_SETTINGS {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(userFile('settings.json'), 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(s: typeof DEFAULT_SETTINGS) {
  const file = userFile('settings.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, file);
}

// -------------------------------------------------------------- app updates

// The repo root holds the standalone installer plus a build-info.json stamp
// written by the same `npm run dist` run. Comparing the bundled stamp's
// buildId with the remote one answers "is GitHub different from what I'm
// running?"; the update then downloads the installer, verifies its SHA-256
// against the stamp, and hands off to the silent NSIS install.
// SB_UPDATE_BASE_URL exists for integration tests only (points the checker at
// a local fixture server); end users always hit the hardcoded GitHub URL.
const UPDATE_BASE_URL =
  process.env.SB_UPDATE_BASE_URL ?? 'https://raw.githubusercontent.com/SC0R9I0N/skyblockitems/main';

type BuildInfo = {
  version: string;
  buildId: string;
  builtAt?: string;
  installerSha256?: string;
  installerSize?: number;
};

function localBuildInfo(): BuildInfo | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir(), 'build-info.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function fetchRemoteBuildInfo(): Promise<BuildInfo> {
  const res = await net.fetch(`${UPDATE_BASE_URL}/build-info.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`build-info.json: HTTP ${res.status}`);
  const info = (await res.json()) as BuildInfo;
  if (!info?.buildId || !/^[0-9a-f]{64}$/.test(info.installerSha256 ?? '')) {
    throw new Error('remote build-info.json is malformed');
  }
  return info;
}

async function checkForUpdate() {
  const local = localBuildInfo();
  if (!local) throw new Error('this copy has no build stamp (dev build?)');
  const remote = await fetchRemoteBuildInfo();
  return {
    updateAvailable: remote.buildId !== local.buildId,
    localVersion: local.version,
    remoteVersion: remote.version,
    remoteBuiltAt: remote.builtAt ?? null,
  };
}

async function downloadAndInstallUpdate(onProgress: (pct: number) => void) {
  const local = localBuildInfo();
  if (!local) throw new Error('this copy has no build stamp (dev build?)');
  const remote = await fetchRemoteBuildInfo();
  if (remote.buildId === local.buildId) return { started: false }; // nothing new

  const res = await net.fetch(`${UPDATE_BASE_URL}/Skyblock-Item-Browser-Setup.exe`, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`installer download: HTTP ${res.status}`);

  const hash = crypto.createHash('sha256');
  const chunks: Buffer[] = [];
  let received = 0;
  const total = remote.installerSize ?? (Number(res.headers.get('content-length')) || 0);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    hash.update(chunk);
    received += chunk.length;
    if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)));
  }

  const digest = hash.digest('hex');
  if (digest !== remote.installerSha256) {
    throw new Error('downloaded installer failed its integrity check (SHA-256 mismatch)');
  }
  if (remote.installerSize && received !== remote.installerSize) {
    throw new Error('downloaded installer is truncated');
  }

  const installerPath = path.join(app.getPath('temp'), `skyblock-item-browser-update-${Date.now()}.exe`);
  fs.writeFileSync(installerPath, Buffer.concat(chunks));
  onProgress(100);

  // Silent one-click install; --force-run relaunches the app when it's done.
  // The NSIS package closes the running instance itself, but quitting right
  // away makes the swap immediate and clean.
  spawn(installerPath, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 400);
  return { started: true };
}

// ---------------------------------------------------------------- wiki fetch

type WikiEntry = { url: string; text: string; fetchedAt: number };
let wikiCache: Record<string, WikiEntry> = {};
try {
  wikiCache = JSON.parse(fs.readFileSync(userFile('wikiCache.json'), 'utf8'));
} catch {}
let wikiSaveTimer: NodeJS.Timeout | null = null;

function saveWikiCacheSoon() {
  if (wikiSaveTimer) clearTimeout(wikiSaveTimer);
  wikiSaveTimer = setTimeout(() => {
    fs.writeFile(userFile('wikiCache.json'), JSON.stringify(wikiCache), () => {});
  }, 2000);
}

async function fetchWikiExtract(id: string, urls: string[]): Promise<WikiEntry | null> {
  const cachedEntry = wikiCache[id];
  if (cachedEntry && Date.now() - cachedEntry.fetchedAt < 7 * 86400e3) return cachedEntry;
  for (const pageUrl of urls ?? []) {
    if (!hostAllowed(pageUrl, ALLOWED_WIKI_HOSTS)) continue;
    try {
      const u = new URL(pageUrl);
      const title = decodeURIComponent(u.pathname.split('/').pop() ?? '');
      if (!title) continue;
      const api = `${u.origin}/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
      const res = await net.fetch(api, { headers: { 'user-agent': 'skyblock-item-browser' } });
      if (!res.ok) continue;
      const json = (await res.json()) as any;
      const pages = json?.query?.pages;
      if (!pages) continue;
      const page = Object.values(pages)[0] as any;
      const text = (page?.extract ?? '').trim();
      if (text) {
        const entry = { url: pageUrl, text: text.slice(0, 2000), fetchedAt: Date.now() };
        wikiCache[id] = entry;
        saveWikiCacheSoon();
        return entry;
      }
    } catch {
      /* try next url */
    }
  }
  return null;
}

// -------------------------------------------------------------------- window

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#1d1d21',
    autoHideMenuBar: true,
    title: 'Skyblock Item Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }
}

app.whenReady().then(() => {
  const iconCacheDir = userFile('iconCache');
  fs.mkdirSync(iconCacheDir, { recursive: true });

  // GIFs (animated textures) and PNGs are told apart by magic bytes; the
  // file extension then carries the right content-type for <img> playback.
  const isGifBuf = (b: Buffer) => b.length >= 4 && b.toString('ascii', 0, 4) === 'GIF8';

  protocol.handle('sbicon', async (req) => {
    try {
      const id = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
      if (!/^[A-Za-z0-9_.;-]+$/.test(id)) return new Response('bad id', { status: 400 });

      // Bundled (possibly scraped/animated) icons win over everything.
      for (const ext of ['gif', 'png']) {
        const bundled = path.join(dataDir(), 'icons', `${id}.${ext}`);
        if (fs.existsSync(bundled)) return net.fetch(`file://${bundled}`);
      }

      const remote = iconUrls.get(id);
      if (!remote || !hostAllowed(remote, ALLOWED_ICON_HOSTS)) {
        return new Response('no icon', { status: 404 });
      }
      // Cache key includes the source URL, so a dataset that upgrades an
      // item's icon (e.g. paper -> wiki sprite) invalidates the old file.
      const urlHash = crypto.createHash('sha1').update(remote).digest('hex').slice(0, 8);
      for (const ext of ['gif', 'png']) {
        const cachedIcon = path.join(iconCacheDir, `${id}.${urlHash}.${ext}`);
        if (fs.existsSync(cachedIcon)) return net.fetch(`file://${cachedIcon}`);
      }
      const res = await net.fetch(remote);
      if (!res.ok) return new Response('fetch failed', { status: 404 });
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = isGifBuf(buf) ? 'gif' : 'png';
      fs.writeFile(path.join(iconCacheDir, `${id}.${urlHash}.${ext}`), buf, () => {});
      return new Response(buf, {
        headers: { 'content-type': ext === 'gif' ? 'image/gif' : 'image/png' },
      });
    } catch {
      return new Response('error', { status: 500 });
    }
  });

  ipcMain.handle('data:load', () => {
    const text = loadDatasetText();
    indexIcons(text);
    return text;
  });

  ipcMain.handle('data:refresh', async () => {
    const text = await refreshDataset();
    indexIcons(text);
    return text;
  });

  ipcMain.handle('favorites:get', () => readFavorites().ids);

  ipcMain.handle('favorites:toggle', (_e, id: string) => {
    const store = readFavorites();
    const idx = store.ids.indexOf(id);
    if (idx >= 0) store.ids.splice(idx, 1);
    else store.ids.push(id);
    writeFavorites(store);
    return store.ids;
  });

  ipcMain.handle('wiki:extract', (_e, id: string, urls: string[]) => fetchWikiExtract(id, urls));

  ipcMain.handle('settings:get', () => readSettings());

  ipcMain.handle('settings:patch', (_e, patch: Partial<typeof DEFAULT_SETTINGS>) => {
    const merged = { ...readSettings(), ...patch };
    writeSettings(merged);
    return merged;
  });

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (hostAllowed(url, ALLOWED_WIKI_HOSTS)) shell.openExternal(url);
  });

  ipcMain.handle('update:check', () => checkForUpdate());

  ipcMain.handle('update:apply', (event) =>
    downloadAndInstallUpdate((pct) => {
      if (!event.sender.isDestroyed()) event.sender.send('update:progress', pct);
    }),
  );

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
