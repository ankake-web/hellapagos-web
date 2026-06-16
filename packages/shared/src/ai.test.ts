import test from 'node:test';
import assert from 'node:assert/strict';

import { aiChatLine, aiContribute, aiItemPlay, aiVote } from './ai.js';
import { DEFAULT_CONFIG } from './content.js';
import { Rng } from './rng.js';
import type { Item, PublicGameState, PublicPlayer } from './types.js';

function pp(o: Partial<PublicPlayer> & { id: string }): PublicPlayer {
  return {
    id: o.id,
    name: o.id,
    isBot: true,
    connected: true,
    alive: o.alive ?? true,
    escaped: o.escaped ?? false,
    sick: o.sick ?? false,
    handCount: o.handCount ?? 0,
    itemCount: o.items?.length ?? 0,
    voteImmune: o.voteImmune,
    hasActed: false,
    hasContributed: false,
    hasVoted: false,
    hasEscapeVoted: false,
    isYou: o.isYou ?? false,
    hand: o.hand,
    items: o.items,
    contributedFood: o.contributedFood,
    contributedWater: o.contributedWater,
  };
}

function pgs(o: { phase: PublicGameState['phase']; players: PublicPlayer[] } & Partial<PublicGameState>): PublicGameState {
  return {
    phase: o.phase,
    day: 1,
    players: o.players,
    food: o.food ?? 0,
    water: o.water ?? 0,
    wood: 0,
    raftCapacity: 0,
    stormIn: 5,
    isFinalDay: false,
    weather: 'sunny',
    firstPlayerIndex: 0,
    shortage: o.shortage ?? 0,
    need: o.need ?? o.players.filter((p) => p.alive && !p.escaped).length,
    log: [],
    winners: [],
    config: DEFAULT_CONFIG,
    youId: 'me',
    hostId: 'me',
    isSpectator: false,
  };
}

test('溜め込み屋は協力者より供出を出し惜しむ', () => {
  const players = [pp({ id: 'me', isYou: true, hand: { food: 4, water: 0 } })];
  const view = pgs({ phase: 'survival', players, food: 0, water: 9, need: 3 });
  const coop = aiContribute(view, 'cooperative', new Rng(1));
  const hoard = aiContribute(view, 'hoarder', new Rng(1));
  assert.equal(coop.food, 3, '協力者は不足3を埋める');
  assert.equal(hoard.food, 1, '溜め込み屋は半分しか出さない');
});

test('狙撃手は投票フェイズで拳銃を最も裕福な相手に使う（自分や死者は撃たない）', () => {
  const gun: Item = { id: 'g', kind: 'gun' };
  const make = () =>
    pgs({
      phase: 'vote',
      players: [
        pp({ id: 'me', isYou: true, items: [gun] }),
        pp({ id: 'rich', handCount: 5 }),
        pp({ id: 'poor', handCount: 1 }),
        pp({ id: 'ghost', alive: false }),
      ],
    });

  let firedAtRich = false;
  for (let seed = 1; seed <= 40; seed++) {
    const play = aiItemPlay(make(), 'sniper', new Rng(seed));
    if (!play) continue;
    assert.equal(play.itemId, 'g');
    assert.ok(play.targetId !== 'me' && play.targetId !== 'ghost', '自分や死者は撃たない');
    if (play.targetId === 'rich') firedAtRich = true;
  }
  assert.ok(firedAtRich, '少なくとも一部のシードで裕福な相手を撃つ');
});

test('狙撃手は非戦闘フェイズ（生存）では拳銃を撃たない', () => {
  const gun: Item = { id: 'g', kind: 'gun' };
  const view = pgs({
    phase: 'survival',
    players: [pp({ id: 'me', isYou: true, items: [gun] }), pp({ id: 'rich', handCount: 5 })],
  });
  for (let seed = 1; seed <= 20; seed++) {
    assert.equal(aiItemPlay(view, 'sniper', new Rng(seed)), null);
  }
});

test('臆病者は投票で最少供出のとき睡眠薬で身を守る', () => {
  const pills: Item = { id: 'p', kind: 'pills' };
  const make = () =>
    pgs({
      phase: 'vote',
      players: [
        pp({ id: 'me', isYou: true, items: [pills], contributedFood: 0, contributedWater: 0 }),
        pp({ id: 'other', contributedFood: 2, contributedWater: 1 }),
      ],
    });
  let used = false;
  for (let seed = 1; seed <= 30; seed++) {
    const play = aiItemPlay(make(), 'coward', new Rng(seed));
    if (play?.itemId === 'p') used = true;
  }
  assert.ok(used, '少なくとも一部のシードで睡眠薬を使う');
});

test('狙撃手は裕福な相手を投票で狙う', () => {
  const view = pgs({
    phase: 'vote',
    players: [
      pp({ id: 'me', isYou: true }),
      pp({ id: 'rich', handCount: 6, contributedFood: 2, contributedWater: 2 }),
      pp({ id: 'poor', handCount: 0, contributedFood: 0, contributedWater: 0 }),
    ],
  });
  // 乱数のばらつきがあっても多数決で rich が選ばれる
  const counts: Record<string, number> = {};
  for (let seed = 1; seed <= 30; seed++) {
    const t = aiVote(view, 'sniper', new Rng(seed))!;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  assert.ok((counts.rich ?? 0) > (counts.poor ?? 0), '狙撃手は裕福な rich を多く狙う');
});

test('煽りセリフは投票フェイズでのみ出る', () => {
  const players = [pp({ id: 'me', isYou: true })];
  assert.equal(aiChatLine(pgs({ phase: 'action', players }), 'sniper', new Rng(1)), null);
  let spoke = false;
  for (let seed = 1; seed <= 20; seed++) {
    if (aiChatLine(pgs({ phase: 'vote', players }), 'sniper', new Rng(seed))) spoke = true;
  }
  assert.ok(spoke, '投票フェイズでは時々発言する');
});
