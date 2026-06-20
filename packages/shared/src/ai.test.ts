import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, currentActorId, startGame } from './engine.js';
import { aiAction, aiEscape, aiSurvivalPlays, aiVote } from './ai.js';
import { Rng } from './rng.js';
import type { Card, GameState } from './types.js';

function mk(n: number, seed = 1): GameState {
  return startGame(
    createGame(
      Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true })),
      { seed },
    ),
  );
}
function give(s: GameState, idx: number, kinds: Card['kind'][]): void {
  s.players[idx].hand = kinds.map((kind, i) => ({ id: `c${idx}-${i}`, kind }));
}

test('aiAction：降水0の日は水汲みを選ばない', () => {
  const s: GameState = structuredClone(mk(3));
  s.currentPrecip = 0;
  s.water = 0;
  s.food = 0;
  const bot = s.players.find((p) => p.id === currentActorId(s))!;
  for (let i = 0; i < 30; i++) {
    const d = aiAction(s, bot, new Rng(i + 1));
    assert.notEqual(d.action, 'water', '雨が無い日に水汲みは選ばない');
  }
});

test('aiAction：水だけ逼迫していれば水汲みを選ぶ', () => {
  const s: GameState = structuredClone(mk(3));
  s.currentPrecip = 3;
  s.water = 0; // 水だけ不足
  s.food = 20;
  s.raftSeats = 9; // 木は十分（wood を選ばせない）
  const bot = s.players.find((p) => p.id === currentActorId(s))!;
  const d = aiAction(s, bot, new Rng(7));
  assert.equal(d.action, 'water');
});

test('aiSurvivalPlays：埋めきれない不足のときフルーツバスケットを切り札に返す', () => {
  const s: GameState = structuredClone(mk(3));
  s.phase = 'survival';
  s.water = 0; // 3人に対し水0
  s.food = 9;
  give(s, 0, ['fruit_basket']);
  const ids = aiSurvivalPlays(s, s.players[0]);
  assert.deepEqual(ids, ['c0-0'], 'フルーツバスケットを返す');
});

test('aiSurvivalPlays：協力的はクリーン資源で不足を埋める', () => {
  const s: GameState = structuredClone(mk(3));
  s.phase = 'survival';
  s.water = 0;
  s.food = 9;
  s.players[0].botPersona = 'cooperative';
  give(s, 0, ['water_bottle', 'water_bottle', 'water_bottle']);
  const ids = aiSurvivalPlays(s, s.players[0]);
  assert.equal(ids.length, 3, '不足3を水ボトル3で供出');
});

test('aiVote：出し渋り（未供出）を優先して追放対象にする', () => {
  const s: GameState = structuredClone(mk(3));
  s.config.difficulty = 'hard'; // ノイズを抑えて傾向を見やすく
  s.phase = 'vote';
  const me = s.players[0];
  const giver = s.players[1];
  const freeloader = s.players[2];
  giver.hand = [{ id: 'a', kind: 'junk' }, { id: 'b', kind: 'junk' }];
  freeloader.hand = [{ id: 'c', kind: 'junk' }, { id: 'd', kind: 'junk' }];
  giver.contributedThisRound = true;
  freeloader.contributedThisRound = false;
  let freeVotes = 0;
  let giverVotes = 0;
  for (let i = 0; i < 80; i++) {
    const t = aiVote(s, me, new Rng(i * 31 + 1));
    if (t === freeloader.id) freeVotes++;
    else if (t === giver.id) giverVotes++;
  }
  assert.ok(freeVotes > giverVotes, `出し渋りが多く狙われる: free ${freeVotes} vs giver ${giverVotes}`);
});

test('aiEscape：全員乗れるなら出航、乗る席が無ければ残る', () => {
  const s: GameState = structuredClone(mk(3));
  s.raftSeats = 3;
  s.food = 3;
  s.water = 3;
  assert.equal(aiEscape(s, s.players[0]), true, '全員ぶんの席で出航');
  s.raftSeats = 0;
  assert.equal(aiEscape(s, s.players[0]), false, '席ゼロでは残る');
});
