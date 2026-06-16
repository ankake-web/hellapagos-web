// E2E スモーク（新ターン制モデル）: ホスト人間＋ボット3で1ゲーム完走するか検証。
import { io } from 'socket.io-client';

const URL = process.env.URL ?? 'http://localhost:8787';
const host = io(URL, { transports: ['websocket'] });
let roomId = null;
let done = false;
let lastLog = -1;
let lastChange = Date.now();

const finish = (code, msg) => {
  if (done) return;
  done = true;
  console.log(msg);
  host.close();
  process.exit(code);
};
const timer = setTimeout(() => finish(1, '✗ タイムアウト（デッドロックの可能性）'), 90000);
// 進行停滞ウォッチドッグ
const watch = setInterval(() => {
  if (Date.now() - lastChange > 20000) {
    clearInterval(watch);
    finish(1, '✗ 20秒進行なし＝デッドロック疑い');
  }
}, 3000);

host.on('connect', () => {
  host.emit('room:create', { name: 'ホスト' }, (res) => {
    if (!res.ok) return finish(1, '✗ 作成失敗');
    roomId = res.roomId;
    console.log('✓ room', roomId);
    host.emit('room:addBot');
    host.emit('room:addBot');
    host.emit('room:addBot');
    host.emit('game:setConfig', { speed: 'fast', difficulty: 'normal' });
    setTimeout(() => host.emit('game:start'), 200);
  });
});
host.on('error', (e) => console.log('  [err]', e.message));

host.on('game:state', (s) => {
  if (s.log?.length && s.log[s.log.length - 1].id !== lastLog) {
    lastLog = s.log[s.log.length - 1].id;
    lastChange = Date.now();
  }
  const me = s.players.find((p) => p.isYou);

  if (s.phase === 'gameover') {
    clearTimeout(timer);
    clearInterval(watch);
    const esc = s.players.filter((p) => p.escaped).map((p) => p.name);
    const rounds = s.round;
    console.log(`✓ gameover R${rounds} 脱出:[${esc}] 座席${s.raftSeats}`);
    return finish(0, '✓ 新モデルE2E 完走成功');
  }
  if (!me || !me.alive || me.escaped) return;

  if (s.phase === 'action' && s.isYourTurn) {
    const need = s.seatsNeeded;
    const waterShort = s.water < need;
    const foodShort = s.food < need;
    let a = 'wood';
    let push = 2;
    if (waterShort && s.currentPrecip > 0) { a = 'water'; push = 0; }
    else if (foodShort) { a = 'fish'; push = 0; }
    else { a = 'wood'; push = 2; }
    host.emit('action:choose', { action: a, woodPush: push });
  } else if (s.phase === 'survival' && !me.acted) {
    host.emit('survival:pass');
  } else if (s.phase === 'vote' && !me.sick && me.vote === undefined) {
    const t = s.players.find((p) => p.alive && !p.escaped && p.id !== me.id);
    host.emit('vote:cast', { targetId: t ? t.id : null });
  } else if (s.phase === 'escape') {
    host.emit('escape:vote', { leave: true });
  }
});
