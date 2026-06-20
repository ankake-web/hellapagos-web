// プレイヤーの通算戦績を localStorage に保存する（サーバ不要のローカル戦績）。

export interface Stats {
  games: number;
  escapes: number;
  wins: number;
  soleWins: number; // ソロサバイバルでの単独勝利
  streak: number; // 現在の連続脱出数
  bestStreak: number; // 最高連続脱出数
}

const KEY = 'hellapagos.stats';
const ID_KEY = 'hellapagos.pid';
const EMPTY: Stats = { games: 0, escapes: 0, wins: 0, soleWins: 0, streak: 0, bestStreak: 0 };

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Stats>) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

export function recordResult(outcome: { escaped: boolean; won: boolean; sole?: boolean }): Stats {
  const next = loadStats();
  next.games += 1;
  if (outcome.escaped) {
    next.escapes += 1;
    next.streak += 1;
    next.bestStreak = Math.max(next.bestStreak, next.streak);
  } else {
    next.streak = 0;
  }
  if (outcome.won) next.wins += 1;
  if (outcome.won && outcome.sole) next.soleWins += 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
  return next;
}

/** 匿名の永続プレイヤーID（将来のID基準ランキング／名前詐称対策の土台）。 */
export function getPlayerId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() ?? `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

export interface Badge {
  icon: string;
  label: string;
  desc: string;
}

/** 戦績から獲得済みの実績バッジを導出する（定着の核＝積み上げの可視化）。 */
export function earnedBadges(s: Stats): Badge[] {
  const all: Array<Badge & { ok: boolean }> = [
    { icon: '🌅', label: '初脱出', desc: '初めて島から脱出した', ok: s.escapes >= 1 },
    { icon: '🏝️', label: '単独生存', desc: 'ソロサバイバルで単独勝利', ok: s.soleWins >= 1 },
    { icon: '🔥', label: '連続脱出3', desc: '3戦連続で脱出した', ok: s.bestStreak >= 3 },
    { icon: '🛶', label: '常連の漂流者', desc: '通算10戦をプレイ', ok: s.games >= 10 },
    { icon: '👑', label: '5勝の英雄', desc: '通算5勝を達成', ok: s.wins >= 5 },
    { icon: '🎯', label: 'ベテラン生還者', desc: '通算20回脱出', ok: s.escapes >= 20 },
  ];
  return all.filter((b) => b.ok).map(({ ok: _ok, ...b }) => b);
}
