import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:5175';
const OUT = '/tmp/shotn';
mkdirSync(OUT, { recursive: true });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();

// Desktop: home → lobby (digit room id + menu) → board (+fly tokens)
const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.home-card', { timeout: 30000 });
await p.screenshot({ path: `${OUT}/home.png` });

await p.getByRole('button', { name: 'ルームを作る' }).click();
await p.waitForSelector('.lobby-card', { timeout: 10000 });
const code = await p.locator('.room-code strong').innerText().catch(() => '?');
console.log('room code shown:', JSON.stringify(code), '(digits-only:', /^\d+$/.test(code.trim()), ')');
// open hamburger menu
await p.locator('.menu-btn').click();
await w(250);
await p.screenshot({ path: `${OUT}/lobby-menu.png` });
await p.locator('.menu-scrim').click(); // close

for (let i = 0; i < 3; i++) { await p.getByRole('button', { name: /AIボットを追加/ }).click(); await w(120); }
await p.getByRole('button', { name: /ゲーム開始/ }).click();
await p.waitForSelector('.board', { timeout: 10000 });
await w(900);
await p.screenshot({ path: `${OUT}/board.png` });

// Try to act on our turn to trigger fly tokens; otherwise capture CPU activity frames.
let caught = false;
for (let t = 0; t < 24; t++) {
  const yourTurn = await p.locator('.panel.yourturn').count();
  if (yourTurn) {
    const fishBtn = p.getByRole('button', { name: /釣り/ }).first();
    if (await fishBtn.count()) {
      await fishBtn.click();
      await w(220);
      await p.screenshot({ path: `${OUT}/board-fly.png` });
      caught = true;
      break;
    }
  }
  // grab a mid-activity frame anyway
  if (t === 6) await p.screenshot({ path: `${OUT}/board-activity.png` });
  await w(500);
}
console.log('captured own-turn fly frame:', caught);

// open the in-game menu to show トップに戻る confirm
await p.locator('.menu-btn').click();
await w(200);
await p.locator('.menu-item.danger').click();
await w(250);
await p.screenshot({ path: `${OUT}/leave-confirm.png` });
await b.close();
console.log('done');
process.exit(0);
