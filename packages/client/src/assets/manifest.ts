// アセット・マニフェスト（単一の真実）。
// 将来 ./cards/<key>.png を置くと、その水彩絵が SVG アイコンより自動で優先される
// （Catan の「あれば実画像 / 無ければフォールバック」方式）。
// 現状 ./cards にPNGは無いので CARD_ART は空 → すべて icons.tsx の SVG にフォールバックする（404 も出ない）。
//
// 追加方法: packages/client/src/assets/cards/<key>.png を置くだけ（key は CardKind か
// 'fish' / 'water' / 'wood' / 'search' / 'ship' / 'snake' などのグリフ名）。Vite が import.meta.glob で自動検出する。
const pngs = import.meta.glob('./cards/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const CARD_ART: Record<string, string> = {};
for (const [path, url] of Object.entries(pngs)) {
  const key = path.split('/').pop()!.replace(/\.png$/, '');
  CARD_ART[key] = url;
}
