import type { ActionType, GameState, Player, Speed, TableMoment } from './types.js';

/** ゲームの確率・判断と切り離した、卓で結果を見届けるための時間。 */
export function presentationTiming(speed: Speed) {
  if (speed === 'slow') return { think: [3000, 4200] as const, announce: 1600, result: 3100, round: 2700 };
  if (speed === 'fast') return { think: [1100, 1700] as const, announce: 900, result: 1800, round: 2100 };
  return { think: [1900, 2900] as const, announce: 1300, result: 2500, round: 2400 };
}

export const ACTION_SCENE: Record<ActionType, { place: string; title: string }> = {
  fish: { place: '波打ち際', title: '魚を釣る' },
  water: { place: '雨の降る水場', title: '水を集める' },
  wood: { place: 'ヘビの潜む森', title: '木材を集める' },
  search: { place: '沖の難破船', title: '船倉を探す' },
};

/** セリフは公開された状況と選んだ行動だけを使う。手札や性格名は公開しない。 */
export function actionSpeech(state: GameState, player: Player, action: ActionType, woodPush: number): string {
  const count = state.players.filter((p) => p.alive && !p.escaped).length;
  const variant = (state.round + player.id.charCodeAt(player.id.length - 1)) % 2;
  if (player.botPersona === 'hoarder') {
    if (action === 'search')
      return ['船倉は俺が調べてくる。何があるかな。', 'まだ使える物があるはず。見てくるよ。'][variant];
    if (action === 'fish')
      return state.food < count ? '俺だって腹は減ってる。釣ってくる。' : '魚くらい、俺が釣ってくるよ。';
  }
  if (player.botPersona === 'coward') {
    if (action === 'wood')
      return woodPush > 0 ? `木は集めるけど…追加${woodPush}個で戻るよ。` : '今日は浅い所だけ。ヘビは勘弁してくれ。';
    if (action === 'search') return '船、沈まないよね…？ちょっと見てくる。';
    if (action === 'water') return '雨なら安全だよね。水は任せて。';
  }
  if (player.botPersona === 'sniper') {
    if (action === 'wood')
      return woodPush >= 3 ? '危険でも木が要る。奥へ行くぞ。' : 'いかだがなければ終わりだ。木を集める。';
    if (action === 'search') return '使える物を探す。手ぶらじゃ帰らん。';
  }
  if (action === 'fish')
    return state.food < count
      ? 'このままじゃ夕飯が足りない。海を見てくる。'
      : ['少しでも蓄えておこう。', '大物が来てくれるといいんだけど。'][variant];
  if (action === 'water')
    return state.currentPrecip >= 2 ? '降っているうちに、水を集めてくる。' : '一滴でも無駄にはできないな。';
  if (action === 'wood')
    return woodPush >= 3
      ? '奥まで行ってみる。ヘビには気をつけるよ。'
      : ['今日は無理せず、いかだを進めよう。', '脱出するには、まず木材だ。'][variant];
  return ['難破船に何か残っているかもしれない。', '船倉を探してくる。何があるかな。'][variant];
}

/** 実際に起きた差分だけを演出する。CPUが引いたカードの中身は含めない。 */
export function actionResult(
  before: GameState,
  after: GameState,
  playerId: string,
  action: ActionType,
): Pick<TableMoment, 'title' | 'detail'> {
  const beforePlayer = before.players.find((p) => p.id === playerId)!;
  const afterPlayer = after.players.find((p) => p.id === playerId)!;
  if (action === 'fish') {
    const n = Math.max(0, after.food - before.food);
    return {
      title: n ? `食料 +${n}` : '今回は不漁…',
      detail: n ? '釣れた魚が、みんなの蓄えに加わった。' : '食料は増えなかった。',
    };
  }
  if (action === 'water')
    return { title: `水 +${Math.max(0, after.water - before.water)}`, detail: '集めた水が、みんなの蓄えに加わった。' };
  if (action === 'wood') {
    const n = (after.raftSeats - before.raftSeats) * 6 + after.raftProgress - before.raftProgress;
    const snake =
      after.lastDraw?.playerId === playerId &&
      after.lastDraw.action === 'wood' &&
      after.lastDraw.balls.some((b) => 'snake' in b);
    return {
      title: snake ? (afterPlayer.sick ? 'ヘビに噛まれた！' : '血清でヘビの毒を治した') : `木材 +${Math.max(0, n)}`,
      detail: snake
        ? afterPlayer.sick
          ? '追加分は失った。確保した木は残るが、次のラウンドは休み。'
          : '休まずにすむ代わりに、今回集めた木は失った。'
        : after.raftSeats > before.raftSeats
          ? 'いかだに乗れる人数が増えた！'
          : 'いかだの建造が進んだ。',
    };
  }
  const n = Math.max(0, afterPlayer.hand.length - beforePlayer.hand.length);
  if (after.pendingCard?.kind === 'search')
    return { title: '漂着物を2枚発見', detail: '浮き輪を使い、持ち帰る1枚を選んでいる。中身は持ち主だけの秘密。' };
  return {
    title: n ? '漂着物カードを1枚発見' : '船倉は空だった',
    detail: n ? '持ち物に加わった。カードの中身は持ち主だけの秘密。' : 'これ以上はカードを引けない。',
  };
}
