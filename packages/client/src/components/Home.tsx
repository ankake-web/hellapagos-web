import { useState } from 'react';
import type { Stats } from '../stats.js';
import { Rules } from './Rules.js';
import { Leaderboard } from './Leaderboard.js';

interface Props {
  onCreate: (name: string) => void;
  onJoin: (roomId: string, name: string) => void;
  stats: Stats;
}

export function Home({ onCreate, onJoin, stats }: Props) {
  const urlRoom = new URLSearchParams(window.location.search).get('room') ?? '';
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState(urlRoom.toUpperCase());
  const [showRules, setShowRules] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const trimmed = name.trim();

  return (
    <div className="home">
      <div className="home-card">
        <h1>🏝️ ヘルパゴス</h1>
        <p className="subtitle">無人島ニセ協力サバイバル。嵐が来る前に、いかだで脱出せよ。</p>

        <div className="home-links">
          <button className="btn ghost small" onClick={() => setShowRules(true)}>
            📖 遊び方
          </button>
          <button className="btn ghost small" onClick={() => setShowRanking(true)}>
            🏆 ランキング
          </button>
        </div>

        <label className="field">
          <span>あなたの名前</span>
          <input
            value={name}
            maxLength={16}
            placeholder="名無し"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <button className="btn primary" disabled={!trimmed} onClick={() => onCreate(trimmed)}>
          ルームを作る
        </button>

        <div className="divider">または</div>

        <label className="field">
          <span>ルームID</span>
          <input
            value={roomId}
            maxLength={4}
            placeholder="ABCD"
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          />
        </label>
        <button
          className="btn"
          disabled={!trimmed || roomId.length < 4}
          onClick={() => onJoin(roomId, trimmed)}
        >
          ルームに参加
        </button>

        <p className="hint">
          ※ 1人でもAIボットを追加してすぐ遊べます。友達と遊ぶときはルームIDかURLを共有しましょう。
        </p>

        {stats.games > 0 && (
          <div className="stats">
            <span>通算 {stats.games} 戦</span>
            <span>🛶 脱出 {stats.escapes}</span>
            <span>🏆 勝利 {stats.wins}</span>
            <span>
              脱出率 {Math.round((stats.escapes / stats.games) * 100)}%
            </span>
          </div>
        )}
      </div>

      {showRules && <Rules onClose={() => setShowRules(false)} />}
      {showRanking && <Leaderboard onClose={() => setShowRanking(false)} />}
    </div>
  );
}
