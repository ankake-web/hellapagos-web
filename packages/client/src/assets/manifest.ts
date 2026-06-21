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

// 背景・タイトル挿絵の差し替え用。./bg/scene.* と ./bg/hero.* を置くと
// それぞれアプリ背景・ホームのヒーロー挿絵が実画像に切り替わる（無ければCSS/SVGのまま）。
const bgs = import.meta.glob('./bg/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const BG_ART: Record<string, string> = {};
for (const [path, url] of Object.entries(bgs)) {
  const key = path.split('/').pop()!.replace(/\.(png|jpe?g|webp)$/, '');
  BG_ART[key] = url;
}

// その他の挿絵（リザルトの大絵・主人公の肖像など）。./art/<key>.* を置くと使われる。
// 想定キー: you（主人公）, res-survived（自分が脱出）, res-died（自分が死亡）,
//          res-all-survived（全員脱出）, res-all-dead（全滅）。
const arts = import.meta.glob('./art/*.{png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const ART: Record<string, string> = {};
for (const [path, url] of Object.entries(arts)) {
  const key = path.split('/').pop()!.replace(/\.(png|jpe?g|webp)$/, '');
  ART[key] = url;
}
