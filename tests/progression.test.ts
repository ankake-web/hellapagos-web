import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRunner } from '../packages/client/src/game/localRunner.js';
import { RoomManager } from '../packages/server/src/rooms.js';
import { actionMoment, createGame, drawTiming, redactFor, RESOURCE_CAP, startGame, takeAction, presentationTiming } from '../packages/shared/src/index.js';
import { emptyPlayback, gatheringPlayback, visibleTable } from '../packages/client/src/game/gatheringPlayback.js';
import type { GameState, PublicGameState } from '../packages/shared/src/types.js';
type Internal = { state: GameState; presentedRound: number; drive: () => void; clearTimers: () => void };
const fixture = () => {
  const s = startGame(
    createGame(
      [
        { id: 'p0', name: '本人', isBot: false },
        { id: 'p1', name: 'CPU1', isBot: true },
        { id: 'p2', name: 'CPU2', isBot: true },
      ],
      { seed: 3, speed: 'normal', timeLimit: 0 },
    ),
  );
  s.players.forEach((p) => {
    p.hand = [];
    p.equipment = [];
    p.revealed = [];
  });
  return s;
};

test('ローカル：自分の結果→CPU思考→宣言→結果の順に表示。結果中に次の行動が走らない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 });
  let view: PublicGameState;
  const frames: Array<{ at: number; view: PublicGameState }> = [];
  const runner = new LocalRunner({
    onState: (s) => {
      view = s;
      frames.push({ at: Date.now(), view: s });
    },
    onChat: () => {},
  });
  runner.createRoom('本人');
  const inside = runner as unknown as Internal;
  const s = fixture();
  (runner as unknown as { myId: string }).myId = 'p0';
  inside.state = s;
  inside.presentedRound = 1;
  inside.drive();
  runner.choose('wood', 0);
  assert.equal(view!.tableMoment?.stage, 'result');
  assert.equal(view!.currentActorId, 'p1');
  assert.equal(view!.raftProgress, 1);
  t.mock.timers.tick(2400);
  assert.equal(view!.tableMoment?.stage, 'result');
  t.mock.timers.tick(100);
  assert.equal(view!.tableMoment?.stage, 'thinking');
  assert.equal(inside.state.players[1].acted, false);
  t.mock.timers.tick(3000);
  assert.equal(view!.tableMoment?.stage, 'announce');
  assert.equal(inside.state.players[1].acted, false);
  t.mock.timers.tick(1300);
  assert.equal(view!.tableMoment?.stage, 'result');
  assert.equal(inside.state.players[1].acted, true);
  assert.equal(inside.state.players[2].acted, false);
  t.mock.timers.tick(2400);
  assert.equal(view!.tableMoment?.stage, 'result');
  assert.equal(inside.state.players[2].acted, false);
  const stages = frames.map((f) => f.view.tableMoment?.stage).filter((v, i, a) => v !== a[i - 1]);
  assert.deepEqual(stages.slice(-4), ['result', 'thinking', 'announce', 'result']);
  runner.dispose();
});
test('ローカル：新ラウンドの天候表示が終わるまでCPUは行動しない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2000000 });
  let view: PublicGameState;
  const runner = new LocalRunner({ onState: (s) => (view = s), onChat: () => {} });
  runner.createRoom('本人');
  const inside = runner as unknown as Internal;
  inside.state = fixture();
  inside.state.currentActorIndex = 1;
  inside.drive();
  t.mock.timers.tick(presentationTiming('normal').round - 1);
  assert.equal(view!.tableMoment, undefined);
  assert.equal(inside.state.players[1].acted, false);
  t.mock.timers.tick(1);
  assert.equal(view!.tableMoment?.stage, 'thinking');
  runner.dispose();
});

test('装備カードも使用結果を表示し、その間に行動を消費しない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2500000 });
  let view: PublicGameState;
  const runner = new LocalRunner({ onState: (s) => (view = s), onChat: () => {} });
  runner.createRoom('本人');
  const inside = runner as unknown as Internal;
  inside.state = fixture();
  inside.presentedRound = 1;
  (runner as unknown as { myId: string }).myId = 'p0';
  inside.state.players[0].hand = [{ id: 'flask', kind: 'canteen' }];
  inside.drive();
  runner.playCard('flask');
  assert.equal(view!.tableMoment?.cardKind, 'canteen');
  assert.equal(view!.tableMoment?.stage, 'result');
  runner.choose('wood');
  assert.equal(inside.state.players[0].acted, false);
  t.mock.timers.tick(1300);
  assert.equal(view!.tableMoment, undefined);
  runner.choose('wood');
  assert.equal(inside.state.players[0].acted, true);
  runner.dispose();
});
test('ローカル：浮き輪を持つCPUの非公開選択も自動で解決して次の人へ進む', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 3000000 });
  const runner = new LocalRunner({ onState: () => {}, onChat: () => {} });
  runner.createRoom('本人');
  const inside = runner as unknown as Internal;
  inside.state = fixture();
  inside.presentedRound = 1;
  inside.state.currentActorIndex = 1;
  inside.state.pendingCard = {
    kind: 'search',
    playerId: 'p1',
    cards: [
      { id: 'a', kind: 'gun' },
      { id: 'b', kind: 'junk' },
    ],
    advanceTurn: true,
  };
  inside.state.players[1].acted = true;
  inside.state.currentActorIndex = 2;
  inside.drive();
  t.mock.timers.tick(1300);
  assert.equal(inside.state.pendingCard, undefined);
  assert.equal(inside.state.players[1].hand[0].kind, 'gun');
  runner.dispose();
});
test('オンライン：公開状態でもCPUの3段階表示と人間の結果待ちを維持する', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 4000000 });
  let view: PublicGameState;
  const io = {
    to: () => ({
      emit: (name: string, payload: PublicGameState) => {
        if (name === 'game:state') view = payload;
      },
    }),
  };
  const manager = new RoomManager(io as never);
  const { roomId, playerId } = manager.createRoom('本人', 'sock');
  manager.addBot('sock');
  manager.addBot('sock');
  const room = (manager as unknown as { rooms: Map<string, { state: GameState; presentedRound: number }> }).rooms.get(
    roomId,
  )!;
  room.state = fixture();
  room.state.players[0].id = playerId;
  room.presentedRound = 1;
  manager.submitAction('sock', 'wood', 0);
  assert.equal(view!.tableMoment?.stage, 'result');
  t.mock.timers.tick(2500);
  assert.equal(view!.tableMoment?.stage, 'thinking');
  t.mock.timers.tick(3000);
  assert.equal(view!.tableMoment?.stage, 'announce');
  t.mock.timers.tick(1300);
  assert.equal(view!.tableMoment?.stage, 'result');
  assert.equal(room.state.players[2].acted, false);
  (manager as unknown as { clearTimers: (r: unknown) => void }).clearTimers(room);
});
test('水晶玉CPUが先の席でも、無制限時間の投票が固まらない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 5000000 });
  const runner = new LocalRunner({ onState: () => {}, onChat: () => {} });
  runner.createRoom('本人');
  const inside = runner as unknown as Internal;
  inside.state = fixture();
  inside.presentedRound = 1;
  inside.state.players.forEach((p) => (p.isBot = true));
  inside.state.players[0].revealed = ['crystal_ball'];
  inside.state.phase = 'vote';
  inside.state.voteReason = 'water';
  inside.state.pendingEliminations = 1;
  inside.state.food = 10;
  inside.drive();
  assert.ok(inside.state.phase !== 'vote' || inside.state.pendingCard?.kind === 'tie');
  runner.dispose();
});

test('木の5玉を取り出して着地するまで、備蓄・病気・ログ・獲得トークンから結末が漏れない', () => {
  const s = fixture();
  const before = redactFor(s, 'p0', 'p0');
  const after = takeAction(s, 'p0', 'wood', 5);
  const live = redactFor(after, 'p0', 'p0');
  live.tableMoment = actionMoment(s, after, 'p0', 'wood');
  const id = live.tableMoment.id;
  let p = gatheringPlayback(gatheringPlayback(emptyPlayback, { view: before }), { view: live });
  assert.deepEqual(p.gathering!.balls, after.lastDraw!.balls);
  for (let i = 0; i <= 5; i++) {
    const shown = visibleTable(p)!;
    assert.equal(p.gathering!.revealed, i);
    assert.equal(shown.log, before.log);
    assert.equal(shown.players, before.players);
    assert.equal(shown.lastGain, before.lastGain);
    assert.equal(shown.raftProgress, before.raftProgress);
    assert.equal(shown.lastDraw, before.lastDraw);
    assert.equal(shown.tableMoment!.title, '');
    assert.equal(shown.isYourTurn, false);
    p = gatheringPlayback(p, { view: { ...live } });
    p = gatheringPlayback(p, { reveal: id, step: i + 1 });
    assert.equal(gatheringPlayback(p, { reveal: id, step: i + 1 }), p);
  }
  assert.equal(visibleTable(p), p.live);
  assert.equal(p.gathering!.settled, true);
});

test('水くみは直前の釣り玉を使わず、水筒と備蓄上限を反映。安全な木も袋を引かない', () => {
  const s = fixture();
  s.currentPrecip = 3;
  s.water = RESOURCE_CAP - 1;
  s.players[0].revealed = ['canteen', 'axe'];
  s.lastDraw = { playerId: 'p0', action: 'fish', balls: [{ fish: 2 }] };
  for (const action of ['water', 'wood'] as const) {
    const after = takeAction(s, 'p0', action);
    const live = redactFor(after, 'viewer', 'p0');
    live.tableMoment = actionMoment(s, after, 'p0', action);
    const p = gatheringPlayback(gatheringPlayback(emptyPlayback, { view: redactFor(s, 'viewer', 'p0') }), { view: live });
    assert.deepEqual(p.gathering!.balls, []);
    assert.equal(p.gathering!.steps, 1);
    assert.equal(visibleTable(p)!.water, s.water);
    const result = visibleTable(gatheringPlayback(p, { reveal: live.tableMoment.id, step: 1 }))!;
    assert.equal(result, live);
    if (action === 'water') {
      assert.match(result.tableMoment!.title, /6杯/);
      assert.match(result.tableMoment!.detail, /上限/);
      assert.equal(result.water, RESOURCE_CAP);
    } else assert.match(result.tableMoment!.title, /2本/);
  }
});

test('再接続では完了済みの結果を表示し、次の手番に移った後は古いタイマーを無視する', () => {
  const s = fixture();
  s.food = RESOURCE_CAP;
  s.players[0].revealed = ['fishing_rod'];
  const after = takeAction(s, 'p0', 'fish');
  const live = redactFor(after, 'p0', 'p0');
  live.tableMoment = actionMoment(s, after, 'p0', 'fish');
  const caught = after.lastDraw!.balls.reduce((n, b) => n + ('fish' in b ? b.fish : 3), 0);
  assert.match(live.tableMoment.title, new RegExp(caught + '匹'));
  assert.match(live.tableMoment.detail, /上限/);
  const rejoin = gatheringPlayback(emptyPlayback, { view: live });
  assert.equal(rejoin.gathering!.revealed, 2);
  assert.equal(visibleTable(rejoin), live);
  const next = gatheringPlayback(rejoin, { view: { ...live, tableMoment: undefined } });
  assert.equal(next.gathering, null);
  assert.equal(gatheringPlayback(next, { reveal: live.tableMoment.id, step: 1 }), next);
});

test('全速度で木の5玉目が着地してから結果を読む時間を取る', () => {
  for (const speed of ['fast', 'normal', 'slow'] as const) {
    const s = fixture();
    s.config.speed = speed;
    const m = actionMoment(s, takeAction(s, 'p0', 'wood', 5), 'p0', 'wood');
    const t = drawTiming(speed);
    assert.ok(m.until - m.id - t.first - 4 * t.next - 360 >= 700);
  }
});
