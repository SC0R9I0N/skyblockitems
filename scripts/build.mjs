// Production build: renderer via Vite, main/preload via esbuild.
// With --dist, also packages a standalone executable via electron-builder.
import { build as viteBuild } from 'vite';
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

if (!fs.existsSync('data/items.json')) {
  console.error('data/items.json missing — run `npm run data` first.');
  process.exit(1);
}

console.log('[build] renderer (vite)...');
await viteBuild();

console.log('[build] main + preload (esbuild)...');
await esbuild.build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  minify: true,
});

if (process.argv.includes('--dist')) {
  console.log('[build] packaging with electron-builder...');
  const r = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['electron-builder', '--config', 'electron-builder.yml'],
    { stdio: 'inherit', shell: true },
  );
  if ((r.status ?? 0) !== 0) process.exit(r.status ?? 1);

  // Copy the installer to the repo root under a stable, versionless name so
  // end users can download that one file straight from GitHub (raw link)
  // without cloning the repo. Everything is bundled — no other downloads or
  // installed tools are needed to install and run the app.
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const src = `release/${pkg.productName} Setup ${pkg.version}.exe`;
  const dest = 'Skyblock-Item-Browser-Setup.exe';
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    const mib = fs.statSync(dest).size / (1024 * 1024);
    console.log(`[build] installer → ${dest} (${mib.toFixed(1)} MiB)`);
    if (mib > 95) {
      console.warn('[build] WARNING: installer is close to GitHub\'s hard 100 MiB file limit — trim before committing!');
    }
  } else {
    console.warn(`[build] installer not found at "${src}" — root copy skipped`);
  }
  process.exit(0);
}
console.log('[build] done. Run `npm run dist` to package an executable.');
