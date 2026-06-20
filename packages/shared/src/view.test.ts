import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, startGame } from './engine.js';
import { redactFor } from './view.js';
import type { GameState } from './types.js';

function mk(n: number, seed = 1): GameState {
  return startGame(
    createGame(
      Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: i > 0 })),
      { seed },
    ),
  );
}

test('redactFor：他人の手札・投票・脱出選択は伏せ、枚数だけ公開する', () => {
  const s: GameState = structuredClone(mk(3));
  // それぞれに状態を持たせる
  s.players[1].vote = 'p2';
  s.players[1].escapeChoice = true;
  const view = redactFor(s, 'p0', 'p0');
  const me = view.players.find((p) => p.isYou)!;
  const other = view.players.find((p) => p.id === 'p1')!;
  // 本人：手札の中身が見える
  assert.ok(Array.isArray(me.hand), '本人の手札は配列で見える');
  // 他人：中身は伏せ、枚数のみ
  assert.equal(other.hand, undefined, '他人の手札中身は伏せる');
  assert.equal(other.vote, undefined, '他人の投票は伏せる');
  assert.equal(other.escapeChoice, undefined, '他人の脱出選択は伏せる');
  assert.equal(other.handCount, s.players[1].hand.length, '枚数は公開');
});

test('redactFor：進行中はAIの性格を伏せ、gameover時のみ公開する', () => {
  const s: GameState = structuredClone(mk(3));
  s.players[1].botPersona = 'sniper';
  const mid = redactFor(s, 'p0', 'p0').players.find((p) => p.id === 'p1')!;
  assert.equal(mid.persona, undefined, '進行中は性格を伏せる');
  s.phase = 'gameover';
  const end = redactFor(s, 'p0', 'p0').players.find((p) => p.id === 'p1')!;
  assert.equal(end.persona, 'sniper', '終了時は性格を公開');
});

test('redactFor：供出フラグ（出し渋り）は公開情報として配る', () => {
  const s: GameState = structuredClone(mk(3));
  s.players[1].contributedThisRound = false;
  s.players[2].contributedThisRound = true;
  const view = redactFor(s, 'p0', 'p0');
  assert.equal(view.players.find((p) => p.id === 'p1')!.contributedThisRound, false);
  assert.equal(view.players.find((p) => p.id === 'p2')!.contributedThisRound, true);
});

test('redactFor：観戦者にはどのプレイヤーの手札中身も渡さない', () => {
  const s: GameState = structuredClone(mk(3));
  const view = redactFor(s, 'spectator-x', 'p0');
  assert.ok(view.isSpectator, '席に居なければ観戦者');
  for (const p of view.players) assert.equal(p.hand, undefined, '全員の手札中身が伏せられる');
});
