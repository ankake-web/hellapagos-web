# ヘルパゴス Web版 — 単一オリジンの本番イメージ
# クライアント(Vite)をビルドし、サーバ(Express + Socket.IO)が同一オリジンで配信する。
FROM node:20-slim

WORKDIR /app

# 依存解決（devDependencies も必要：vite/typescript=ビルド、tsx=実行）
# NODE_ENV=production を install 前に設定すると devDeps が省かれるため、ここでは設定しない。
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
RUN npm ci

# ソースをコピーしてクライアントをビルド
COPY . .
RUN npm run build

# Render/Fly はそれぞれ PORT/内部ポートを渡す。デフォルトは 8787。
EXPOSE 8787
CMD ["npm", "run", "start", "-w", "@hellapagos/server"]
