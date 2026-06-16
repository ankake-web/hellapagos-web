import type { GameConfig, ItemKind, WeatherType } from './types.js';

export const DEFAULT_CONFIG: GameConfig = {
  raftWoodPerSeat: 2,
  voyageProvisionPerSeat: 1,
  initialStormIn: 6,
  soleSurvivor: false,
  seed: 1,
};

/** 魚釣りで得られる食料の範囲 [min, max] */
export const FISH_RANGE: readonly [number, number] = [1, 3];

/** 木材集めで得られる木材（MVPはリスクなしで固定 +2） */
export const WOOD_PER_ACTION = 2;

/** 難破船の探索で隠し財産に加わる資源量 [min, max] */
export const SEARCH_RANGE: readonly [number, number] = [1, 2];

/** 天候ごとの水汲み量 [min, max] */
export const WATER_YIELD: Record<WeatherType, readonly [number, number]> = {
  sunny: [1, 2],
  rain: [2, 4],
  storm: [0, 1],
};

/** 各日の天候が雨になる確率（最終日は必ず嵐） */
export const RAIN_PROB = 0.4;

/** 難破船の探索で「資源」ではなく「特殊アイテム」が出る確率 */
export const ITEM_DRAW_PROB = 0.4;

/** アイテム抽選の重み（合計に対する相対確率） */
export const ITEM_WEIGHTS: Record<ItemKind, number> = {
  antidote: 5,
  rod: 4,
  filter: 4,
  axe: 4,
  pills: 3,
  voodoo: 2,
  gun: 2,
};

export const ITEM_INFO: Record<ItemKind, { icon: string; name: string; desc: string }> = {
  gun: { icon: '🔫', name: '拳銃', desc: '生存者1人を即座に射殺し所持品を奪う（1回）' },
  pills: { icon: '💊', name: '睡眠薬', desc: 'この追放投票で自分を対象外にする（1回）' },
  antidote: { icon: '💉', name: '解毒剤', desc: 'ヘビの毒（病気）を治す（1回）' },
  voodoo: { icon: '🪆', name: 'ブードゥー人形', desc: '死者1人を蘇らせる（1回）' },
  axe: { icon: '🪓', name: '斧', desc: '木材集めの収量+1（永続）' },
  rod: { icon: '🎣', name: '釣り竿', desc: '魚釣りの収量+1（永続）' },
  filter: { icon: '🧪', name: '浄水器', desc: '水汲みの収量+1（永続）' },
};

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;

export function raftCapacity(wood: number, config: GameConfig): number {
  return Math.floor(wood / config.raftWoodPerSeat);
}
