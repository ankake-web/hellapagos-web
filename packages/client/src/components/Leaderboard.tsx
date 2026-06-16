import { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '@hellapagos/shared';
import { fetchLeaderboard } from '../api.js';

interface Props {
  onClose: () => void;
}

export function Leaderboard({ onClose }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchLeaderboard(20)
      .then((e) => active && setEntries(e))
      .catch(() => active && setError('ランキングを取得できませんでした。'));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal ranking" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🏆 ランキング</h2>
          <button className="btn ghost small" onClick={onClose}>
            閉じる
          </button>
        </div>
        <p className="hint">名前ごとの通算成績（勝利数順）。同名は合算されます。</p>

        {error && <p className="hint">{error}</p>}
        {!entries && !error && <p className="hint">読み込み中…</p>}
        {entries && entries.length === 0 && (
          <p className="hint">まだ記録がありません。1ゲーム遊ぶと登録されます。</p>
        )}

        {entries && entries.length > 0 && (
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>名前</th>
                <th>勝利</th>
                <th>脱出</th>
                <th>戦数</th>
                <th>脱出率</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.name}>
                  <td>{i + 1}</td>
                  <td>{e.name}</td>
                  <td>{e.wins}</td>
                  <td>{e.escapes}</td>
                  <td>{e.games}</td>
                  <td>{e.games > 0 ? Math.round((e.escapes / e.games) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
