import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_DECK, EXPANSION_DECK, DECK_COMPOSITION } from './deckConfig.js';
import { CARD_INFO } from './content.js';
import {
  createGame,
  startGame,
  takeAction,
  playCard,
  currentActorId,
  resolveCardDecision,
  castVote,
  resolveVote,
  isVoteReady,
  passSurvival,
  resolveSurvival,
  isSurvivalReady,
  setEscapeChoice,
  resolveEscape,
} from './engine.js';
import { aiAction, aiBeforeAction, aiExtraPlays, aiVote, aiCardDecision, aiSurvivalPlays } from './ai.js';
import { redactFor } from './view.js';
import { Rng } from './rng.js';
import type { Card, CardKind, GameState, CardOptions } from './types.js';
const card = (kind: CardKind, id: string = kind): Card => ({ id, kind });
function game(n = 4, seed = 1) {
  const s = startGame(
    createGame(
      Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `漂流者${i}`, isBot: true })),
      { seed },
    ),
  );
  s.players.forEach((p) => {
    p.hand = [];
    p.equipment = [];
    p.revealed = [];
  });
  return s;
}
function use(s: GameState, kind: CardKind, target?: string, o?: CardOptions) {
  s.players[0].hand.push(card(kind));
  return playCard(s, 'p0', kind, target, o);
}
test('54+20枚。資源・武器の重複数と14種の拡張新効果を固定して検証', () => {
  assert.equal(BASE_DECK.length, 54);
  assert.equal(EXPANSION_DECK.length, 20);
  assert.deepEqual(
    Object.fromEntries(
      ['water_bottle', 'sandwich', 'gun', 'bullet', 'tin_sheet', 'junk'].map((k) => [
        k,
        DECK_COMPOSITION[k as CardKind],
      ]),
    ),
    { water_bottle: 9, sandwich: 9, gun: 4, bullet: 7, tin_sheet: 2, junk: 5 },
  );
  assert.equal(new Set(EXPANSION_DECK.filter((k) => !BASE_DECK.includes(k))).size, 14);
  for (const k of [...BASE_DECK, ...EXPANSION_DECK]) assert.ok(CARD_INFO[k]?.name && CARD_INFO[k]?.desc);
});
test('コーヒーの2行動、木の板は座席+1、木箱は木+2', () => {
  let s = game();
  s = use(s, 'coffee');
  s = takeAction(s, 'p0', 'wood');
  assert.equal(currentActorId(s), 'p0');
  s = takeAction(s, 'p0', 'wood');
  assert.equal(currentActorId(s), 'p1');
  s = game();
  s = use(s, 'wooden_plank');
  assert.equal(s.raftSeats, 1);
  assert.equal(s.raftProgress, 0);
  s = use(s, 'wooden_crate');
  assert.equal(s.raftProgress, 2);
});
test('釣り竿は2玉の合計。黒玉も3匹で、同じ玉は重複しない', () => {
  let unequal = false;
  for (let seed = 1; seed <= 80; seed++) {
    let s = game(3, seed);
    s = use(s, 'fishing_rod');
    const before = s.food;
    s = takeAction(s, 'p0', 'fish');
    const b = s.lastDraw!.balls as Array<{ fish: number }>;
    assert.equal(b.length, 2);
    assert.equal(s.food - before, b[0].fish + b[1].fish);
    assert.ok(!s.players[0].sick);
    assert.ok(b.filter((x) => x.fish === 3).length <= 2);
    if (b[0].fish !== b[1].fish) unequal = true;
  }
  assert.ok(unequal, '単一玉の倍ではない');
});
test('食料/水変換は足りるときだけ。金魚鉢と猫は共有資源0限定', () => {
  let s = game();
  s.food = 2;
  s.water = 0;
  s = use(s, 'food_mill');
  assert.equal(s.food, 0);
  assert.equal(s.water, 2);
  s = use(s, 'instant_noodles');
  assert.equal(s.food, 2);
  assert.equal(s.water, 0);
  s = use(s, 'fish_tank');
  assert.equal(s.water, 1);
  const before = s;
  s = use(s, 'fish_tank', '', {});
  assert.equal(s.water, 1);
  assert.equal(s.players[0].hand.length, before.players[0].hand.length);
  s.food = 0;
  s = use(s, 'cat');
  assert.equal(s.food, 2);
});
test('シャーマンキットは当日の降水0だけを1にする', () => {
  let s = game();
  s.currentPrecip = 0;
  s = use(s, 'shaman_kit');
  assert.equal(s.currentPrecip, 1);
  assert.equal(s.weatherDeck.length, 11);
});
test('気圧計/懐中電灯の中身は使った本人以外へ漏らさず、山札は減らない', () => {
  for (const kind of ['barometer', 'flashlight'] as const) {
    let s = game();
    const deck = s.deck.length;
    s = use(s, kind);
    assert.ok(redactFor(s, 'p0', 'p0').privatePreview);
    assert.equal(redactFor(s, 'p1', 'p0').privatePreview, undefined);
    assert.equal(redactFor(s, 'spectator', 'p0').privatePreview, undefined);
    assert.equal(s.deck.length, deck);
  }
});
test('浮き輪は非公開の2枚から1枚選択するまで進行停止。本人以外は決められない', () => {
  let s = game();
  s = use(s, 'duck_float');
  s.deck = [card('water_bottle', 'w'), card('gun', 'g'), card('junk', 'j')];
  s = takeAction(s, 'p0', 'search');
  assert.equal(s.pendingCard?.kind, 'search');
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(redactFor(s, 'p1', 'p0').pendingCard?.cards, undefined);
  assert.deepEqual(
    redactFor(s, 'p0', 'p0').pendingCard?.cards?.map((c) => c.id),
    ['w', 'g'],
  );
  assert.equal(resolveCardDecision(s, 'p1', 'g'), s);
  assert.equal(takeAction(s, 'p1', 'fish'), s);
  s = resolveCardDecision(s, 'p0', 'g');
  assert.equal(s.pendingCard, undefined);
  assert.deepEqual(
    s.players[0].hand.map((c) => c.id),
    ['g'],
  );
  assert.equal(currentActorId(s), 'p1');
  assert.equal(s.deck.length, 1);
});
test('最後の行動の浮き輪選択が終わる前に生存判定へ移らない', () => {
  let s = game(3);
  s.currentActorIndex = 2;
  s.players[0].acted = s.players[1].acted = true;
  s.players[2].hand = [card('duck_float')];
  s = playCard(s, 'p2', 'duck_float');
  s = takeAction(s, 'p2', 'search');
  assert.equal(s.phase, 'action');
  s = resolveCardDecision(s, 'p2', s.pendingCard!.cards![0].id);
  assert.equal(s.phase, 'survival');
});
test('ムチ/振り子で相手に即時行動。相手の通常手番も自分の行動も残る', () => {
  for (const kind of ['whip', 'pendulum'] as const) {
    let s = game();
    s = use(s, kind, 'p1', { action: 'fish', woodPush: 0 });
    assert.equal(currentActorId(s), 'p0');
    assert.equal(s.players[1].acted, false);
    assert.ok(s.log.some((l) => l.playerId === 'p1'));
    s = takeAction(s, 'p0', 'wood');
    assert.equal(currentActorId(s), 'p1');
  }
});
test('金属探知機は上4枚から弾・防具だけを回収し、他を捨てる', () => {
  let s = game();
  s.deck = [card('bullet'), card('sandwich'), card('concave_plate'), card('hollow_bullet'), card('gun')];
  s = use(s, 'metal_detector');
  assert.deepEqual(
    s.players[0].hand.map((c) => c.kind),
    ['bullet', 'concave_plate', 'hollow_bullet'],
  );
  assert.deepEqual(
    s.deck.map((c) => c.kind),
    ['gun'],
  );
});
test('テーザー銃は公開済みの装備だけを選んで奪う', () => {
  let s = game();
  s.players[1].hand = [card('axe'), card('canteen')];
  s = playCard(s, 'p1', 'axe');
  assert.ok(s.players[1].revealed.includes('axe'));
  s = use(s, 'taser', 'p1', { targetCardId: 'axe' });
  assert.ok(s.players[0].revealed.includes('axe'));
  assert.ok(!s.players[1].revealed.includes('axe'));
  assert.ok(s.players[1].hand.some((c) => c.kind === 'canteen'));
});
test('通常弾は反射板で左隣へ。ダムダム弾は2種類の防具を貫く', () => {
  let s = game();
  s.players[0].hand = [card('gun'), card('bullet')];
  s.players[2].hand = [card('concave_plate')];
  s = playCard(s, 'p0', 'gun', 'p2');
  assert.ok(s.players[2].alive);
  assert.equal(s.players[1].alive, false);
  assert.equal(s.players[2].hand.length, 0);
  s = game();
  s.players[0].hand = [card('gun'), card('hollow_bullet')];
  s.players[1].hand = [card('tin_sheet'), card('concave_plate')];
  s = playCard(s, 'p0', 'gun', 'p1', { useHollowBullet: true });
  assert.equal(s.players[1].alive, false);
  assert.ok(s.players[0].hand.some((c) => c.kind === 'tin_sheet'));
});
test('砥石は隣人限定。斧と砥石を失い、被害者の手札を得る', () => {
  let s = game();
  s.players[0].hand = [card('axe'), card('whetstone')];
  s.players[1].hand = [card('water_bottle')];
  assert.equal(playCard(s, 'p0', 'whetstone', 'p2'), s);
  s = playCard(s, 'p0', 'whetstone', 'p1');
  assert.equal(s.players[1].alive, false);
  assert.deepEqual(
    s.players[0].hand.map((c) => c.kind),
    ['water_bottle'],
  );
});
test('ラム酒は親から順に左隣へ1枚ずつ。途中は通常操作不可', () => {
  let s = game(3);
  s.players.forEach((p, i) => (p.hand = [card('junk', `j${i}`)]));
  s = use(s, 'rum');
  assert.equal(s.pendingCard?.playerId, 'p0');
  s = resolveCardDecision(s, 'p0', 'j0');
  assert.ok(s.players[2].hand.some((c) => c.id === 'j0'));
  assert.equal(s.pendingCard?.playerId, 'p1');
  s = resolveCardDecision(s, 'p1', 'j1');
  s = resolveCardDecision(s, 'p2', 'j2');
  assert.equal(s.pendingCard, undefined);
  assert.equal(currentActorId(s), 'p0');
});
test('水晶玉は他の投票を見て最後に投票。ほら貝の対象免除も検証', () => {
  let s = game(3);
  s = use(s, 'crystal_ball');
  s.phase = 'vote';
  s.voteReason = 'food';
  s.pendingEliminations = 1;
  assert.equal(castVote(s, 'p0', 'p1'), s);
  s = castVote(s, 'p1', 'p2');
  s = castVote(s, 'p2', 'p1');
  assert.equal(redactFor(s, 'p0', 'p0').players[1].vote, 'p2');
  assert.equal(redactFor(s, 'p2', 'p0').players[1].vote, undefined);
  s = castVote(s, 'p0', 'p1');
  assert.ok(isVoteReady(s));
  s = game(3);
  s = use(s, 'conch');
  s.phase = 'vote';
  s = castVote(s, 'p1', 'p0');
  assert.equal(s.players[1].vote, null);
});
test('脱落時は装備効果を消し、銃と浮き輪だけ回収。斧は捨てる', () => {
  let s = game();
  s.players[1].hand = [card('axe'), card('duck_float'), card('gun')];
  s = playCard(s, 'p1', 'axe');
  s = playCard(s, 'p1', 'duck_float');
  s.players[0].hand = [card('gun', 'gun0'), card('bullet')];
  s = playCard(s, 'p1', 'gun', 'p0'); // 弾がなく不成立
  s.players[1].equipment!.push(card('gun'));
  s.players[1].hand = s.players[1].hand.filter((c) => c.kind !== 'gun');
  s.players[1].revealed.push('gun');
  s = playCard(s, 'p0', 'gun0', 'p1');
  assert.equal(s.players[1].revealed.length, 0);
  assert.ok(s.players[0].hand.some((c) => c.kind === 'duck_float'));
  assert.ok(!s.players[0].hand.some((c) => c.kind === 'axe'));
});
test('3〜12人・計300ゲームのCPU通しプレイが終了し、資源・座席が範囲内に収まる', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const n = 3 + (seed % 10);
    let s = startGame(
      createGame(
        Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true })),
        { seed },
      ),
    );
    let steps = 0;
    while (s.phase !== 'gameover' && steps++ < 1500) {
      if (s.pendingCard) {
        const id = aiCardDecision(s);
        assert.ok(id);
        s = resolveCardDecision(s, s.pendingCard.playerId, id!);
      } else if (s.phase === 'action') {
        const id = currentActorId(s)!;
        let p = s.players.find((p) => p.id === id)!;
        for (const c of aiBeforeAction(s, p)) s = playCard(s, id, c);
        p = s.players.find((p) => p.id === id)!;
        for (const c of aiExtraPlays(s, p)) {
          s = playCard(s, id, c.cardId, c.targetId, c.options);
          if (s.pendingCard) break;
        }
        if (!s.pendingCard) {
          p = s.players.find((p) => p.id === id)!;
          const a = aiAction(s, p, new Rng(s.rngState));
          s = takeAction(s, id, a.action, a.woodPush);
        }
      } else if (s.phase === 'survival') {
        for (const p of s.players.filter((p) => p.alive && !p.escaped)) {
          for (const c of aiSurvivalPlays(s, p)) s = playCard(s, p.id, c);
          s = passSurvival(s, p.id);
        }
        assert.ok(isSurvivalReady(s));
        s = resolveSurvival(s);
      } else if (s.phase === 'vote') {
        for (const p of s.players.filter((p) => p.alive && !p.escaped && !p.sick && p.vote === undefined))
          s = castVote(s, p.id, aiVote(s, p, new Rng(s.rngState + steps)));
        if (isVoteReady(s)) s = resolveVote(s);
      } else if (s.phase === 'escape') {
        for (const p of s.players.filter((p) => p.alive && !p.escaped)) s = setEscapeChoice(s, p.id, true);
        s = resolveEscape(s);
      }
      assert.ok(s.food >= 0 && s.food <= 36 && s.water >= 0 && s.water <= 36);
      assert.ok(s.raftSeats >= 0 && s.raftSeats <= 12);
      assert.ok(s.raftProgress >= 0 && s.raftProgress < 6);
    }
    assert.equal(s.phase, 'gameover', `seed ${seed}, phase ${s.phase}, pending ${s.pendingCard?.kind}`);
  }
});
