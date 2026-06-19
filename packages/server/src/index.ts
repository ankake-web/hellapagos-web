import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ActionType, ClientToServerEvents, ServerToClientEvents } from '@hellapagos/shared';
import { flushNow, topEntries } from './leaderboard.js';
import { GameError, RoomManager } from './rooms.js';

const PORT = Number(process.env.PORT ?? 8787);
const IS_PROD = process.env.NODE_ENV === 'production';
const CLIENT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

// CORS：本番で CLIENT_ORIGIN 未設定なら「同一オリジンのみ」（false）。'*' は開発時だけ。
// 複数オリジンはカンマ区切りで指定可。単一オリジン配信（サーバが dist を配る）なら設定不要。
const corsOrigin: string | string[] | boolean = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : IS_PROD
    ? false
    : '*';
if (IS_PROD && corsOrigin === false) {
  console.warn('[hellapagos] CLIENT_ORIGIN 未設定：本番はクロスオリジン接続を拒否します（単一オリジン配信のみ許可）。');
}

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/leaderboard', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  res.json(topEntries(limit));
});

// 本番：ビルド済みクライアントを同一オリジンで配信（dist があるときのみ）。
// 開発時は dist が無いので Vite (5174) が配信する。
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io')) return next();
    res.sendFile(resolve(CLIENT_DIST, 'index.html'));
  });
  console.log('[hellapagos] serving client from', CLIENT_DIST);
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOrigin },
  // 巨大ペイロードによる DoS を防ぐ（チャットや意図メッセージは小さい）。
  maxHttpBufferSize: 16 * 1024,
});

const manager = new RoomManager(io);

// ===== 入力検証ヘルパー =====
const ACTIONS = new Set<ActionType>(['fish', 'water', 'wood', 'search']);
function asAction(v: unknown): ActionType | null {
  return typeof v === 'string' && ACTIONS.has(v as ActionType) ? (v as ActionType) : null;
}
function asWoodPush(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0;
}
function asId(v: unknown, max = 64): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
}
function asStr(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** ハンドラ内の GameError をクライアントへ通知するラッパ */
function guard(socketId: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (err instanceof GameError) {
      io.to(socketId).emit('error', { code: err.code, message: err.message });
    } else {
      console.error(err);
      io.to(socketId).emit('error', { code: 'INTERNAL', message: 'サーバエラーが発生しました。' });
    }
  }
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name }, cb) => {
    guard(socket.id, () => {
      const res = manager.createRoom(asStr(name, 32), socket.id);
      cb?.({ ok: true, ...res });
    });
  });

  socket.on('room:join', ({ roomId, name }, cb) => {
    try {
      const res = manager.joinRoom(asStr(roomId, 16), asStr(name, 32), socket.id);
      cb?.({ ok: true, roomId: String(roomId).replace(/\D/g, ''), ...res });
    } catch (err) {
      const message = err instanceof GameError ? err.message : '参加に失敗しました。';
      cb?.({ ok: false, error: message });
    }
  });

  socket.on('room:rejoin', ({ roomId, playerId, token }, cb) => {
    try {
      const pid = asId(playerId);
      if (!pid) throw new GameError('BAD_INPUT', 'セッションが無効です。');
      manager.rejoin(asStr(roomId, 16), pid, typeof token === 'string' ? token : undefined, socket.id);
      cb?.({ ok: true, roomId: String(roomId).replace(/\D/g, ''), playerId: pid });
    } catch (err) {
      const message = err instanceof GameError ? err.message : '復帰に失敗しました。';
      cb?.({ ok: false, error: message });
    }
  });

  socket.on('room:leave', () => guard(socket.id, () => manager.leaveRoom(socket.id)));
  socket.on('room:addBot', () => guard(socket.id, () => manager.addBot(socket.id)));
  socket.on('room:removeBot', ({ botId }) => guard(socket.id, () => {
    const id = asId(botId);
    if (id) manager.removeBot(socket.id, id);
  }));
  socket.on('game:setConfig', (p) => guard(socket.id, () => manager.setRoomConfig(socket.id, p)));
  socket.on('game:start', () => guard(socket.id, () => manager.startGame(socket.id)));
  socket.on('game:quickStart', ({ name, bots }, cb) => {
    try {
      const res = manager.quickStart(asStr(name, 32), socket.id, Math.max(1, Math.min(5, Math.floor(Number(bots) || 2))));
      cb?.({ ok: true, ...res });
    } catch (err) {
      const message = err instanceof GameError ? err.message : '開始に失敗しました。';
      cb?.({ ok: false, error: message });
    }
  });
  socket.on('game:rematch', () => guard(socket.id, () => manager.rematch(socket.id)));

  socket.on('action:choose', ({ action, woodPush }) =>
    guard(socket.id, () => {
      const a = asAction(action);
      if (a) manager.submitAction(socket.id, a, asWoodPush(woodPush));
    }),
  );
  socket.on('card:play', ({ cardId, targetId }) =>
    guard(socket.id, () => {
      const id = asId(cardId);
      if (id) manager.submitCard(socket.id, id, asId(targetId) ?? null);
    }),
  );
  socket.on('card:gift', ({ cardId, targetId }) =>
    guard(socket.id, () => {
      const id = asId(cardId);
      const t = asId(targetId);
      if (id && t) manager.submitGift(socket.id, id, t);
    }),
  );
  socket.on('survival:pass', () => guard(socket.id, () => manager.submitSurvivalPass(socket.id)));
  socket.on('vote:cast', ({ targetId }) => guard(socket.id, () => manager.submitVote(socket.id, asId(targetId) ?? null)));
  socket.on('escape:vote', ({ leave }) => guard(socket.id, () => manager.submitEscape(socket.id, !!leave)));
  socket.on('chat:say', ({ text }) => guard(socket.id, () => manager.chat(socket.id, asStr(text, 200))));

  socket.on('disconnect', () => manager.handleDisconnect(socket.id));
});

httpServer.listen(PORT, () => {
  console.log(`[hellapagos] server listening on http://localhost:${PORT}`);
});

// ===== グレースフルシャットダウン：未書込みの戦績をフラッシュしてから閉じる =====
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[hellapagos] ${signal} 受信。シャットダウンします…`);
  try {
    flushNow();
  } catch (err) {
    console.error('[hellapagos] flush failed', err);
  }
  manager.dispose();
  io.close();
  httpServer.close(() => process.exit(0));
  // 一定時間で強制終了（接続が残っても確実に落とす）。
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// 取りこぼした例外で全ルームを道連れにしない（ログだけ残してプロセスは生かす）。
process.on('uncaughtException', (err) => console.error('[hellapagos] uncaughtException', err));
process.on('unhandledRejection', (err) => console.error('[hellapagos] unhandledRejection', err));
