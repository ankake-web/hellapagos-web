import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aliveCount,
  alivePlayers,
  awaiting,
  castVote,
  createGame,
  currentActorId,
  giftCard,
  isEscapeReady,
  isSurvivalReady,
  isVoteReady,
  passSurvival,
  playCard,
  resolveEscape,
  resolveSurvival,
  resolveVote,
  setEscapeChoice,
  startGame,
  takeAction,
} from './engine.js';
import { aiAction, aiEscape, aiSurvivalPlays, aiVote } from './ai.js';
import { Rng } from './rng.js';
import type { Card, GameState, Player } from './types.js';

function bots(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
}
function mk(n: number, seed = 1): GameState {
  return startGame(createGame(bots(n), { seed }));
}
function actorId(s: GameState): string {
  return currentActorId(s)!;
}
function give(p: Player, id: string, kind: Card['kind']): void {
  p.hand.push({ id, kind });
}

// ===== fruit_basket：行動フェイズでの先撃ち荒らしを禁止（バグ修正の回帰） =====
test('fruit_basket は行動フェイズで使えず、共有資源を勝手に0にできない', () => {
  const s = mk(3);
  const id = actorId(s);
  const me = s.players.find((p) => p.id === id)!;
  give(me, 'fb', 'fruit_basket');
  const food0 = s.food;
  const water0 = s.water;
  const after = playCard(s, id, 'fb');
  assert.equal(after.food, food0, '食料は変化しない');
  assert.equal(after.water, water0, '水は変化しない');
  assert.ok(!after.fruitUsed, 'fruitUsed が立たない');
});

test('fruit_basket は生存ウィンドウで不足時のみ有効（誰も死なない）', () => {
  const base = mk(3);
  const s: GameState = structuredClone(base);
  s.phase = 'survival';
  s.water = 0; // 生存3人に対し水0＝不足
  s.food = 9;
  for (const p of s.players) p.acted = false;
  const me = s.players[0];
  give(me, 'fb', 'fruit_basket');
  const after = playCard(s, me.id, 'fb');
  assert.ok(after.fruitUsed, '不足時は発動する');
  assert.equal(after.food, 0);
  assert.equal(after.water, 0);
});

// ===== 指名贈与：カードが相手へ移る =====
test('giftCard は手番中に資源カードを相手へ渡す', () => {
  const s = mk(3);
  const id = actorId(s);
  const giver = s.players.find((p) => p.id === id)!;
  const receiver = s.players.find((p) => p.id !== id && p.alive)!;
  give(giver, 'sw', 'sandwich');
  const before = receiver.hand.length;
  const after = giftCard(s, giver.id, 'sw', receiver.id);
  const g2 = after.players.find((p) => p.id === giver.id)!;
  const r2 = after.players.find((p) => p.id === receiver.id)!;
  assert.ok(!g2.hand.some((c) => c.id === 'sw'), '渡した側からは消える');
  assert.equal(r2.hand.length, before + 1, '受け取り側に増える');
  assert.ok(r2.hand.some((c) => c.id === 'sw'));
});

test('giftCard は自分の手番でなければ無効', () => {
  const s = mk(3);
  const id = actorId(s);
  const other = s.players.find((p) => p.id !== id && p.alive)!;
  give(other, 'sw', 'sandwich'); // 手番でない人が渡そうとする
  const after = giftCard(s, other.id, 'sw', id);
  assert.equal(after, s, '状態は変わらない（同一参照）');
});

// ===== 抜け駆け脱出：使った席だけ消費し、残った者へ残席が引き継がれゲーム続行 =====
test('抜け駆け：席が足りない局面で乗れた者だけ脱出し、残席は残り続行', () => {
  const base = mk(3);
  const s: GameState = structuredClone(base);
  s.phase = 'escape';
  s.raftSeats = 2;
  s.food = 5;
  s.water = 5;
  s.round = 4;
  for (const p of s.players) p.escapeChoice = undefined;
  // 2人が出航、1人が残る
  s.players[0].escapeChoice = true;
  s.players[1].escapeChoice = true;
  s.players[2].escapeChoice = false;
  assert.ok(isEscapeReady(s));
  const after = resolveEscape(s);
  assert.equal(after.players.filter((p) => p.escaped).length, 2, '2人脱出');
  assert.equal(after.raftSeats, 0, '使った2席が消える（2-2）');
  assert.equal(after.food, 3, '航海ぶん2消費');
  assert.equal(after.water, 3);
  assert.equal(aliveCount(after), 1, '残った1人は生存');
  assert.notEqual(after.phase, 'gameover', '全滅・全脱出でなければ続行');
});

test('全員出航で全滅扱いにならず、全員勝者として決着', () => {
  const base = mk(3);
  const s: GameState = structuredClone(base);
  s.phase = 'escape';
  s.raftSeats = 5;
  s.food = 5;
  s.water = 5;
  for (const p of s.players) p.escapeChoice = true;
  const after = resolveEscape(s);
  assert.equal(after.phase, 'gameover');
  assert.equal(after.winners.length, 3);
});

// ===== 供出フラグ：生存ウィンドウでの供出が記録され、ラウンドでリセット =====
test('生存ウィンドウで資源カードを供出すると contributedThisRound が立つ', () => {
  const base = mk(3);
  const s: GameState = structuredClone(base);
  s.phase = 'survival';
  s.water = 0;
  s.food = 9;
  for (const p of s.players) {
    p.acted = false;
    p.contributedThisRound = false;
  }
  const me = s.players[0];
  give(me, 'wb', 'water_bottle');
  const after = playCard(s, me.id, 'wb');
  assert.ok(after.players[0].contributedThisRound, '供出者にフラグ');
  assert.ok(!after.players[1].contributedThisRound, '何もしない者は false のまま');
});

// ===== 血清の木ロールバック：座席クランプを跨いでも行動前へ正確に復元（バグ修正の回帰） =====
test('血清は木集め前のスナップショットへ正確に巻き戻す（座席跨ぎでも過剰減算しない）', () => {
  const base = mk(3);
  const s: GameState = structuredClone(base);
  s.phase = 'action';
  // 木1本で座席が1つ完成した直後（progress 5 → seat+1, progress 0）に噛まれた状況を再現。
  s.raftSeats = 1;
  s.raftProgress = 0;
  const me = s.players[actorIndex(s)];
  me.sick = true;
  give(me, 'sr', 'serum');
  s.lastWoodGain = { playerId: me.id, amount: 1, prevSeats: 0, prevProgress: 5 };
  const after = playCard(s, me.id, 'sr');
  const m2 = after.players.find((p) => p.id === me.id)!;
  assert.equal(m2.sick, false, '病気が治る');
  assert.equal(after.raftSeats, 0, '座席は行動前(0)へ');
  assert.equal(after.raftProgress, 5, 'ディスクも行動前(5)へ');
});

function actorIndex(s: GameState): number {
  return s.players.findIndex((p) => p.id === currentActorId(s));
}

// ===== 全員CPUの卓が必ず決着する（進行オーケストレーションのスモーク） =====
test('全員CPUの卓は例外なくシード固定で gameover まで完走する', () => {
  for (let seed = 1; seed <= 30; seed++) {
    let s = startGame(
      createGame(
        Array.from({ length: 4 + (seed % 5) }, (_, i) => ({
          id: `b${i}`,
          name: `B${i}`,
          isBot: true,
          botPersona: (['cooperative', 'hoarder', 'sniper', 'coward'] as const)[i % 4],
        })),
        { seed },
      ),
    );
    let salt = 0;
    let guard = 0;
    while (awaiting(s) !== null && guard++ < 50000) {
      const aw = awaiting(s);
      const r = () => new Rng((seed * 131 + salt++ * 17 + 1) >>> 0);
      if (aw === 'action') {
        const id = currentActorId(s)!;
        const bot = s.players.find((p) => p.id === id)!;
        const d = aiAction(s, bot, r());
        s = takeAction(s, id, d.action, d.woodPush);
        const after = s.players.find((p) => p.id === id);
        if (after?.sick) {
          const serum = after.hand.find((c) => c.kind === 'serum');
          if (serum) s = playCard(s, id, serum.id);
        }
      } else if (aw === 'survival') {
        for (const p of alivePlayers(s)) {
          for (const cid of aiSurvivalPlays(s, p)) s = playCard(s, p.id, cid);
          s = passSurvival(s, p.id);
        }
        if (isSurvivalReady(s)) s = resolveSurvival(s);
      } else if (aw === 'vote') {
        for (const p of alivePlayers(s)) if (!p.sick) s = castVote(s, p.id, aiVote(s, p, r()));
        if (isVoteReady(s)) s = resolveVote(s);
      } else if (aw === 'escape') {
        for (const p of alivePlayers(s)) s = setEscapeChoice(s, p.id, aiEscape(s, p));
        if (isEscapeReady(s)) s = resolveEscape(s);
      }
    }
    assert.equal(s.phase, 'gameover', `seed ${seed} は gameover に到達する`);
    assert.ok(guard < 50000, `seed ${seed} は無限ループしない`);
  }
});
