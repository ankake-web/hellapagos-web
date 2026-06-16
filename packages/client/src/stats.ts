// プレイヤーの通算戦績を localStorage に保存する（サーバ不要のローカル戦績）。

export interface Stats {
  games: number;
  escapes: number;
  wins: number;
}

const KEY = 'hellapagos.stats';
const EMPTY: Stats = { games: 0, escapes: 0, wins: 0 };

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Stats) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

export function recordResult(outcome: { escaped: boolean; won: boolean }): Stats {
  const next = loadStats();
  next.games += 1;
  if (outcome.escaped) next.escapes += 1;
  if (outcome.won) next.wins += 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
  return next;
}
