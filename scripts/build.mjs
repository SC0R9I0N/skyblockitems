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
  process.exit(r.status ?? 0);
}
console.log('[build] done. Run `npm run dist` to package an executable.');
