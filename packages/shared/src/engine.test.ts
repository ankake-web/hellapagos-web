import test from 'node:test';
import assert from 'node:assert/strict';

import { BAG, RESOURCE_CAP, drawBall, initialSupplies } from './content.js';
import {
  aliveCount,
  canEscapeAll,
  castVote,
  createGame,
  currentActorId,
  isVoteReady,
  playCard,
  resolveSurvival,
  resolveVote,
  startGame,
  takeAction,
} from './engine.js';
import { redactFor } from './view.js';
import { Rng } from './rng.js';
import type { Card, GameState, Player } from './types.js';

function bots(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
}
function mk(n: number, seed = 1): GameState {
  return startGame(createGame(bots(n), { seed }));
}
function actor(s: GameState): Player {
  return s.players.find((p) => p.id === currentActorId(s))!;
}
function card(id: string, kind: Card['kind']): Card {
  return { id, kind };
}

// ---- 袋・初期値テーブル ----
test('袋は 白5(1,1,2,2,3)＋黒1 で構成', () => {
  const fish = BAG.filter((b) => 'fish' in b).map((b) => (b as { fish: number }).fish).sort();
  assert.deepEqual(fish, [1, 1, 2, 2, 3]);
  assert.equal(BAG.filter((b) => 'snake' in b).length, 1);
});

test('drawBall は袋の値のみを返し、黒玉も白玉も出る', () => {
  const rng = new Rng(12345);
  let snake = 0;
  let white = 0;
  for (let i = 0; i < 600; i++) {
    const b = drawBall(rng);
    if ('snake' in b) snake++;
    else {
      white++;
      assert.ok([1, 2, 3].includes(b.fish));
    }
  }
  assert.ok(snake > 50 && snake < 160, `snake率が概ね1/6: ${snake}/600`);
  assert.ok(white > snake);
});

test('人数別の生存初期値テーブル', () => {
  assert.deepEqual(initialSupplies(3), { food: 5, water: 6 });
  assert.deepEqual(initialSupplies(8), { food: 13, water: 16 });
  assert.deepEqual(initialSupplies(12), { food: 20, water: 24 });
});

// ---- 木集め・筏トラック ----
test('木6でディスクが1周し座席+1・ディスクは0へ', () => {
  let s = mk(3, 1);
  const a = actor(s);
  a.hand = []; // 斧なし
  s.raftProgress = 5;
  s.raftSeats = 0;
  s = takeAction(s, a.id, 'wood', 0); // 基本+1 → 6 → 座席1
  assert.equal(s.raftSeats, 1);
  assert.equal(s.raftProgress, 0);
});

test('木プッシュで黒玉が出ると病気＆追加木なし（基本分は残る）', () => {
  let sick = false;
  for (let seed = 1; seed <= 300 && !sick; seed++) {
    let s = mk(3, seed);
    const a = actor(s);
    a.hand = [];
    s.raftProgress = 0;
    s.raftSeats = 0;
    const after = takeAction(s, a.id, 'wood', 3);
    const a2 = after.players.find((p) => p.id === a.id)!;
    if (a2.sick) {
      sick = true;
      assert.equal(after.raftProgress, 1, '黒玉時は基本+1のみ');
      assert.equal(after.raftSeats, 0);
    }
  }
  assert.ok(sick, '少なくとも一部のシードで黒玉により発病する');
});

// ---- 水汲み ----
test('降水0の日は水を汲めない', () => {
  let s = mk(3, 2);
  const a = actor(s);
  s.currentPrecip = 0;
  const before = s.water;
  s = takeAction(s, a.id, 'water', 0);
  assert.equal(s.water, before);
});

// ---- 上限36 ----
test('食料・水は上限36を超えない', () => {
  let s = mk(3, 3);
  const a = actor(s);
  a.hand = [];
  s.food = RESOURCE_CAP;
  s = takeAction(s, a.id, 'fish', 0);
  assert.equal(s.food, RESOURCE_CAP);
});

// ---- 生存：水→食料順・不足で投票 ----
test('水不足で水の投票が始まる（水→食料順）', () => {
  let s = mk(3, 4);
  s.phase = 'survival';
  s.players.forEach((p) => (p.acted = true));
  s.water = 1; // 生存3人 → 2人分不足
  s.food = 30;
  s = resolveSurvival(s);
  assert.equal(s.phase, 'vote');
  assert.equal(s.voteReason, 'water');
  assert.equal(s.pendingEliminations, 2);
});

test('水0開始は投票なし：水カードを持たねば全滅', () => {
  let s = mk(3, 5);
  s.players.forEach((p) => (p.hand = [])); // 誰も水カードを持たない
  s.phase = 'survival';
  s.players.forEach((p) => (p.acted = true));
  s.water = 0;
  s.food = 30;
  s = resolveSurvival(s);
  assert.equal(aliveCount(s), 0);
  assert.equal(s.phase, 'gameover');
});

test('資源0でも該当カードを出せた者だけ生存する', () => {
  let s = mk(3, 5);
  s.players.forEach((p) => (p.hand = []));
  s.players[0].hand = [card('w', 'water_bottle')];
  s.phase = 'survival';
  s.players.forEach((p) => (p.acted = true));
  s.water = 0;
  s.food = 30;
  s = resolveSurvival(s);
  assert.equal(s.players.find((p) => p.id === 'p0')!.alive, true, '水カード所持者は生存');
  assert.equal(s.players.find((p) => p.id === 'p1')!.alive, false, '非所持者は死亡');
});

test('釣りの黒玉は不漁（食料増えず・病気にならない）', () => {
  let found = false;
  for (let seed = 1; seed <= 400 && !found; seed++) {
    let s = mk(3, seed);
    const a = actor(s);
    a.hand = [];
    const before = s.food;
    const after = takeAction(s, a.id, 'fish', 0);
    const ld = after.lastDraw;
    if (ld && ld.balls.some((b) => 'snake' in b)) {
      found = true;
      assert.equal(after.food, before, '不漁なので食料は増えない');
      assert.equal(after.players.find((p) => p.id === a.id)!.sick, false, '釣りでは病気にならない');
    }
  }
  assert.ok(found, '釣りで黒玉が出るシードが存在する');
});

// ---- 投票：親裁定／資源カード自己救済／脱落者の手札分配 ----
test('同票は親が裁定する', () => {
  let s = mk(4, 6);
  s.players.forEach((p) => (p.hand = []));
  s.phase = 'vote';
  s.voteReason = 'food';
  s.pendingEliminations = 1;
  s.firstPlayerIndex = 0; // 親 p0
  // p1 と p2 が1票ずつ（同票）。親 p0 は p2 に投票 → p2 が脱落
  s.players.forEach((p) => (p.vote = undefined));
  s = castVote(s, 'p0', 'p2');
  s = castVote(s, 'p1', 'p2');
  s = castVote(s, 'p2', 'p1');
  s = castVote(s, 'p3', 'p1');
  assert.ok(isVoteReady(s));
  s = resolveVote(s);
  assert.equal(s.players.find((p) => p.id === 'p2')!.alive, false, '親が指した p2 が脱落');
});

test('脱落者の手札は両隣へ交互配布される', () => {
  let s = mk(4, 7);
  s.players.forEach((p) => (p.hand = []));
  const victim = s.players[1]; // p1
  victim.hand = [card('x1', 'junk'), card('x2', 'junk'), card('x3', 'junk')];
  s.phase = 'vote';
  s.voteReason = 'food';
  s.pendingEliminations = 1;
  s.firstPlayerIndex = 0;
  s.players.forEach((p) => (p.vote = undefined));
  ['p0', 'p2', 'p3'].forEach((id) => (s = castVote(s, id, 'p1')));
  s = castVote(s, 'p1', 'p0');
  s = resolveVote(s);
  assert.equal(s.players.find((p) => p.id === 'p1')!.alive, false);
  const total = s.players.filter((p) => p.alive).reduce((n, p) => n + p.hand.length, 0);
  assert.equal(total, 3, '3枚が生存者へ配られた');
});

test('資源カードで投票脱落から自己救済（再投票なし）', () => {
  let s = mk(3, 8);
  s.players.forEach((p) => (p.hand = []));
  s.phase = 'vote';
  s.voteReason = 'food';
  s.pendingEliminations = 1;
  const target = s.players[1];
  target.hand = [card('s1', 'sandwich')];
  s.players.forEach((p) => (p.vote = undefined));
  s = castVote(s, 'p0', 'p1');
  s = castVote(s, 'p2', 'p1');
  s = castVote(s, 'p1', 'p0');
  s = resolveVote(s);
  assert.equal(s.players.find((p) => p.id === 'p1')!.alive, true, 'サンドイッチで救済');
});

// ---- 銃で人数削減 ----
test('銃＋弾で他者を撃ち、投票の必要数が減る', () => {
  let s = mk(4, 9);
  s.players.forEach((p) => (p.hand = []));
  const shooter = s.players[0];
  shooter.hand = [card('g', 'gun'), card('b', 'bullet')];
  s.phase = 'vote';
  s.voteReason = 'food';
  s.pendingEliminations = 1;
  const before = aliveCount(s);
  s = playCard(s, 'p0', 'g', 'p3');
  assert.equal(s.players.find((p) => p.id === 'p3')!.alive, false, '撃たれて死亡');
  assert.equal(aliveCount(s), before - 1);
});

// ---- 病気は投票に参加できない ----
test('病気プレイヤーは投票に参加不可（対象にはなる）', () => {
  let s = mk(3, 10);
  s.players.forEach((p) => (p.hand = []));
  s.players[0].sick = true;
  s.phase = 'vote';
  s.voteReason = 'food';
  s.pendingEliminations = 1;
  s.players.forEach((p) => (p.vote = undefined));
  // 病気の p0 が投票しなくても、生存可能な投票者(p1,p2)だけで成立
  s = castVote(s, 'p1', 'p2');
  s = castVote(s, 'p2', 'p1');
  assert.ok(isVoteReady(s), '病気 p0 の票を待たずに成立');
});

// ---- 脱出・ハリケーン・勝敗 ----
test('消費後に座席≧生存者＋旅の補給があれば脱出できる状態になる', () => {
  let s = mk(3, 11);
  s.players.forEach((p) => (p.hand = []));
  s.phase = 'survival';
  s.players.forEach((p) => (p.acted = true));
  s.raftSeats = 3;
  s.water = 6; // 消費3後に3残る
  s.food = 6;
  s = resolveSurvival(s);
  // 通常ラウンドなら脱出フェイズへ
  assert.equal(s.phase, 'escape');
  assert.ok(canEscapeAll({ ...s, water: 3, food: 3 } as GameState));
});

test('ハリケーン公開ラウンドは終了時に強制脱出（条件を満たせば全員勝利）', () => {
  let s = mk(3, 12);
  s.players.forEach((p) => (p.hand = []));
  s.hurricaneRevealed = true;
  s.phase = 'survival';
  s.players.forEach((p) => (p.acted = true));
  s.raftSeats = 3;
  s.water = 6;
  s.food = 6;
  s = resolveSurvival(s);
  assert.equal(s.phase, 'gameover');
  assert.equal(s.winners.length, 3, '全員脱出して勝利');
});

// ---- 永続カードの公開（使うまで他者に伏せる） ----
test('永続カードは使うまで他者に伏せ、本人には見え、使用時に公開される（斧）', () => {
  const s = mk(3, 5);
  const a = actor(s);
  a.hand.push(card('ax1', 'axe'));
  const otherId = s.players.find((p) => p.id !== a.id)!.id;
  // 使用前：他者の視点では斧は見えない
  const before = redactFor(s, otherId, a.id).players.find((p) => p.id === a.id)!;
  assert.equal(before.permanents.includes('axe'), false, '使用前は他者に非公開');
  // 本人視点では自分の斧が見える
  const own = redactFor(s, a.id, a.id).players.find((p) => p.id === a.id)!;
  assert.equal(own.permanents.includes('axe'), true, '本人には常に見える');
  // 木集めで使用 → 公開される
  const s2 = takeAction(s, a.id, 'wood', 0);
  const after = redactFor(s2, otherId, a.id).players.find((p) => p.id === a.id)!;
  assert.equal(after.permanents.includes('axe'), true, '使用後は他者にも公開');
});

test('資源・カード獲得で lastGain が記録される（演出用）', () => {
  const s = mk(3, 5);
  const a = actor(s);
  const s2 = takeAction(s, a.id, 'wood', 0);
  assert.ok(s2.lastGain, 'lastGain が設定される');
  assert.equal(s2.lastGain?.kind, 'wood');
  assert.equal(s2.lastGain?.playerId, a.id);
  assert.ok((s2.lastGain?.amount ?? 0) >= 1);
});
