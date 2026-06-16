import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5174';
const OUT = '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function phaseName(page) {
  const el = page.locator('.phase-name');
  return (await el.count()) ? (await el.first().innerText().catch(() => '')) : '';
}

async function step(page) {
  if (await page.locator('.result').count()) return 'over';
  const tryClick = async (sel) => {
    const el = page.locator(sel).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      return true;
    }
    return false;
  };
  if (await tryClick('.action-grid .btn.action')) return 'acted';
  if (await tryClick('.panel .panel-actions .btn.primary')) return 'contrib';
  if (await tryClick('.vote-grid .btn.vote')) return 'voted';
  if (await tryClick('.panel.escape .btn.primary')) return 'escaped';
  return 'wait';
}

async function run(label, viewport) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const shot = (name) => page.screenshot({ path: `${OUT}/${label}-${name}.png`, fullPage: false });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(400);
  await shot('1-home');

  // ルール
  await page.getByRole('button', { name: /遊び方/ }).click();
  await wait(300);
  await shot('2-rules');
  await page.getByRole('button', { name: /わかった|閉じる/ }).first().click();
  await wait(200);

  // ルーム作成
  await page.locator('.field input').first().fill('プレイヤー');
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  await page.waitForSelector('.lobby-card', { timeout: 5000 });
  await wait(300);

  // ボット追加
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /AIボットを追加/ }).click();
    await wait(150);
  }
  await shot('3-lobby');

  // 開始
  await page.getByRole('button', { name: /ゲーム開始/ }).click();
  await page.waitForSelector('.board', { timeout: 5000 });
  await wait(700);
  await shot('4-board-action');

  // 何ラウンドか進めて、投票・結果も撮る
  let captured = { vote: false };
  for (let i = 0; i < 60; i++) {
    const ph = await phaseName(page);
    if (ph.includes('投票') && !captured.vote) {
      captured.vote = true;
      await wait(250);
      await shot('5-board-vote');
    }
    const r = await step(page);
    if (r === 'over') break;
    await wait(280);
  }
  await wait(400);
  if (await page.locator('.result').count()) await shot('6-result');

  await browser.close();
  console.log(`[${label}] done`);
}

await run('pc', { width: 1280, height: 820 });
await run('mobile', { width: 390, height: 844 });
console.log('ALL DONE ->', OUT);
