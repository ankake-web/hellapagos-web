import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRunner } from '../packages/client/src/game/localRunner.js';
import { RoomManager } from '../packages/server/src/rooms.js';
import { createGame, startGame, presentationTiming } from '../packages/shared/src/index.js';
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
