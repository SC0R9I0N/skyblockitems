// Downloads item images that wiki.hypixel.net refuses to serve to normal
// HTTP clients (Cloudflare hotlink protection returns 403 to plain fetch,
// browser UAs, Referer headers, and even Electron's net.fetch).
//
// The workaround: run inside Electron, load the wiki once in a hidden
// BrowserWindow (a real Chromium page context that passes the protection),
// then issue same-origin fetches FROM that page to download image bytes.
//
// Two target sets:
//   1. Animated textures: every `SkyBlock_items_*.gif` upload (enchanted
//      items, compasses, ...) matched to items by normalized name.
//   2. Broken icons: items whose icon is missing/paper/blocked-official —
//      resolved via `File:SkyBlock_items_<name>.png` or their stored URL.
//
// Output: data/icons/<ITEM_ID>.gif|png  (bundled into the app; the sbicon
// protocol serves bundled files before any remote URL).
//
// Run: npm run data:scrape   (then `npm run data` to refresh items.json)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ICONS_DIR = path.join(ROOT, 'data', 'icons');
const WIKI = 'https://wiki.hypixel.net';
const UA_HEADERS = { 'user-agent': 'skyblock-item-browser-pipeline' };
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normName = (s) =>
  s
    .toLowerCase()
    .replace(/\.(gif|png)$/, '')
    .replace(/^skyblock_items_/, '')
    .replace(/[^a-z0-9]+/g, '');

// The API itself is not blocked — only /images/* is.
async function api(params) {
  const res = await fetch(`${WIKI}/api.php?format=json&${params}`, { headers: UA_HEADERS });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Every SkyBlock_items_*.gif upload (paginated).
async function listAnimatedFiles() {
  const files = [];
  let cont = '';
  do {
    const json = await api(
      `action=query&list=allimages&aiprefix=SkyBlock_items_&aimime=image/gif&ailimit=500${cont}`,
    );
    files.push(...(json.query?.allimages ?? []));
    cont = json.continue?.aicontinue
      ? `&aicontinue=${encodeURIComponent(json.continue.aicontinue)}`
      : '';
  } while (cont);
  return files; // [{name, url, ...}]
}

// Batched imageinfo lookup: File title -> url.
async function fileUrls(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const json = await api(
      `action=query&prop=imageinfo&iiprop=url&redirects=1&titles=${encodeURIComponent(chunk.join('|'))}`,
    );
    const rename = new Map();
    for (const n of json.query?.normalized ?? []) rename.set(n.from, n.to);
    for (const r of json.query?.redirects ?? []) rename.set(r.from, r.to);
    const resolve = (t) => {
      let cur = t;
      for (let g = 0; rename.has(cur) && g < 5; g++) cur = rename.get(cur);
      return cur;
    };
    const byTitle = new Map();
    for (const p of Object.values(json.query?.pages ?? {})) {
      const url = p.imageinfo?.[0]?.url;
      if (url) byTitle.set(p.title, url);
    }
    for (const t of chunk) {
      const url = byTitle.get(resolve(t));
      if (url) out.set(t, url);
    }
  }
  return out;
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
    const items = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'),
    ).items;
    const hasFile = (id, ext) => fs.existsSync(path.join(ICONS_DIR, `${id}.${ext}`));

    // ---- target set 1: animated gifs matched to items by normalized name
    const byName = new Map();
    for (const it of items) {
      const key = normName(it.name);
      if (!key) continue;
      const list = byName.get(key) ?? [];
      list.push(it);
      byName.set(key, list);
    }
    const gifs = await listAnimatedFiles();
    const targets = new Map(); // id -> url
    let gifMatches = 0;
    for (const f of gifs) {
      const matched = byName.get(normName(f.name));
      if (!matched) continue;
      for (const it of matched) {
        gifMatches++;
        if (!hasFile(it.id, 'gif')) targets.set(it.id, f.url);
      }
    }
    console.log(`[scrape] ${gifs.length} animated gifs on the wiki, ${gifMatches} match items`);

    // ---- target set 2: items whose icon is still unusable
    const isPaper = (it) =>
      it.icon?.kind === 'texture' && it.icon.url?.endsWith('items/paper.png');
    const isBlocked = (it) =>
      it.icon?.kind === 'wiki' && (it.icon.url ?? '').startsWith(WIKI);
    const broken = items.filter(
      (it) =>
        (it.icon?.kind === 'none' || isPaper(it) || isBlocked(it)) &&
        !hasFile(it.id, 'png') &&
        !hasFile(it.id, 'gif') &&
        !targets.has(it.id),
    );
    const titleFor = (it) =>
      `File:SkyBlock_items_${it.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/ +/g, '_')}.png`;
    const titleToItems = new Map();
    for (const it of broken) {
      const t = titleFor(it);
      const list = titleToItems.get(t) ?? [];
      list.push(it);
      titleToItems.set(t, list);
    }
    const resolved = await fileUrls([...titleToItems.keys()]);
    let brokenWithUrl = 0;
    for (const [title, list] of titleToItems) {
      const url = resolved.get(title);
      for (const it of list) {
        const u = url ?? (isBlocked(it) ? it.icon.url : null); // stored pageimage as fallback
        if (u) {
          targets.set(it.id, u);
          brokenWithUrl++;
        }
      }
    }
    console.log(`[scrape] ${broken.length} broken icons, ${brokenWithUrl} with an official image url`);
    console.log(`[scrape] ${targets.size} files to download`);
    if (!targets.size) {
      console.log('[scrape] nothing to do');
      return app.exit(0);
    }

    // ---- real browser session past the hotlink protection
    // The WAF 403s fetch()/XHR to /images/* even from a real page context —
    // only genuine image loads (Sec-Fetch-Dest: image, same-origin referer)
    // are allowed. So each file is loaded as an <img> element and its raw
    // bytes (GIF animation included) captured via the DevTools protocol.
    const win = new BrowserWindow({ show: false });
    win.webContents.setAudioMuted(true);
    win.webContents.userAgent = CHROME_UA;
    await win.loadURL(`${WIKI}/Main_Page`);
    await sleep(3000);

    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Network.enable');

    const pathOf = (u) => {
      try {
        return decodeURIComponent(new URL(u).pathname);
      } catch {
        return u;
      }
    };
    const inflight = new Map(); // requestId -> {url, status}
    let waiter = null; // {path, resolve, reject} — downloads run one at a time
    dbg.on('message', async (_event, method, params) => {
      if (method === 'Network.responseReceived') {
        inflight.set(params.requestId, {
          url: params.response.url,
          status: params.response.status,
        });
        return;
      }
      if (method !== 'Network.loadingFinished' && method !== 'Network.loadingFailed') return;
      const info = inflight.get(params.requestId);
      inflight.delete(params.requestId);
      if (!info || !waiter || pathOf(info.url) !== waiter.path) return;
      const w = waiter;
      waiter = null;
      if (method === 'Network.loadingFailed') {
        return w.reject(new Error(params.errorText || 'load failed'));
      }
      if (info.status !== 200) return w.reject(new Error(`HTTP ${info.status}`));
      try {
        const body = await dbg.sendCommand('Network.getResponseBody', {
          requestId: params.requestId,
        });
        w.resolve(Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8'));
      } catch (e) {
        w.reject(e);
      }
    });

    const downloadAsImage = (url) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiter = null;
          reject(new Error('timeout'));
        }, 15_000);
        waiter = {
          path: pathOf(url),
          resolve: (b) => (clearTimeout(timer), resolve(b)),
          reject: (e) => (clearTimeout(timer), reject(e)),
        };
        win.webContents
          .executeJavaScript(
            `void new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = ${JSON.stringify(url)}; })`,
            true,
          )
          .catch(() => {});
      });

    let saved = 0;
    let failed = 0;
    let done = 0;
    for (const [id, url] of targets) {
      try {
        const buf = await downloadAsImage(url);
        if (buf.length < 50) throw new Error('suspiciously small file');
        const ext = buf.toString('ascii', 0, 4) === 'GIF8' ? 'gif' : 'png';
        fs.writeFileSync(path.join(ICONS_DIR, `${id}.${ext}`), buf);
        saved++;
      } catch (e) {
        failed++;
        if (failed <= 10) console.log('  FAIL', id, String(e.message ?? e));
      }
      if (++done % 50 === 0) console.log(`[scrape] ${done}/${targets.size} (${saved} saved)`);
    }
    console.log(`[scrape] done: ${saved} saved, ${failed} failed, ${targets.size} attempted`);
    app.exit(failed > saved ? 1 : 0);
  } catch (e) {
    console.error('[scrape] fatal:', e);
    app.exit(1);
  }
});
