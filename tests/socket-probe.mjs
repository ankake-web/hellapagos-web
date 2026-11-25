import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
const url = process.env.URL ?? 'http://127.0.0.1:4185';
const lobbyOnly = process.env.LOBBY_ONLY === '1';
const sockets = [];
function client() {
  const socket = io(url, { transports: ['websocket'], reconnection: false, timeout: 60000, autoConnect: false });
  sockets.push(socket);
  return socket;
}
function event(socket, name, match = () => true, ms = 70000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, handler);
      reject(Error('Timeout ' + name));
    }, ms);
    function handler(data) {
      if (match(data)) {
        clearTimeout(timer);
        socket.off(name, handler);
        resolve(data);
      }
    }
    socket.on(name, handler);
  });
}
const ack = (socket, name, p) =>
  new Promise((resolve, reject) => {
    socket
      .timeout(60000)
      .emit(name, p, (err, data) =>
        err ? reject(err) : data?.ok ? resolve(data) : reject(Error(data?.error ?? 'Bad acknowledgement')),
      );
  });
const connect = async (socket) => {
  const ready = event(socket, 'connect');
  socket.connect();
  await ready;
};
try {
  const host = client();
  await connect(host);
  const created = await ack(host, 'room:create', { name: '動作確認A' });
  const guest = client();
  await connect(guest);
  const joined = await ack(guest, 'room:join', { roomId: created.roomId, name: '動作確認B' });
  let ready = event(host, 'game:state', (s) => s.players.length === 3);
  host.emit('room:addBot');
  let s = await ready;
  assert.equal(s.phase, 'lobby');
  if (!lobbyOnly) {
    ready = event(host, 'game:state', (s) => s.phase === 'action');
    host.emit('game:start');
    s = await ready;
    assert.equal(s.wreckageRemaining, 62);
    assert.equal(s.players.find((p) => p.isYou).hand.length, 4);
    assert.ok(s.players.filter((p) => !p.isYou).every((p) => p.hand === undefined));
    const spectator = client();
    await connect(spectator);
    const specView = event(spectator, 'game:state', (s) => s.isSpectator);
    const watched = await ack(spectator, 'room:join', { roomId: created.roomId, name: '動作確認観戦' });
    assert.ok(watched.spectator);
    const sv = await specView;
    assert.ok(sv.players.every((p) => p.hand === undefined));
    host.disconnect();
    const returned = client();
    await connect(returned);
    ready = event(returned, 'game:state', (s) => s.youId === created.playerId);
    await ack(returned, 'room:rejoin', { roomId: created.roomId, playerId: created.playerId });
    const rejoined = await ready;
    assert.equal(rejoined.players.find((p) => p.isYou).id, created.playerId);
    assert.ok(rejoined.players.find((p) => p.isYou).hand);
    console.log('PASS: 74枚、本人の4枚、他者/観戦の秘匿、対戦途中の再接続');
  } else {
    const removed = event(host, 'game:state', (s) => s.players.length === 2);
    host.emit('room:removeBot', { botId: s.players.find((p) => p.isBot).id });
    await removed;
    console.log('PASS: 公開サーバーでルーム作成、別接続の参加、CPU追加');
  }
} finally {
  for (const socket of sockets) {
    if (socket.connected) socket.emit('room:leave');
    socket.close();
  }
}
