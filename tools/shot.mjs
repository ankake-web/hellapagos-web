// スマホUIのスクショ取得。サーバ(dist配信)を起動して: BASE=http://localhost:8790 node tools/shot.mjs [label]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8790';
const LABEL = process.argv[2] ?? 'cur';
const OUT = `/tmp/shot-${LABEL}`;
mkdirSync(OUT, { recursive: true });
const w = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));

await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.home-card', { timeout: 30000 });
await w(600);
await p.screenshot({ path: `${OUT}/1-home.png` });
console.log('home ✓');

// ひとりで今すぐ遊ぶ → 盤面
await p.getByRole('button', { name: /ひとりで今すぐ遊ぶ/ }).click();
await p.waitForSelector('.board', { timeout: 15000 });
await w(2500);
await p.screenshot({ path: `${OUT}/2-board.png` });
console.log('board ✓');

// 自分の手番（行動パネル）を捉える試み
for (let i = 0; i < 40; i++) {
  if (await p.locator('.panel.yourturn').count()) break;
  await w(700);
}
await w(400);
await p.screenshot({ path: `${OUT}/3-action.png` });
console.log('action ✓');

// もう少し進めて別フェイズ
await w(4000);
await p.screenshot({ path: `${OUT}/4-later.png` });
console.log('later ✓');

await b.close();
console.log('done →', OUT);
