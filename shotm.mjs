import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:5175';
const OUT = '/tmp/shotm';
mkdirSync(OUT, { recursive: true });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
// iPhone-ish viewport
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.home-card', { timeout: 30000 });
await w(500);
await p.screenshot({ path: `${OUT}/m-home.png` });
// ルームID入力に文字を打ってダブりを確認
await p.locator('.field input').nth(1).click().catch(() => {});
await p.keyboard.type('abcd');
await w(300);
await p.screenshot({ path: `${OUT}/m-home-typed.png` });
// 作成してロビー（mobile）
await p.getByRole('button', { name: 'ルームを作る' }).click();
await p.waitForSelector('.lobby-card', { timeout: 10000 });
for (let i = 0; i < 3; i++) { await p.getByRole('button', { name: /AIボットを追加/ }).click(); await w(120); }
await w(300);
await p.screenshot({ path: `${OUT}/m-lobby.png` });
await p.getByRole('button', { name: /ゲーム開始/ }).click();
await p.waitForSelector('.board', { timeout: 10000 });
await w(1200);
await p.screenshot({ path: `${OUT}/m-board.png` });
await b.close();
// desktop board too (check left-shift / right margin)
const p2 = await (await chromium.launch()).newPage({ viewport: { width: 1440, height: 900 } });
await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('.home-card', { timeout: 30000 });
await p2.getByRole('button', { name: 'ルームを作る' }).click();
await p2.waitForSelector('.lobby-card', { timeout: 10000 });
for (let i = 0; i < 3; i++) { await p2.getByRole('button', { name: /AIボットを追加/ }).click(); await w(120); }
await p2.getByRole('button', { name: /ゲーム開始/ }).click();
await p2.waitForSelector('.board', { timeout: 10000 });
await w(1000);
await p2.screenshot({ path: `${OUT}/d-board.png` });
console.log('done');
process.exit(0);
