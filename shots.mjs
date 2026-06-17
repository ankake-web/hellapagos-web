// 新UIの統合確認：ホスト＋ボット3で1ゲームを通し、要所をスクショ。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5174';
const OUT = '/tmp/shots2';
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 880 } });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const has = async (sel) => (await page.locator(sel).count()) > 0;
const clickIf = async (sel) => {
  const el = page.locator(sel).first();
  if ((await el.count()) && (await el.isVisible().catch(() => false)) && (await el.isEnabled().catch(() => false))) {
    await el.click().catch(() => {});
    return true;
  }
  return false;
};

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.home-card', { timeout: 30000 });
await shot('1-home');

await page.locator('.field input').first().fill('プレイヤー');
await page.getByRole('button', { name: 'ルームを作る' }).click();
await page.waitForSelector('.lobby-card', { timeout: 10000 });
for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: /AIボットを追加/ }).click();
  await wait(120);
}
await page.locator('.config-row select').nth(1).selectOption('fast').catch(() => {});
await wait(200);
await shot('2-lobby');

await page.getByRole('button', { name: /ゲーム開始/ }).click();
await page.waitForSelector('.board', { timeout: 10000 });

let actionShot = false, voteShot = false, drawShot = false, escapeShot = false;
for (let i = 0; i < 240; i++) {
  if (await has('.result')) break;
  if (!drawShot && (await has('.draw-pop'))) { drawShot = true; await shot('5-draw'); }
  if (!actionShot && (await has('.panel.yourturn'))) { actionShot = true; await shot('3-action'); }
  if (!voteShot && (await has('.vote-grid'))) { voteShot = true; await shot('6-vote'); }
  if (!escapeShot && (await has('.panel.escape'))) { escapeShot = true; await shot('7-escape'); }

  // 自分の操作
  if (await has('.panel.yourturn')) {
    await clickIf('.panel.yourturn .action-grid button.btn.action'); // 釣り（先頭）
  } else if (await has('.panel') && (await page.getByRole('button', { name: /確定（これで消費へ）/ }).count())) {
    await clickIf('.panel .panel-actions button.btn.primary');
  } else if (await has('.vote-grid')) {
    await clickIf('.vote-grid button.vote');
  } else if (await has('.panel.escape')) {
    await clickIf('.panel.escape .panel-actions button.btn.primary');
  }
  await wait(450);
}
await wait(600);
if (await has('.result')) await shot('8-result');
console.log('shots done ->', OUT, { actionShot, voteShot, drawShot, escapeShot });
await browser.close();
