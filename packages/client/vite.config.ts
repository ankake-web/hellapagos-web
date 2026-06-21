import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const dir = path.dirname(fileURLToPath(import.meta.url));

// 配信先によって base（公開パス）を切り替える。
//  - 既定 '/' : Render の単一オリジン配信（サーバが dist をルートで配る）・ローカル開発。
//  - GitHub Pages : リポジトリ名サブパス配信なので VITE_BASE=/hellapagos-web/ を注入する
//    （.github/workflows/deploy.yml が設定）。
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
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
