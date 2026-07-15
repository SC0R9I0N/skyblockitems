// Dev orchestrator: bundles the Electron main/preload with esbuild, starts the
// Vite dev server for the renderer, then launches Electron pointed at it.
import { createServer } from 'vite';
import esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function buildElectron() {
  await esbuild.build({
    entryPoints: ['electron/main.ts', 'electron/preload.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: 'dist-electron',
    outExtension: { '.js': '.cjs' },
    external: ['electron'],
    sourcemap: 'inline',
  });
}

await buildElectron();

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`[dev] renderer at ${url}`);

const electronPath = require('electron');
const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
