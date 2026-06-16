# デプロイ手順

ヘルパゴス Web版は **単一オリジン構成**（Express + Socket.IO のサーバが、ビルド済みクライアントも同じドメインで配信）です。
そのため Node を常時稼働できるホスト1つにデプロイすれば動きます。WebSocket(Socket.IO) が使えるサービスを選んでください。

## 仕組み

- `npm run build` で `packages/client/dist` を生成。
- 本番ではサーバが `dist` を静的配信し、`/socket.io` は Socket.IO が処理、`/health`・`/leaderboard` は API。
- クライアントは**同一オリジン**へ接続するため、URLの設定は不要（`packages/client/src/socket.ts`）。
- ポートは環境変数 `PORT`（無ければ 8787）。

## Docker（共通）

```bash
docker build -t hellapagos .
docker run -p 8787:8787 hellapagos
# → http://localhost:8787
```

---

## A. Render（最も簡単・無料あり）

1. このリポジトリを GitHub に push。
2. [Render](https://render.com) で **New → Blueprint**、リポジトリを選択（同梱の `render.yaml` を自動検出）。
   - もしくは **New → Web Service**、`Runtime: Docker`、`Health Check Path: /health` を手動設定。
3. デプロイ完了後、`https://<service>.onrender.com` で公開。
4. 動作確認：`/health` が `{"ok":true}`、トップでルーム作成→AI追加→開始。

メモ:
- 無料プランはアイドルでスリープ（初回アクセスが数十秒遅い）。
- 無料はディスクが揮発するため**ランキングは再デプロイでリセット**。永続化するなら Disk を `/app/packages/server/data` にマウント（`render.yaml` のコメント参照）。

## B. Fly.io（Volume で永続化しやすい）

```bash
# 初回のみ
brew install flyctl   # or: curl -L https://fly.io/install.sh | sh
fly auth login

# デプロイ（fly.toml の app 名を一意なものに変更してから）
fly launch --no-deploy   # 既存 fly.toml / Dockerfile を使う
fly deploy

# 公開URL
fly open
```

メモ:
- `fly.toml` の `internal_port = 8787` はサーバ既定と一致済み。
- ランキング永続化は Volume を作成してマウント（`fly.toml` のコメント参照）。

## C. その他（Railway / VPS など）

- Dockerfile がそのまま使える。`PORT` を読むので各社のポート注入に対応。
- 素の VPS なら: `npm ci && npm run build && npm run start -w @hellapagos/server`（`PORT` を指定可）。

---

## 環境変数

| 変数 | 既定 | 用途 |
|------|------|------|
| `PORT` | 8787 | 待受ポート（多くのホストが自動注入） |
| `CLIENT_ORIGIN` | `*` | CORS 許可オリジン。単一オリジン運用なら既定でOK |

## デプロイ後チェックリスト

- [ ] `GET /health` が `{"ok":true}`
- [ ] トップ画面が表示される（静的配信OK）
- [ ] ルーム作成→AIボット追加→開始までできる（WebSocket疎通OK）
- [ ] 別端末/別ブラウザでルームIDから参加できる
- [ ] ゲーム終了後に `GET /leaderboard` へ記録される
