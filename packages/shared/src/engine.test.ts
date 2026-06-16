import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aliveCount,
  castVote,
  chooseAction,
  createGame,
  fillDefaults,
  getCapacity,
  isAwaitingInput,
  isPhaseReady,
  playItem,
  resolvePhase,
  resolveSurvival,
  resolveVotes,
  setConfig,
  startGame,
} from './engine.js';
import { redactFor } from './view.js';
import type { ActionType, GameState } from './types.js';

function bots(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Bot${i}`,
    isBot: true,
  }));
}

test('ゲームは必ず gameover で終了する（決定論ドライバ）', () => {
  let s = createGame(bots(5), { seed: 42, initialStormIn: 5 });
  s = startGame(s);

  let guard = 0;
  const cycle: ActionType[] = ['fish', 'water', 'wood', 'search'];
  while (s.phase !== 'gameover' && guard++ < 1000) {
    if (!isAwaitingInput(s.phase)) break;
    // 各生存者に決め打ちの入力を与える
    for (const p of s.players.filter((x) => x.alive && !x.escaped)) {
      if (s.phase === 'action') {
        s = chooseAction(s, p.id, cycle[(s.day + p.id.charCodeAt(1)) % cycle.length]);
      }
    }
    s = fillDefaults(s); // 行動以外（供出・投票・脱出）はデフォルトで前進
    assert.ok(isPhaseReady(s), `phase ${s.phase} should be ready after fill`);
    s = resolvePhase(s);
  }

  assert.equal(s.phase, 'gameover');
  assert.ok(guard < 1000, '無限ループに陥っていない');
});

test('資源不足で投票フェイズに入り、不足数だけ追放される', () => {
  let s = createGame(bots(3), { seed: 1 });
  // 生存フェイズを手で構築：生存者3、供出なし、水食料1ずつ
  s = { ...s, phase: 'survival', food: 1, water: 1 } as GameState;
  for (const p of s.players) p.contribute = { food: 0, water: 0 };

  s = resolveSurvival(s);
  assert.equal(s.phase, 'vote');
  assert.equal(s.shortage, 2); // need 3 - supportable 1

  // 全員が p0 と p1 に投票が割れるよう設定 → 上位2名追放
  s = castVote(s, 'p0', 'p1');
  s = castVote(s, 'p1', 'p0');
  s = castVote(s, 'p2', 'p0');
  assert.ok(isPhaseReady(s));
  s = resolveVotes(s);

  assert.equal(aliveCount(s), 1, '3人中2人が追放され1人生存');
  assert.ok(s.players.find((p) => p.id === 'p2')?.alive, '最少票の p2 は生存しやすい');
});

test('いかだ席は木材から計算される', () => {
  const s = createGame(bots(3), { raftWoodPerSeat: 2 });
  const s2 = { ...s, wood: 5 } as GameState;
  assert.equal(getCapacity(s2), 2); // floor(5/2)
});

test('拳銃で対象を射殺し、所持品を奪う', () => {
  let s = startGame(createGame(bots(3), { seed: 7 })); // phase: action
  s.players[0].items.push({ id: 'g1', kind: 'gun' });
  s.players[1].hand = { food: 2, water: 1 };
  s = playItem(s, 'p0', 'g1', 'p1');
  assert.equal(s.players[1].alive, false, 'p1 は射殺される');
  assert.equal(s.players[0].hand.food, 2, '隠し財産を奪う');
  assert.equal(s.players[0].items.length, 0, '拳銃は消費される');
});

test('解毒剤で病気を治す', () => {
  let s = startGame(createGame(bots(2), { seed: 1 }));
  s.players[0].sick = true;
  s.players[0].items.push({ id: 'a1', kind: 'antidote' });
  s = playItem(s, 'p0', 'a1');
  assert.equal(s.players[0].sick, false);
  assert.equal(s.players[0].items.length, 0);
});

test('ブードゥー人形で死者を蘇らせる（行動フェイズ）', () => {
  let s = startGame(createGame(bots(3), { seed: 1 }));
  s.players[1].alive = false;
  s.players[0].items.push({ id: 'v1', kind: 'voodoo' });
  s = playItem(s, 'p0', 'v1', 'p1');
  assert.equal(s.players[1].alive, true);
});

test('setConfig はロビー中のみ設定を変更できる', () => {
  let s = createGame(bots(3));
  s = setConfig(s, { soleSurvivor: true });
  assert.equal(s.config.soleSurvivor, true);
  const inGame = { ...s, phase: 'action' } as GameState;
  const after = setConfig(inGame, { soleSurvivor: false });
  assert.equal(after.config.soleSurvivor, true, 'ゲーム中は変更されない');
});

test('ボットの性格はゲーム終了時のみ公開される', () => {
  let s = createGame([
    { id: 'b', name: 'B', isBot: true, botPersona: 'sniper' },
    { id: 'h', name: 'H', isBot: false },
  ]);
  s = startGame(s); // action フェイズ
  const hidden = redactFor(s, 'h', 'h').players.find((p) => p.id === 'b');
  assert.equal(hidden?.persona, undefined, '進行中は秘匿');
  const over = { ...s, phase: 'gameover' } as GameState;
  const shown = redactFor(over, 'h', 'h').players.find((p) => p.id === 'b');
  assert.equal(shown?.persona, 'sniper', '終了時に公開');
});

test('睡眠薬で投票免疫になり、代わりに非免疫者が追放される', () => {
  let s = createGame(bots(3), { seed: 1 });
  s = { ...s, phase: 'vote', shortage: 1, food: 1, water: 1 } as GameState;
  s.players[0].voteImmune = true;
  s.players[0].vote = 'p1';
  s.players[1].vote = 'p0';
  s.players[2].vote = 'p0';
  s = resolveVotes(s);
  assert.equal(s.players[0].alive, true, '最多票でも免疫者は守られる');
  assert.equal(s.players[1].alive, false, '代わりに非免疫者が追放される');
});
