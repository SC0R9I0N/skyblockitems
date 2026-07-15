// Production build: renderer via Vite, main/preload via esbuild.
// With --dist, also packages a standalone executable via electron-builder.
import { build as viteBuild } from 'vite';
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
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
  // Stamp this build so the in-app Update button can tell whether GitHub has
  // a different build. The stamp is bundled into the app (extraResources);
  // after packaging, a matching build-info.json with the installer's SHA-256
  // is written to the repo root to be committed alongside the installer.
  const pkgInfo = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const buildId = `${new Date().toISOString()}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(
    'data/build-info.json',
    JSON.stringify({ version: pkgInfo.version, buildId }, null, 2),
  );

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
    const bytes = fs.readFileSync(dest);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(
      'build-info.json',
      JSON.stringify(
        { version: pkg.version, buildId, builtAt: new Date().toISOString(), installerSha256: sha256, installerSize: bytes.length },
        null,
        2,
      ),
    );
    const mib = bytes.length / (1024 * 1024);
    console.log(`[build] installer → ${dest} (${mib.toFixed(1)} MiB), stamp → build-info.json`);
    console.log('[build] NOTE: the in-app Update button needs BOTH root files on GitHub together:');
    console.log(`[build]       ${dest} + build-info.json (from the same build)`);
    if (mib > 95) {
      console.warn('[build] WARNING: installer is close to GitHub\'s hard 100 MiB file limit — trim before committing!');
    }
  } else {
    console.warn(`[build] installer not found at "${src}" — root copy skipped`);
  }
  process.exit(0);
}
console.log('[build] done. Run `npm run dist` to package an executable.');
