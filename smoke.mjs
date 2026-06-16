// E2E スモーク: ルーム作成→ボット3体→開始→ホストを自動操作。
// ゲーム開始直後に観戦者を参加させ、観戦フラグ・チャット双方向・拳銃プレイ・gameover到達を検証する。
// （AI同士だとゲームは数十msで終わるため、観戦者参加は「ホストの最初のゲーム状態」で即トリガする）
import { io } from 'socket.io-client';

const URL = 'http://localhost:8787';
const host = io(URL, { transports: ['websocket'] });
const spec = io(URL, { transports: ['websocket'] });

const flags = {
  specJoinedAsSpectator: false,
  specSawState: false,
  hostGotSpecChat: false,
  specGotHostChat: false,
  gunFired: false,
  gameover: false,
  botTaunt: false,
  gunKillSeen: false,
  soleSurvivorActive: false,
  personaRevealed: false,
  personaHiddenDuringPlay: true,
  leaderboardOk: false,
};
let roomId = null;
let specJoinTriggered = false;
let hostSaidChat = false;

const finish = (code, msg) => {
  console.log(msg);
  host.close();
  spec.close();
  process.exit(code);
};
const timer = setTimeout(() => finish(1, '✗ タイムアウト: ' + JSON.stringify(flags)), 28000);

const checkHostMsg = (m) => {
  if (!m.isSpectator && m.name === 'ホスト') flags.specGotHostChat = true;
};

host.on('connect', () => {
  host.emit('room:create', { name: 'ホスト' }, (res) => {
    if (!res.ok) return finish(1, '✗ ルーム作成失敗');
    roomId = res.roomId;
    console.log('✓ ルーム作成:', roomId);
    host.emit('room:addBot');
    host.emit('room:addBot');
    host.emit('room:addBot');
    host.emit('game:setConfig', { soleSurvivor: true }); // ソロサバイバル検証
    setTimeout(() => host.emit('game:start'), 150);
  });
});

host.on('chat:msg', (m) => {
  if (m.isSpectator) flags.hostGotSpecChat = true;
  if (!m.isSpectator && m.name.startsWith('CPU')) flags.botTaunt = true; // ボットの煽り
});
spec.on('chat:msg', checkHostMsg);
spec.on('chat:history', (msgs) => msgs.forEach(checkHostMsg));

spec.on('game:state', (s) => {
  flags.specSawState = true;
  if (s.isSpectator) flags.specJoinedAsSpectator = true;
});

host.on('error', (e) => console.log('  [host error]', e.message));

host.on('game:state', (s) => {
  const me = s.players.find((p) => p.isYou);
  if (s.log?.some((e) => e.text.includes('撃ち殺し'))) flags.gunKillSeen = true; // 狙撃手の拳銃
  // 進行中は性格が秘匿されていること
  if (s.phase !== 'gameover' && s.players.some((p) => p.isBot && p.persona)) {
    flags.personaHiddenDuringPlay = false;
  }

  // ゲーム開始直後（最初のゲーム状態）で観戦者参加 → そのあとホストが発言
  if (!specJoinTriggered && s.phase !== 'lobby' && roomId) {
    specJoinTriggered = true;
    spec.emit('room:join', { roomId, name: 'ギャラリー' }, (r) => {
      if (r.ok && r.spectator) {
        flags.specJoinedAsSpectator = true;
        spec.emit('chat:say', { text: '観戦してます！' });
        if (!hostSaidChat) {
          hostSaidChat = true;
          host.emit('chat:say', { text: 'みんな協力しよう（嘘）' });
        }
      }
    });
  }

  if (s.phase === 'gameover') {
    if (flags.gameover) return;
    flags.gameover = true;
    flags.soleSurvivorActive = s.config.soleSurvivor === true;
    flags.personaRevealed = s.players.some((p) => p.isBot && !!p.persona);
    const escaped = s.players.filter((p) => p.escaped).map((p) => p.name);
    console.log(`✓ gameover (${s.day}日目) 脱出:[${escaped}]`);
    // チャット往復＆リーダーボード記録が反映されるまで猶予を置いて検証
    setTimeout(async () => {
      clearTimeout(timer);
      try {
        const r = await fetch(`${URL}/leaderboard`);
        const arr = await r.json();
        flags.leaderboardOk = Array.isArray(arr) && arr.some((e) => e.name === 'ホスト' && e.games >= 1);
      } catch {
        flags.leaderboardOk = false;
      }
      const ok =
        flags.gameover &&
        flags.specJoinedAsSpectator &&
        flags.specSawState &&
        flags.hostGotSpecChat &&
        flags.specGotHostChat &&
        flags.soleSurvivorActive &&
        flags.personaRevealed &&
        flags.personaHiddenDuringPlay &&
        flags.leaderboardOk;
      finish(ok ? 0 : 1, (ok ? '✓ E2E スモーク成功 ' : '✗ 検証失敗 ') + JSON.stringify(flags));
    }, 700);
    return;
  }

  if (!me || (!me.alive && !me.escaped) || me.escaped) return;

  // 拳銃を持っていたら撃つ（item:play の検証）
  const gun = (me.items ?? []).find((it) => it.kind === 'gun');
  if (gun && (s.phase === 'action' || s.phase === 'vote')) {
    const t = s.players.find((p) => p.alive && !p.escaped && p.id !== me.id);
    if (t) {
      host.emit('item:play', { itemId: gun.id, targetId: t.id });
      flags.gunFired = true;
    }
  }

  switch (s.phase) {
    case 'action':
      if (!me.hasActed) {
        const a =
          s.water < s.need ? 'water' : s.food < s.need ? 'fish' : s.raftCapacity < s.need ? 'wood' : 'search';
        host.emit('action:choose', { action: a });
      }
      break;
    case 'survival':
      if (!me.hasContributed)
        host.emit('survival:contribute', { food: me.hand?.food ?? 0, water: me.hand?.water ?? 0 });
      break;
    case 'vote':
      if (!me.hasVoted) {
        const t = s.players.find((p) => p.alive && !p.escaped && p.id !== me.id);
        host.emit('vote:cast', { targetId: t ? t.id : null });
      }
      break;
    case 'escape':
      if (!me.hasEscapeVoted) host.emit('escape:vote', { leave: true });
      break;
  }
});
