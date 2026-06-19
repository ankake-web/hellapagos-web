import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LeaderboardEntry } from '@hellapagos/shared';

/**
 * 名前単位の通算戦績をサーバ側で集計し、JSON ファイルへ永続化する簡易リーダーボード。
 * 注: 名前は詐称可能なため、本格運用では認証付きIDに置き換える前提（MVPの割り切り）。
 *
 * 永続化の前提：本番では LEADERBOARD_DIR（または書込可能な ../data）を**永続ディスク**にマウントすること。
 * 揮発ディスク（Render無料/Fly無マウント）では再デプロイ毎にリセットされる。DEPLOY.md 参照。
 */

// 永続ディスクのマウント先を環境変数で差し替え可能にする（デプロイ先のボリュームを指す）。
const DATA_DIR = process.env.LEADERBOARD_DIR
  ? resolve(process.env.LEADERBOARD_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../data');
const FILE = resolve(DATA_DIR, 'leaderboard.json');
const TMP = resolve(DATA_DIR, 'leaderboard.json.tmp');

const table = new Map<string, LeaderboardEntry>();
let writeTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;

function load(): void {
  try {
    if (!existsSync(FILE)) return;
    const raw = readFileSync(FILE, 'utf8');
    const arr = JSON.parse(raw) as LeaderboardEntry[];
    for (const e of arr) table.set(e.name, e);
  } catch (err) {
    console.error('[leaderboard] load failed:', err);
  }
}

/** tmp へ書いてから rename することで、書込み中クラッシュでも本体が壊れない（アトミック置換）。 */
function writeNow(): void {
  if (!dirty) return;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(TMP, JSON.stringify([...table.values()]), 'utf8');
    renameSync(TMP, FILE);
    dirty = false;
  } catch (err) {
    console.error('[leaderboard] write failed:', err);
  }
}

function scheduleWrite(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = undefined;
    writeNow();
  }, 500);
}

/** プロセス終了時（SIGTERM/SIGINT）に未書込みを即時フラッシュする。グレースフルシャットダウンから呼ぶ。 */
export function flushNow(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = undefined;
  }
  writeNow();
}

export function recordResult(name: string, outcome: { escaped: boolean; won: boolean }): void {
  const key = name.trim() || '名無し';
  const entry = table.get(key) ?? { name: key, games: 0, escapes: 0, wins: 0 };
  entry.games += 1;
  if (outcome.escaped) entry.escapes += 1;
  if (outcome.won) entry.wins += 1;
  table.set(key, entry);
  dirty = true;
  scheduleWrite();
}

export function topEntries(limit = 20): LeaderboardEntry[] {
  return [...table.values()]
    .sort((a, b) => b.wins - a.wins || b.escapes - a.escapes || b.games - a.games)
    .slice(0, limit);
}

load();
