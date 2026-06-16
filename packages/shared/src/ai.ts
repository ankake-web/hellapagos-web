import { difficultyParams } from './content.js';
import { aliveCount, hasPermanent } from './engine.js';
import { Rng } from './rng.js';
import type { ActionType, BotPersona, Difficulty, GameState, Player } from './types.js';

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
    if (waterDeficit > 0 && (c.kind === 'water_bottle')) {
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
