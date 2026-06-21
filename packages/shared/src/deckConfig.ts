import type { CardKind } from './types.js';

// =====================================================================
// 漂着物デッキの「復元値」を1か所に集約する。
// 重要: 本作のカード枚数・効果数値はメーカー非公開（公式ルールブックは例示のみ）。
// 以下はすべて妥当な復元値。Tabletop Simulator 版 MOD 等で実数が判明したら、ここだけ差し替える。
// =====================================================================

/** デッキ枚数（合計 DECK_TOTAL=54）。 */
export const DECK_COMPOSITION: Record<CardKind, number> = {
  // --- 資源 (20) ---
  water_bottle: 5, // reconstructed: 公式未公開・要差し替え
  coconut: 2, // reconstructed: 公式未公開・要差し替え
  sandwich: 5, // reconstructed: 公式未公開・要差し替え
  sardine_can: 2, // reconstructed: 公式未公開・要差し替え
  dirty_water: 2, // reconstructed: 公式未公開・要差し替え
  rotten_fish: 2, // reconstructed: 公式未公開・要差し替え
  fruit_basket: 2, // reconstructed: 公式未公開・要差し替え
  // --- 単発 (15) ---
  serum: 2, // reconstructed: 公式未公開・要差し替え
  sleeping_pills: 2, // reconstructed: 公式未公開・要差し替え
  voodoo: 2, // reconstructed: 公式未公開・要差し替え
  alarm_clock: 2, // reconstructed: 公式未公開・要差し替え
  telescope: 2, // reconstructed: 公式未公開・要差し替え
  matches: 2, // reconstructed: 公式未公開・要差し替え
  cannibal_bbq: 2, // reconstructed: 公式未公開・要差し替え
  conch: 1, // reconstructed: 公式未公開・要差し替え
  // --- 永続 (10) ---
  canteen: 2, // reconstructed: 公式未公開・要差し替え
  fishing_rod: 2, // reconstructed: 公式未公開・要差し替え
  axe: 2, // reconstructed: 公式未公開・要差し替え
  crystal_ball: 1, // reconstructed: 公式未公開・要差し替え
  club: 1, // reconstructed: 公式未公開・要差し替え
  gun: 2, // reconstructed: 公式未公開・要差し替え
  // --- 併用 (5) ---
  bullet: 3, // reconstructed: 公式未公開・要差し替え
  tin_sheet: 2, // reconstructed: 公式未公開・要差し替え
  // --- ブラフ (4) ---
  junk: 4, // reconstructed: 公式未公開・要差し替え
};

/** デッキ総枚数（テストでアサート）。 */
export const DECK_TOTAL = 54; // reconstructed: 公式未公開・要差し替え

// ===== 効果数値（復元値）=====
export const COCONUT_WATER = 3; // reconstructed: 公式未公開・要差し替え（ココナッツの水量）
export const SARDINE_FOOD = 3; // reconstructed: 公式未公開・要差し替え（イワシ缶の食料量）
export const CANNIBAL_FOOD_PER_BODY = 2; // reconstructed: 公式未公開・要差し替え（人肉BBQ：脱落者1人あたり食料）
export const CLUB_VOTE_WEIGHT = 2; // reconstructed: 公式未公開・要差し替え（棍棒装備時の票の重み）
