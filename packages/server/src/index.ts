import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@hellapagos/shared';
import { topEntries } from './leaderboard.js';
import { GameError, RoomManager } from './rooms.js';

const PORT = Number(process.env.PORT ?? 8787);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? '*';
const CLIENT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
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
  cors: { origin: CLIENT_ORIGIN },
});

const manager = new RoomManager(io);

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
      const res = manager.createRoom(name, socket.id);
      cb?.({ ok: true, ...res });
    });
  });

  socket.on('room:join', ({ roomId, name }, cb) => {
    try {
      const { playerId, spectator } = manager.joinRoom(roomId, name, socket.id);
      cb?.({ ok: true, roomId: roomId.toUpperCase(), playerId, spectator });
    } catch (err) {
      const message = err instanceof GameError ? err.message : '参加に失敗しました。';
      cb?.({ ok: false, error: message });
    }
  });

  socket.on('room:rejoin', ({ roomId, playerId }, cb) => {
    try {
      manager.rejoin(roomId, playerId, socket.id);
      cb?.({ ok: true, roomId: roomId.toUpperCase(), playerId });
    } catch (err) {
      const message = err instanceof GameError ? err.message : '復帰に失敗しました。';
      cb?.({ ok: false, error: message });
    }
  });

  socket.on('room:addBot', () => guard(socket.id, () => manager.addBot(socket.id)));
  socket.on('room:removeBot', ({ botId }) => guard(socket.id, () => manager.removeBot(socket.id, botId)));
  socket.on('game:setConfig', (p) => guard(socket.id, () => manager.setRoomConfig(socket.id, p)));
  socket.on('game:start', () => guard(socket.id, () => manager.startGame(socket.id)));

  socket.on('action:choose', ({ action, woodPush }) =>
    guard(socket.id, () => manager.submitAction(socket.id, action, woodPush ?? 0)),
  );
  socket.on('card:play', ({ cardId, targetId }) =>
    guard(socket.id, () => manager.submitCard(socket.id, cardId, targetId)),
  );
  socket.on('survival:pass', () => guard(socket.id, () => manager.submitSurvivalPass(socket.id)));
  socket.on('vote:cast', ({ targetId }) => guard(socket.id, () => manager.submitVote(socket.id, targetId)));
  socket.on('escape:vote', ({ leave }) => guard(socket.id, () => manager.submitEscape(socket.id, leave)));
  socket.on('chat:say', ({ text }) => guard(socket.id, () => manager.chat(socket.id, text)));

  socket.on('disconnect', () => manager.handleDisconnect(socket.id));
});

httpServer.listen(PORT, () => {
  console.log(`[hellapagos] server listening on http://localhost:${PORT}`);
});
