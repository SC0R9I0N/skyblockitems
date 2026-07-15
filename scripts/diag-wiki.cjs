// Diagnostic: can our Electron page context load wiki.hypixel.net images at
// all, and does a client-hints override change anything?
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, 'diag-out.txt');
const lines = [];
const log = (...a) => {
  lines.push(a.join(' '));
  fs.writeFileSync(OUT, lines.join('\n'));
};

const CHROME_VER = process.versions.chrome.split('.')[0];
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

process.on('uncaughtException', (e) => {
  log('UNCAUGHT:', e.stack ?? String(e));
  app.exit(1);
});
process.on('unhandledRejection', (e) => {
  log('UNHANDLED REJECTION:', (e && e.stack) ?? String(e));
});

setTimeout(() => {
  log('HARD TIMEOUT — exiting');
  app.exit(2);
}, 45_000);

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false });
    win.webContents.setAudioMuted(true);

    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Network.enable');
    await dbg.sendCommand('Network.setUserAgentOverride', {
      userAgent: CHROME_UA,
      acceptLanguage: 'en-US,en',
      platform: 'Win32',
      userAgentMetadata: {
        brands: [
          { brand: 'Chromium', version: CHROME_VER },
          { brand: 'Google Chrome', version: CHROME_VER },
          { brand: 'Not/A)Brand', version: '24' },
        ],
        fullVersion: process.versions.chrome,
        platform: 'Windows',
        platformVersion: '15.0.0',
        architecture: 'x86',
        model: '',
        mobile: false,
      },
    });
    log('ua override set');

    const statuses = [];
    dbg.on('message', (_e, method, params) => {
      if (method === 'Network.responseReceived' && params.response.url.includes('/images/')) {
        statuses.push(`${params.response.status} ${params.response.url.slice(0, 110)}`);
      }
    });

    await win.loadURL('https://wiki.hypixel.net/Amethyst_Crystal').catch((e) => {
      log('loadURL rejected:', String(e));
    });
    log('loaded, waiting 6s');
    await new Promise((r) => setTimeout(r, 6000));

    const pageInfo = await win.webContents.executeJavaScript(`({
      title: document.title,
      bodyStart: document.body.innerText.slice(0, 200),
      imgs: [...document.images].slice(0, 8).map((i) => ({
        src: i.src.slice(0, 100),
        ok: i.naturalWidth > 0,
      })),
    })`);
    log('TITLE:', pageInfo.title);
    log('BODY:', JSON.stringify(pageInfo.bodyStart));
    log('PAGE IMAGES:', JSON.stringify(pageInfo.imgs, null, 1));
    log('NETWORK /images/ responses (' + statuses.length + '):');
    for (const s of statuses.slice(0, 15)) log(' ', s);
    app.exit(0);
  } catch (e) {
    log('FATAL:', e.stack ?? String(e));
    app.exit(1);
  }
});
