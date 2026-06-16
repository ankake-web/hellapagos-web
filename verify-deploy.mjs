// デプロイ済みの公開URLを総合検証する。
// 使い方: node verify-deploy.mjs https://<your-app>.onrender.com
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? process.env.URL ?? '').replace(/\/+$/, '');
if (!BASE) {
  console.error('使い方: node verify-deploy.mjs https://<your-app>.onrender.com');
  process.exit(2);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, pass, info = '') => {
  results.push({ name, pass, info });
  console.log(`${pass ? '✓' : '✗'} ${name}${info ? '  ' + info : ''}`);
};

// 1) /health（無料プランのコールドスタートを考慮し最大150秒リトライ）
async function checkHealth() {
  const deadline = Date.now() + 150_000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(20_000) });
      last = `HTTP ${r.status}`;
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j.ok) return ok('/health が {ok:true}', true, last);
      }
    } catch (e) {
      last = String(e.name || e);
    }
    await wait(4000);
  }
  ok('/health 応答', false, '起動待ちタイムアウト ' + last);
}

async function checkStatic() {
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(30_000) });
    const html = await r.text();
    ok('トップHTML配信', html.includes('ヘルパゴス'), `HTTP ${r.status}`);
  } catch (e) {
    ok('トップHTML配信', false, String(e));
  }
}

async function leaderboardCount() {
  try {
    const r = await fetch(`${BASE}/leaderboard`, { signal: AbortSignal.timeout(20_000) });
    const arr = await r.json();
    return Array.isArray(arr) ? arr.reduce((s, e) => s + (e.games || 0), 0) : -1;
  } catch {
    return -1;
  }
}

async function step(page) {
  if (await page.locator('.result').count()) return 'over';
  const click = async (sel) => {
    const el = page.locator(sel).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      return true;
    }
    return false;
  };
  if (await click('.action-grid .btn.action')) return 'acted';
  if (await click('.panel .panel-actions .btn.primary')) return 'contrib';
  if (await click('.vote-grid .btn.vote')) return 'voted';
  if (await click('.panel.escape .btn.primary')) return 'escaped';
  return 'wait';
}

async function checkGameE2E() {
  const lbBefore = await leaderboardCount();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('.home-card', { timeout: 30_000 });
    ok('クライアント起動（React描画）', true);

    await page.locator('.field input').first().fill('検証ユーザー');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await page.waitForSelector('.lobby-card', { timeout: 15_000 });
    ok('WebSocket疎通：ルーム作成', true);

    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /AIボットを追加/ }).click();
      await wait(200);
    }
    await page.getByRole('button', { name: /ゲーム開始/ }).click();
    await page.waitForSelector('.board', { timeout: 15_000 });
    ok('ゲーム開始（盤面表示）', true);

    let over = false;
    for (let i = 0; i < 80; i++) {
      if ((await step(page)) === 'over') {
        over = true;
        break;
      }
      await wait(260);
    }
    ok('ゲーム終了まで進行', over);
    await page.screenshot({ path: '/tmp/deploy-verify.png' });
  } catch (e) {
    ok('ゲームE2E', false, String(e));
  } finally {
    await browser.close();
  }

  await wait(1500);
  const lbAfter = await leaderboardCount();
  ok('リーダーボード記録', lbAfter > lbBefore && lbBefore >= 0, `${lbBefore} → ${lbAfter}`);
}

console.log(`\n=== デプロイ検証: ${BASE} ===\n`);
await checkHealth();
await checkStatic();
await checkGameE2E();

const failed = results.filter((r) => !r.pass);
console.log(`\n=== 結果: ${results.length - failed.length}/${results.length} OK ===`);
console.log('スクショ: /tmp/deploy-verify.png');
process.exit(failed.length ? 1 : 0);
