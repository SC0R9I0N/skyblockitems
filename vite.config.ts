import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5183,
    strictPort: false,
    watch: {
      // keep the watcher out of build outputs — watching release/ locks
      // electron-builder's files mid-package and crashes the dev server
      ignored: ['**/release/**', '**/dist/**', '**/dist-electron/**', '**/.cache/**', '**/data/**'],
    },
  },
});
