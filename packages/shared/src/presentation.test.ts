import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationTiming, actionSpeech, actionResult } from './presentation.js';
import { createGame, startGame, currentActorId, takeAction } from './engine.js';
import { DECK_TOTAL } from './deckConfig.js';

const players = (n: number) => Array.from({length:n}, (_, i) => ({ id: `p${i}`, name: `漂流者${i}`, isBot: false }));
test('公式の初期配布：3〜8人は4枚、9〜12人は3枚。配布と残り山札の合計は74枚', () => {
  for (let n=3;n<=12;n++) {
    const s = startGame(createGame(players(n), {seed: 100+n}));
    assert.ok(s.players.every(p => p.hand.length === (n <= 8 ? 4 : 3)));
    assert.equal(s.deck.length + s.players.reduce((sum,p)=>sum+p.hand.length,0), DECK_TOTAL);
  }
});
test('木材の追加5玉は重複なし。黒玉は最多1個、白玉の魚の内訳も袋を超えない', () => {
  let bitten = 0;
  for (let seed=1;seed<=600;seed++) {
    const s = startGame(createGame(players(3), {seed}));
    const after = takeAction(s, currentActorId(s)!, 'wood', 5);
    const balls = after.lastDraw!.balls;
    assert.equal(balls.length, 5);
    const black = balls.filter(b => 'snake' in b);
    assert.ok(black.length <= 1);
    if (black.length) bitten++;
    for (const [fish,count] of [[1,2],[2,2],[3,1]]) assert.ok(balls.filter(b => !('snake' in b) && b.fish === fish).length <= count);
  }
  assert.ok(bitten > 450 && bitten < 550, `5玉中に黒玉を含む確率は約5/6：${bitten}/600`);
});
test('演出は最速でも宣言と結果を独立して見せ、通常設定では結果に2秒以上とる', () => {
  assert.ok(presentationTiming('normal').result >= 2000);
  for (const speed of ['slow','normal','fast'] as const) {
    const t = presentationTiming(speed);
    assert.ok(t.think[0] >= 1000 && t.announce >= 800 && t.result >= 1600);
  }
});
test('CPUの探索演出は引いたカードの種類・他の手札を漏らさない', () => {
  const s = startGame(createGame(players(3), {seed:12}));
  const id = currentActorId(s)!;
  const p = s.players.find(p=>p.id === id)!;
  const after = takeAction(s,id,'search');
  const result = actionResult(s,after,id,'search');
  assert.equal(result.title, '漂着物カードを1枚発見');
  const json = JSON.stringify({result, speech: actionSpeech(s,p,'search',0)});
  for (const card of after.players.find(p=>p.id===id)!.hand) assert.ok(!json.includes(card.id));
  assert.ok(!('cardKind' in result));
});
