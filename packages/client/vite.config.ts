import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 共有パッケージを TS ソースで直接解決（別ビルド不要）
      '@hellapagos/shared': path.resolve(dir, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
});
