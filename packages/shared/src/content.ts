import { Rng } from './rng.js';
import type { CardKind, Difficulty, GameConfig, WeatherCard } from './types.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const RESOURCE_CAP = 36;
export const MAX_SEATS = 12;
export const RAFT_LOOP = 6; // 木6で座席1

export const DEFAULT_CONFIG: GameConfig = {
  soleSurvivor: false,
  difficulty: 'normal',
  speed: 'normal',
  seed: 1,
};

// ===== 木玉の袋（白5: 魚 1,1,2,2,3 / 黒1: ヘビ）。毎回戻すので確率不変 =====
export type Ball = { fish: number } | { snake: true };
export const BAG: readonly Ball[] = [
  { fish: 1 },
  { fish: 1 },
  { fish: 2 },
  { fish: 2 },
  { fish: 3 },
  { snake: true },
];
export function drawBall(rng: Rng): Ball {
  return BAG[rng.int(0, BAG.length - 1)];
}
export function isSnake(b: Ball): b is { snake: true } {
  return 'snake' in b;
}

// ===== 生存トラック人数別初期値（食料/水） =====
const SUPPLY_TABLE: Record<number, [number, number]> = {
  3: [5, 6],
  4: [7, 8],
  5: [8, 10],
  6: [10, 12],
  7: [12, 14],
  8: [13, 16],
  9: [15, 18],
  10: [16, 20],
  11: [18, 22],
  12: [20, 24],
};
export function initialSupplies(n: number): { food: number; water: number } {
  const key = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n));
  const [food, water] = SUPPLY_TABLE[key];
  return { food, water };
}

// ===== 天候デッキ（12枚：ハリケーン1＋降水量0×2,1×3,2×3,3×3）=====
// ハリケーン＋ランダム5を下半分に重ねる → 7〜12ラウンドで出現
export function buildWeatherDeck(rng: Rng): WeatherCard[] {
  const precips = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]; // 11枚
  const others: WeatherCard[] = precips.map((p) => ({ precip: p, hurricane: false }));
  const shuffled = rng.shuffle(others);
  const bottomOthers = shuffled.slice(0, 5);
  const topOthers = shuffled.slice(5); // 6枚
  const hurricane: WeatherCard = { precip: 0, hurricane: true };
  const bottom = rng.shuffle([...bottomOthers, hurricane]); // 6枚（ハリケーン含む）
  const top = rng.shuffle(topOthers); // 6枚
  return [...top, ...bottom]; // index0 = 最初に公開
}

// ===== 漂着物デッキ（54枚）=====
const DECK_COMPOSITION: Record<CardKind, number> = {
  water_bottle: 6,
  dirty_water: 3,
  sandwich: 6,
  sardine_can: 3,
  rotten_fish: 3,
  fruit_basket: 2,
  serum: 3,
  voodoo: 2,
  sleeping_pills: 3,
  alarm_clock: 2,
  canteen: 2,
  fishing_rod: 2,
  axe: 2,
  crystal_ball: 2,
  gun: 2,
  bullet: 3,
  junk: 8,
};

export function buildWreckageDeck(rng: Rng, startSeq: number): { deck: Array<{ id: string; kind: CardKind }>; nextSeq: number } {
  const cards: Array<{ id: string; kind: CardKind }> = [];
  let seq = startSeq;
  for (const kind of Object.keys(DECK_COMPOSITION) as CardKind[]) {
    for (let i = 0; i < DECK_COMPOSITION[kind]; i++) cards.push({ id: `c${seq++}`, kind });
  }
  return { deck: rng.shuffle(cards), nextSeq: seq };
}

export function cardsDealtPerPlayer(n: number): number {
  return n <= 8 ? 4 : 3;
}

// ===== カード分類・情報 =====
export const PERMANENT_KINDS: ReadonlySet<CardKind> = new Set<CardKind>([
  'canteen',
  'fishing_rod',
  'axe',
  'crystal_ball',
  'gun',
]);
export const RESOURCE_KINDS: ReadonlySet<CardKind> = new Set<CardKind>([
  'water_bottle',
  'dirty_water',
  'sandwich',
  'sardine_can',
  'rotten_fish',
  'fruit_basket',
]);

export const CARD_INFO: Record<CardKind, { icon: string; name: string; desc: string; cat: 'resource' | 'single' | 'permanent' | 'junk' }> = {
  water_bottle: { icon: '💧', name: '水ボトル', desc: '水+1', cat: 'resource' },
  dirty_water: { icon: '🥤', name: '汚れた水', desc: '水+1だが病気1ターン', cat: 'resource' },
  sandwich: { icon: '🥪', name: 'サンドイッチ', desc: '食料+1', cat: 'resource' },
  sardine_can: { icon: '🥫', name: 'イワシ缶', desc: '食料+3', cat: 'resource' },
  rotten_fish: { icon: '🐟', name: '腐った魚', desc: '食料+1だが病気1ターン', cat: 'resource' },
  fruit_basket: { icon: '🧺', name: 'フルーツバスケット', desc: '不足時に誰も死なず両カウンターを0に（脱出補給は不可）', cat: 'resource' },
  serum: { icon: '💉', name: '血清', desc: 'ヘビ毒を治す（その木集めの木は失う）', cat: 'single' },
  voodoo: { icon: '🪆', name: 'ブードゥー人形', desc: 'ターン開始時に死者1人を蘇生', cat: 'single' },
  sleeping_pills: { icon: '💊', name: '睡眠薬', desc: '異なる3人から各1枚ランダムに奪う', cat: 'single' },
  alarm_clock: { icon: '⏰', name: '目覚まし時計', desc: '次の親を選ぶ', cat: 'single' },
  canteen: { icon: '🚰', name: '水筒', desc: '水汲み×2（永続）', cat: 'permanent' },
  fishing_rod: { icon: '🎣', name: '釣り竿', desc: '魚×2（永続）', cat: 'permanent' },
  axe: { icon: '🪓', name: '斧', desc: '木集め+1（永続）', cat: 'permanent' },
  crystal_ball: { icon: '🔮', name: '水晶玉', desc: '各投票で最後に投票（永続）', cat: 'permanent' },
  gun: { icon: '🔫', name: '銃', desc: '弾があれば他者を排除（永続・脱落でも回収）', cat: 'permanent' },
  bullet: { icon: '🔩', name: '弾', desc: '銃と併用・使用後失う', cat: 'permanent' },
  junk: { icon: '🗑️', name: '無用品', desc: '効果なし（ブラフ用）', cat: 'junk' },
};

// ===== CPU 性格・難易度のチューニング =====
export const PERSONA_INFO: Record<string, { label: string; desc: string }> = {
  cooperative: { label: '協力的', desc: '不足を素直に補う' },
  hoarder: { label: '溜め込み屋', desc: 'カードを抱え込む' },
  sniper: { label: '狙撃手', desc: '裕福な相手を狙う/銃を使う' },
  coward: { label: '臆病者', desc: '自衛し群れに同調' },
};
export const BOT_PERSONAS = ['cooperative', 'hoarder', 'sniper', 'coward'] as const;

/** 難易度→木プッシュのリスク・自己中度・投票の賢さ */
export function difficultyParams(d: Difficulty): { risk: number; selfish: number; voteSmart: number } {
  switch (d) {
    case 'easy':
      return { risk: 0.2, selfish: 0.2, voteSmart: 0.3 };
    case 'hard':
      return { risk: 0.7, selfish: 0.8, voteSmart: 0.9 };
    default:
      return { risk: 0.45, selfish: 0.5, voteSmart: 0.6 };
  }
}

/** CPUの「考え中」待ち時間レンジ(ms) */
export function thinkDelayRange(speed: GameConfig['speed']): [number, number] {
  switch (speed) {
    case 'slow':
      return [1200, 2400];
    case 'fast':
      return [250, 600];
    default:
      return [800, 1800];
  }
}
