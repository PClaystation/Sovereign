import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const resolveFromRoot = (...segments: string[]) => path.resolve(rootDir, ...segments);

const sharedAlias = {
  '@main': resolveFromRoot('src/main'),
  '@renderer': resolveFromRoot('src/renderer/src'),
  '@shared': resolveFromRoot('src/shared')
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAlias
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAlias
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: sharedAlias
    }
  }
});
