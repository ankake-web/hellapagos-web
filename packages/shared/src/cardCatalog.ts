import type { CardKind } from './types.js';

// Gigamic基本/拡張ルールとカード面を照合した1枚ごとの構成。参考画像は配信物に入れない。
export const BASE_DECK: readonly CardKind[] = [
  'coffee',
  'bullet',
  'barometer',
  'serum',
  'sardine_can',
  'coconut',
  ...Array<CardKind>(7).fill('water_bottle'),
  ...Array<CardKind>(5).fill('bullet'),
  ...Array<CardKind>(3).fill('gun'),
  'wooden_plank',
  ...Array<CardKind>(7).fill('sandwich'),
  'voodoo',
  'fishing_rod',
  'tin_sheet',
  'conch',
  'alarm_clock',
  'axe',
  'fruit_basket',
  'club',
  'canteen',
  'matches',
  'tin_sheet',
  'sleeping_pills',
  'rotten_fish',
  'food_mill',
  ...Array<CardKind>(5).fill('junk'),
  'cannibal_bbq',
  'pendulum',
  'crystal_ball',
  'telescope',
  'dirty_water',
  'flashlight',
];
export const EXPANSION_DECK: readonly CardKind[] = [
  'fish_tank',
  'instant_noodles',
  'water_bottle',
  'water_bottle',
  'sandwich',
  'wooden_crate',
  'shaman_kit',
  'diet_magazine',
  'duck_float',
  'gun',
  'whip',
  'metal_detector',
  'hollow_bullet',
  'taser',
  'rum',
  'bullet',
  'whetstone',
  'concave_plate',
  'sandwich',
  'cat',
];
export const DECK_COMPOSITION = Object.fromEntries(
  [...BASE_DECK, ...EXPANSION_DECK].map((kind) => [
    kind,
    [...BASE_DECK, ...EXPANSION_DECK].filter((k) => k === kind).length,
  ]),
) as Record<CardKind, number>;
export const BASE_DECK_TOTAL = 54;
export const DECK_TOTAL = 74;
export const JUNK_NAMES = ['トイレブラシ', '当たりくじ', '古い下着', '高級車の鍵', 'ボードゲーム'];
export const COCONUT_WATER = 3;
export const SARDINE_FOOD = 3;
export const CANNIBAL_FOOD_PER_BODY = 2;
export const CLUB_VOTE_WEIGHT = 2;
