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

## A. Render（最も簡単・無料あり／Node ランタイム）

### 方法1：手動で Web Service（最も確実・推奨）

1. [Render](https://render.com) で **New → Web Service**。
2. リポジトリ `ankake-web/hellapagos-web` を接続。
3. 以下を設定：
   - **Runtime**: `Node`
   - **Build Command**: `npm ci --include=dev && npm run build`
   - **Start Command**: `npm run start -w @hellapagos/server`
   - **Health Check Path**: `/health`
   - **Instance Type**: Free
4. **Create Web Service** をクリック → ビルド〜デプロイ（数分）。
5. ページ上部のURL（`https://hellapagos-xxxx.onrender.com`）で公開。

### 方法2：Blueprint（render.yaml 自動構成）

1. **New → Blueprint** → リポジトリを選択（`render.yaml` を検出）。
2. プレビューに `hellapagos` が出たら **Apply / Create Services** を必ずクリック（ここを押さないと作成されない）。

動作確認：`/health` が `{"ok":true}`、トップでルーム作成→AI追加→開始。

メモ:
- 無料プランはアイドルでスリープ（初回アクセスが数十秒遅い）＋**ディスク揮発＝戦績が再デプロイで消える**。
- `render.yaml` は永続ディスク（`/var/data`）と `LEADERBOARD_DIR=/var/data` を設定済み（starter 以上が必要）。free のままなら戦績は揮発する前提で運用すること。
- `tsx` 等の devDependencies はビルド時に入り、その node_modules が実行時にも使われる（`--include=dev` で確実に導入）。

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
- 戦績の Volume と `LEADERBOARD_DIR=/data` は `fly.toml` に設定済み。デプロイ前に `fly volumes create hellapagos_data --size 1 --region nrt` を実行。
- ライブ運用では `min_machines_running = 1`（設定済み）。アイドル自動停止で**対戦中の卓が消える**のを防ぐため。コスト最優先なら 0 に戻す。
- `kill_timeout`（設定済み）でグレースフルシャットダウンの猶予を確保（戦績フラッシュ）。

## C. その他（Railway / VPS など）

- Dockerfile がそのまま使える。`PORT` を読むので各社のポート注入に対応。
- 素の VPS なら: `npm ci && npm run build && npm run start -w @hellapagos/server`（`PORT` を指定可）。

---

## 環境変数

| 変数 | 既定 | 用途 |
|------|------|------|
| `PORT` | 8787 | 待受ポート（多くのホストが自動注入） |
| `NODE_ENV` | （未設定） | `production` で本番動作（CORS をクロスオリジン拒否側に倒す） |
| `CLIENT_ORIGIN` | 開発: `*` / 本番: 同一オリジンのみ | CORS 許可オリジン。単一オリジン配信なら未設定でOK。別ドメインから接続するときだけ実ドメイン（カンマ区切り可）。**本番で `*` にはしない** |
| `LEADERBOARD_DIR` | `packages/server/data` | 戦績JSONの保存先。**永続ディスクのマウント先**を指すこと（揮発ディスクだと再デプロイで消える） |
| `ANTHROPIC_API_KEY` | （未設定） | CPUの会話をClaudeで生成（未設定ならスクリプト交渉へ自動フォールバック） |
| `HELPAGOS_BOT_MODEL` | `claude-haiku-4-5` | CPU発言の生成モデル。表現力重視なら `claude-opus-4-8`（コスト増） |
| `HELPAGOS_BOT_MAX_CONCURRENT` | 4 | LLM同時呼び出し上限（コスト防護） |
| `HELPAGOS_BOT_MAX_PER_MIN` | 120 | LLM毎分呼び出し上限（コスト防護） |

### 安全性・運用の要点（本番）
- **CORS**: 本番（`NODE_ENV=production`）で `CLIENT_ORIGIN` 未設定なら同一オリジンのみ許可（クロスオリジン濫用＝ルーム乱立・LLMコスト消費の踏み台を防ぐ）。
- **再接続認証**: 席はサーバ発行の秘密トークンで保護され、他人のIDだけでは乗っ取れない。
- **グレースフルシャットダウン**: SIGTERM/SIGINT で戦績を即フラッシュしてから終了。ホストの停止猶予（Render: 標準 / Fly: `kill_timeout`）を確保しておく。
- **ルームGC**: 決着後・無人放置のルームは自動回収（メモリリーク防止）。
- **スケール**: 状態はプロセスメモリ常駐のため当面は**単一インスタンス＋スティッキー**前提（Socket.IO Redisアダプタ未導入）。水平スケールは将来課題。

## デプロイ後チェックリスト

- [ ] `GET /health` が `{"ok":true}`
- [ ] トップ画面が表示される（静的配信OK）
- [ ] ルーム作成→AIボット追加→開始までできる（WebSocket疎通OK）
- [ ] 別端末/別ブラウザでルームIDから参加できる
- [ ] ゲーム終了後に `GET /leaderboard` へ記録される
