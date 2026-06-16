import { Rng } from './rng.js';
import type { ActionType, BotPersona, PublicGameState, PublicPlayer } from './types.js';

/**
 * AIボットの意思決定。閲覧者本人として作られた公開状態（自分の hand/items は見える）と
 * 「性格（persona）」を受け取り、人間と同じ intent を返す純粋関数。
 */

export type { BotPersona };

/** ボット追加時に順番に割り当てる性格 */
export const BOT_PERSONAS: BotPersona[] = ['cooperative', 'hoarder', 'sniper', 'coward'];

export const PERSONA_INFO: Record<BotPersona, { label: string; desc: string }> = {
  cooperative: { label: '協力的', desc: '不足を埋めるよう素直に供出する' },
  hoarder: { label: '溜め込み屋', desc: '備蓄を抱え込み、ほとんど供出しない' },
  sniper: { label: '狙撃手', desc: '拳銃で裕福な相手を撃ち、所持品を奪う' },
  coward: { label: '臆病者', desc: '疑われると睡眠薬で身を守り、群れに同調する' },
};

function self(view: PublicGameState): PublicPlayer | undefined {
  return view.players.find((p) => p.isYou);
}

function others(view: PublicGameState, me?: PublicPlayer): PublicPlayer[] {
  return view.players.filter((p) => p.alive && !p.escaped && p.id !== me?.id);
}

function contribTotal(p: PublicPlayer): number {
  return (p.contributedFood ?? 0) + (p.contributedWater ?? 0);
}

/** 行動選択：最も逼迫した資源を補う。性格で重み付けを変える。 */
export function aiChooseAction(view: PublicGameState, persona: BotPersona, rng: Rng): ActionType {
  const need = view.need;
  const foodGap = Math.max(0, need - view.food);
  const waterGap = Math.max(0, need - view.water);
  const seatGap = Math.max(0, need - view.raftCapacity);
  const daysLeft = view.stormIn;
  const jitter = () => rng.next() * 0.6;

  const scores: Record<ActionType, number> = {
    water: waterGap * 2 + (view.weather === 'rain' ? 1.5 : 0) + jitter(),
    fish: foodGap * 2 + jitter(),
    wood: seatGap * (daysLeft <= 2 ? 3.5 : 1.6) + jitter(),
    search: 0.8 + jitter(),
  };

  // 性格による補正
  if (persona === 'hoarder') scores.search += 2.2; // とにかく漁って溜め込む
  if (persona === 'coward') {
    scores.water += 1; // 自己保身（水・食料優先）
    scores.fish += 1;
  }
  if (persona === 'sniper') scores.search += 0.8; // 道具（拳銃）を狙う

  let best: ActionType = 'fish';
  for (const a of Object.keys(scores) as ActionType[]) {
    if (scores[a] > scores[best]) best = a;
  }
  return best;
}

/** 供出判断：性格で出し惜しみの度合いを変える。 */
export function aiContribute(
  view: PublicGameState,
  persona: BotPersona,
  _rng: Rng,
): { food: number; water: number } {
  const me = self(view);
  if (!me?.hand) return { food: 0, water: 0 };
  const foodShort = Math.max(0, view.need - view.food);
  const waterShort = Math.max(0, view.need - view.water);

  const give = (have: number, short: number): number => {
    const full = Math.min(have, short);
    switch (persona) {
      case 'hoarder':
        return Math.floor(full / 2); // 申し訳程度しか出さない
      case 'sniper':
      case 'cooperative':
      case 'coward':
      default:
        return full; // 不足を素直に埋める（＝疑われにくい）。狙撃手の本領は拳銃
    }
  };

  return { food: give(me.hand.food, foodShort), water: give(me.hand.water, waterShort) };
}

/** 投票：性格で「誰を狙うか」の重みを変える。 */
export function aiVote(view: PublicGameState, persona: BotPersona, rng: Rng): string | null {
  const me = self(view);
  const candidates = others(view, me);
  if (candidates.length === 0) return null;

  // contrib: 供出の少なさを重視 / hand: 溜め込み量を重視
  const W: Record<BotPersona, { contrib: number; hand: number }> = {
    cooperative: { contrib: 2, hand: 1.5 },
    coward: { contrib: 3, hand: 1 }, // 群れに同調（供出が少ない奴を吊る）
    hoarder: { contrib: 1, hand: 3 }, // ライバルの溜め込み屋を消す
    sniper: { contrib: 1, hand: 3 }, // 裕福な相手を狙う
  };
  const w = W[persona];
  const score = (p: PublicPlayer) => -contribTotal(p) * w.contrib + p.handCount * w.hand + rng.next();

  let target = candidates[0];
  for (const p of candidates) if (score(p) > score(target)) target = p;
  return target.id;
}

/** 脱出投票：乗れるなら出航（脱出＝勝利）。 */
export function aiEscapeVote(_view: PublicGameState, _persona: BotPersona, _rng: Rng): boolean {
  return true;
}

/**
 * アイテムの自動使用。1回の呼び出しで1アクションを返す（サーバ側で消費後に再度呼ばれる）。
 * - 全性格: 病気なら解毒剤
 * - 狙撃手: 投票/行動フェイズで拳銃を持っていれば、最も裕福な相手を撃つ
 * - 臆病者/溜め込み屋: 投票で自分が最も疑われそうなら睡眠薬で防御
 */
export function aiItemPlay(
  view: PublicGameState,
  persona: BotPersona,
  rng: Rng,
): { itemId: string; targetId?: string | null } | null {
  const me = self(view);
  if (!me?.items || me.items.length === 0) return null;

  // 1) 解毒剤
  if (me.sick) {
    const antidote = me.items.find((it) => it.kind === 'antidote');
    if (antidote) return { itemId: antidote.id };
  }

  // 2) 拳銃（狙撃手）
  if (persona === 'sniper' && (view.phase === 'vote' || view.phase === 'action')) {
    const gun = me.items.find((it) => it.kind === 'gun');
    if (gun) {
      const rivals = others(view, me);
      if (rivals.length > 0) {
        const target = rivals.reduce((a, b) => (b.handCount > a.handCount ? b : a));
        const worth = view.phase === 'vote' || target.handCount >= 3;
        if (worth && rng.chance(0.6)) return { itemId: gun.id, targetId: target.id };
      }
    }
  }

  // 3) 睡眠薬（臆病者・溜め込み屋）：投票で自分が最少供出なら防御
  if ((persona === 'coward' || persona === 'hoarder') && view.phase === 'vote' && !me.voteImmune) {
    const pills = me.items.find((it) => it.kind === 'pills');
    if (pills) {
      const alive = view.players.filter((p) => p.alive && !p.escaped);
      const minContrib = Math.min(...alive.map(contribTotal));
      if (contribTotal(me) <= minContrib && rng.chance(0.8)) return { itemId: pills.id };
    }
  }

  return null;
}

const CHAT_LINES: Record<BotPersona, string[]> = {
  cooperative: ['みんなで協力すれば全員助かるはずだ。', '正直に物資を出してくれ、頼む。'],
  hoarder: ['私は何も隠してないって！', '疑うなら証拠を見せてみろよ。', 'なんで僕が疑われるんだ…？'],
  sniper: ['邪魔する奴は容赦しない。', '誰が消えるべきか、わかってるよな？', '無駄な抵抗はやめろ。'],
  coward: ['お、俺じゃない！あいつが怪しい！', '頼む、僕だけは勘弁してくれ…！', 'みんなが言うなら…そいつでいいよ。'],
};

/** 投票フェイズでの性格別の煽りセリフ（なければ null）。 */
export function aiChatLine(view: PublicGameState, persona: BotPersona, rng: Rng): string | null {
  if (view.phase !== 'vote') return null;
  return rng.chance(0.6) ? rng.pick(CHAT_LINES[persona]) : null;
}
