import { difficultyParams } from './content.js';
import { aliveCount, hasPermanent } from './engine.js';
import { Rng } from './rng.js';
import type { ActionType, BotPersona, CardKind, Difficulty, GameState, Player } from './types.js';

const PASSIVE_PERMS: readonly CardKind[] = ['axe', 'fishing_rod', 'canteen', 'crystal_ball', 'club'];
/** 受動の永続は所持しているだけでは無効になったので、CPUは手番で即「発動」する。 */
export function aiPermanentPlays(p: Player): string[] {
  return p.hand.filter((c) => PASSIVE_PERMS.includes(c.kind) && !p.revealed.includes(c.kind)).map((c) => c.id);
}

/** CPUが自分の手番(行動フェイズ)の前に使うカードIDの配列。永続の発動＋人肉BBQ等。 */
export function aiBeforeAction(s: GameState, p: Player): string[] {
  const ids = aiPermanentPlays(p);
  // 死体があり、食料が不安なら人肉BBQで食料化
  if ((s.bodiesAvailable ?? 0) > 0 && s.food < aliveCount(s) + 1) {
    const bbq = p.hand.find((c) => c.kind === 'cannibal_bbq');
    if (bbq) ids.push(bbq.id);
  }
  return ids;
}

/** 投票で「自分が追放されそう」なCPUがほら貝を吹いて無効化する番。返り値は {playerId, cardId} の配列。 */
export function aiConchPlays(s: GameState): Array<{ playerId: string; cardId: string }> {
  if (s.phase !== 'vote') return [];
  const alive = s.players.filter((p) => p.alive && !p.escaped);
  // 簡易集計（棍棒重みは無視した概算で十分）
  const tally = new Map<string, number>();
  for (const v of alive) if (!v.sick && v.vote) tally.set(v.vote, (tally.get(v.vote) ?? 0) + 1);
  let max = 0;
  let victim: Player | undefined;
  for (const p of alive) {
    const n = tally.get(p.id) ?? 0;
    if (n > max) {
      max = n;
      victim = p;
    }
  }
  if (!victim || max <= 0) return [];
  // 被害者がCPU/未接続で、自己救済できず、ほら貝を持っているなら吹く
  const isAuto = victim.isBot || !victim.connected;
  if (!isAuto || victim.voteSafe) return [];
  const reason = s.voteReason;
  const hasSave = reason === 'water'
    ? victim.hand.some((c) => c.kind === 'coconut' || c.kind === 'water_bottle' || c.kind === 'dirty_water')
    : victim.hand.some((c) => c.kind === 'sardine_can' || c.kind === 'sandwich' || c.kind === 'rotten_fish');
  if (hasSave) return [];
  const conch = victim.hand.find((c) => c.kind === 'conch');
  return conch ? [{ playerId: victim.id, cardId: conch.id }] : [];
}

/**
 * CPUの意思決定。サーバ側で完全な GameState と当該 Player を渡して使う純粋関数。
 * 性格(persona)と難易度(difficulty)で傾向を変える。
 */

function persona(p: Player): BotPersona {
  return p.botPersona ?? 'cooperative';
}
function diff(p: Player, s: GameState): Difficulty {
  return p.difficulty ?? s.config.difficulty;
}
function weatherLeft(s: GameState): number {
  return s.weatherDeck.length;
}
function lateGame(s: GameState): boolean {
  return s.hurricaneRevealed || weatherLeft(s) <= 3;
}

export function aiAction(s: GameState, p: Player, rng: Rng): { action: ActionType; woodPush: number } {
  const need = aliveCount(s);
  const foodGap = Math.max(0, need - s.food);
  const waterGap = Math.max(0, need - s.water);
  const seatGap = Math.max(0, need - s.raftSeats);
  const { risk } = difficultyParams(diff(p, s));
  const per = persona(p);
  const wLeft = weatherLeft(s);
  const hurry = s.hurricaneRevealed || wLeft <= 2;
  const j = () => rng.next() * 0.6;

  const scores: Record<ActionType, number> = {
    water: s.currentPrecip > 0 ? waterGap * 2 + s.currentPrecip * 0.5 + j() : -5,
    fish: foodGap * 2 + (hasPermanent(p, 'fishing_rod') ? 1 : 0) + j(),
    wood: seatGap * (hurry ? 3.2 : 1.5) + (hasPermanent(p, 'axe') ? 0.5 : 0) + j(),
    search: 0.8 + (per === 'hoarder' ? 2 : 0) + (p.hand.length < 2 ? 1 : 0) + j(),
  };
  let best: ActionType = 'fish';
  for (const a of Object.keys(scores) as ActionType[]) if (scores[a] > scores[best]) best = a;

  let woodPush = 0;
  if (best === 'wood' && seatGap > 0) {
    woodPush = Math.min(5, Math.round(risk * 4) + (hurry ? 1 : 0));
    if (per === 'coward') woodPush = Math.max(0, woodPush - 1);
  }
  return { action: best, woodPush };
}

/** 生存ウィンドウで供出するカードid列（協力寄り/終盤は出し惜しみ） */
export function aiSurvivalPlays(s: GameState, p: Player): string[] {
  const need = aliveCount(s);
  let waterDeficit = Math.max(0, need - s.water);
  let foodDeficit = Math.max(0, need - s.food);
  const per = persona(p);
  const { selfish } = difficultyParams(diff(p, s));
  const late = lateGame(s);
  // 溜め込み屋＆終盤の自己中は出さない（投票で詰むまで温存）
  const willShare = per === 'cooperative' || per === 'coward' || (!late && selfish < 0.6);
  if (!willShare) return [];

  const ids: string[] = [];
  for (const c of [...p.hand]) {
    if (waterDeficit > 0 && c.kind === 'coconut') {
      ids.push(c.id);
      waterDeficit -= 3;
    } else if (waterDeficit > 0 && c.kind === 'water_bottle') {
      ids.push(c.id);
      waterDeficit -= 1;
    } else if (foodDeficit > 0 && c.kind === 'sardine_can') {
      ids.push(c.id);
      foodDeficit -= 3;
    } else if (foodDeficit > 0 && c.kind === 'sandwich') {
      ids.push(c.id);
      foodDeficit -= 1;
    }
  }
  return ids;
}

export function aiVote(s: GameState, p: Player, rng: Rng): string | null {
  const me = p;
  const cands = s.players.filter((x) => x.alive && !x.escaped && x.id !== me.id);
  if (cands.length === 0) return null;
  const per = persona(me);
  const { voteSmart } = difficultyParams(diff(me, s));
  // 重み：手札(脅威/裕福)を重視 or ランダム寄り
  const score = (x: Player) => {
    const threat = x.hand.length * (per === 'sniper' || per === 'hoarder' ? 2.5 : 1.2);
    const noise = rng.next() * (1 - voteSmart) * 6;
    return threat + noise;
  };
  let target = cands[0];
  for (const x of cands) if (score(x) > score(target)) target = x;
  return target.id;
}

export function aiEscape(_s: GameState, _p: Player): boolean {
  return true;
}

const CHAT_LINES: Record<BotPersona, string[]> = {
  cooperative: ['みんなで分け合おう。', '正直に出してくれ、頼む。'],
  hoarder: ['私は何も隠してないって！', '疑うなら証拠を見せろよ。'],
  sniper: ['邪魔する奴は容赦しない。', '誰が消えるべきか分かるな？'],
  coward: ['お、俺じゃない！あいつだ！', '頼む、僕だけは…！'],
};
export function aiChatLine(p: Player, rng: Rng): string | null {
  return rng.chance(0.55) ? rng.pick(CHAT_LINES[persona(p)]) : null;
}

/**
 * 無料（APIキー無し）でも交渉感を出すための、状況依存スクリプトのセリフ＋投票意図。
 * 手札・性格・脅し（銃）・取引・なすりつけ・強行を、相手の名前を入れて述べる。
 */
export function scriptedNegotiation(
  s: GameState,
  me: Player,
  rng: Rng,
): { say: string; voteId: string | null } {
  const others = s.players.filter((p) => p.alive && !p.escaped && p.id !== me.id);
  if (others.length === 0) return { say: '…', voteId: null };
  const per = persona(me);
  const rich = [...others].sort((a, b) => b.hand.length - a.hand.length)[0];
  const poor = [...others].sort((a, b) => a.hand.length - b.hand.length)[0];
  const armed = me.hand.some((c) => c.kind === 'gun') && me.hand.some((c) => c.kind === 'bullet');
  const target = per === 'sniper' || per === 'hoarder' ? rich : poor;

  const lines: string[] = [];
  if (armed) {
    lines.push(`弾は込めてある。${rich.name}、妙な真似はするなよ。`);
    lines.push(`いざとなれば撃つ。${rich.name}が一番あやしい。`);
  }
  switch (per) {
    case 'cooperative':
      lines.push(`${target.name}、ほとんど何も出してないだろ？`, `公平にいこう。${target.name}が抜けるべきだ。`, `${poor.name}、水を出すなら庇うよ。`);
      break;
    case 'hoarder':
      lines.push(`私は出した方だ、${rich.name}こそ溜め込んでる。`, `疑うなら${rich.name}を調べろよ。`, `なんで僕なんだ、${target.name}だろ普通。`);
      break;
    case 'sniper':
      lines.push(`${rich.name}、手札を抱えすぎだ。消えてもらう。`, `誰が邪魔か、もう分かってる。${rich.name}だ。`, `俺は${rich.name}に入れる。文句あるか？`);
      break;
    case 'coward':
      lines.push(`お、俺じゃない！${target.name}が怪しい！`, `みんなが${target.name}なら、俺もそれでいい…`, `頼む、${poor.name}…君が出してくれよ。`);
      break;
  }
  // たまに取引・強行
  if (rng.chance(0.3)) lines.push(`${poor.name}、次は譲る。今回は${target.name}でいこう。`);
  if (rng.chance(0.2)) lines.push(`みんなが何と言おうと、俺は${target.name}に入れる。`);

  const voteId = rng.chance(per === 'coward' ? 0.5 : 0.8) ? target.id : null;
  return { say: rng.pick(lines), voteId };
}
