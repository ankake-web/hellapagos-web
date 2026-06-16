import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LeaderboardEntry } from '@hellapagos/shared';

/**
 * 名前単位の通算戦績をサーバ側で集計し、JSON ファイルへ永続化する簡易リーダーボード。
 * 注: 名前は詐称可能なため、本格運用では認証付きIDに置き換える前提（MVPの割り切り）。
 */

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
const FILE = resolve(DATA_DIR, 'leaderboard.json');

const table = new Map<string, LeaderboardEntry>();
let writeTimer: ReturnType<typeof setTimeout> | undefined;

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

function scheduleWrite(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = undefined;
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify([...table.values()]), 'utf8');
    } catch (err) {
      console.error('[leaderboard] write failed:', err);
    }
  }, 500);
}

export function recordResult(name: string, outcome: { escaped: boolean; won: boolean }): void {
  const key = name.trim() || '名無し';
  const entry = table.get(key) ?? { name: key, games: 0, escapes: 0, wins: 0 };
  entry.games += 1;
  if (outcome.escaped) entry.escapes += 1;
  if (outcome.won) entry.wins += 1;
  table.set(key, entry);
  scheduleWrite();
}

export function topEntries(limit = 20): LeaderboardEntry[] {
  return [...table.values()]
    .sort((a, b) => b.wins - a.wins || b.escapes - a.escapes || b.games - a.games)
    .slice(0, limit);
}

load();
