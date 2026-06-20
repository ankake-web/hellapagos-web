import { useState } from 'react';
import { NAME_POOL } from '@hellapagos/shared';
import { earnedBadges, type Stats } from '../stats.js';
import { Rules } from './Rules.js';
import { Leaderboard } from './Leaderboard.js';

function suggestName(): string {
  return NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
}

interface Props {
  onCreate: (name: string) => void;
  onJoin: (roomId: string, name: string) => void;
  onQuickStart: (name: string) => void;
  stats: Stats;
}

export function Home({ onCreate, onJoin, onQuickStart, stats }: Props) {
  const urlRoom = new URLSearchParams(window.location.search).get('room') ?? '';
  const [name, setName] = useState(suggestName);
  const [roomId, setRoomId] = useState(urlRoom.replace(/\D/g, '').slice(0, 4));
  const [showRules, setShowRules] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const trimmed = name.trim();
  const room = roomId.replace(/\D/g, '');

  return (
    <div className="home">
      <div className="home-card">
        <svg className="hero" viewBox="0 0 320 130" aria-hidden>
          <defs>
            <radialGradient id="hsun" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffe7a8" />
              <stop offset="100%" stopColor="#ffb24d" />
            </radialGradient>
            <linearGradient id="hsea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1d6e84" />
              <stop offset="100%" stopColor="#0c3a47" />
            </linearGradient>
          </defs>
          <circle cx="245" cy="42" r="26" fill="url(#hsun)" opacity="0.9" />
          <rect x="0" y="78" width="320" height="52" fill="url(#hsea)" />
          <path d="M0 86 q40 -8 80 0 t80 0 t80 0 t80 0 V130 H0 Z" fill="#11505f" opacity="0.7" />
          <path d="M0 96 q40 -7 80 0 t80 0 t80 0 t80 0 V130 H0 Z" fill="#0a3a47" opacity="0.8" />
          {/* 島 */}
          <ellipse cx="120" cy="92" rx="46" ry="12" fill="#d9be84" />
          <path d="M120 92 q-3 -26 -14 -34 q18 6 14 34" fill="#3f8f5f" />
          <path d="M120 92 q3 -28 16 -33 q-20 5 -16 33" fill="#4fa06c" />
          <rect x="118" y="64" width="4" height="30" rx="2" fill="#7c4f2e" />
          {/* いかだ */}
          <g transform="translate(214 100)">
            <rect x="0" y="0" width="34" height="7" rx="2" fill="#7c4f2e" />
            <rect x="0" y="-2" width="5" height="11" rx="1.5" fill="#5e3a20" />
            <rect x="10" y="-2" width="5" height="11" rx="1.5" fill="#5e3a20" />
            <rect x="20" y="-2" width="5" height="11" rx="1.5" fill="#5e3a20" />
            <rect x="29" y="-2" width="5" height="11" rx="1.5" fill="#5e3a20" />
            <rect x="15" y="-22" width="3" height="22" fill="#9c6b3e" />
            <path d="M18 -22 L34 -12 L18 -8 Z" fill="#eae0cf" />
          </g>
        </svg>
        <h1>ヘルパゴス</h1>
        <p className="subtitle">無人島ニセ協力サバイバル。<br />嵐が来る前に、いかだで脱出せよ。</p>

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
          <div className="name-row">
            <input
              value={name}
              maxLength={16}
              placeholder="名無し"
              onChange={(e) => setName(e.target.value)}
            />
            <button type="button" className="btn ghost small" title="ランダムな名前" onClick={() => setName(suggestName())}>
              🎲
            </button>
          </div>
        </label>

        <button className="btn primary" disabled={!trimmed} onClick={() => onQuickStart(trimmed)}>
          ▶ ひとりで今すぐ遊ぶ
        </button>
        <button className="btn" disabled={!trimmed} onClick={() => onCreate(trimmed)}>
          友達とルームを作る
        </button>

        <div className="divider">または</div>

        <label className="field">
          <span>ルームID</span>
          <input
            value={roomId}
            maxLength={4}
            placeholder="1234"
            className="roomid-input"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="numeric"
            pattern="[0-9]*"
            onChange={(e) => setRoomId(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        <button
          className="btn"
          disabled={!trimmed || room.length < 4}
          onClick={() => onJoin(room, trimmed)}
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
        {(() => {
          const badges = earnedBadges(stats);
          return badges.length > 0 ? (
            <div className="badges" aria-label="獲得した実績バッジ">
              {badges.map((b) => (
                <span key={b.label} className="badge-chip" title={b.desc}>{b.icon} {b.label}</span>
              ))}
            </div>
          ) : null;
        })()}
      </div>

      {showRules && <Rules onClose={() => setShowRules(false)} />}
      {showRanking && <Leaderboard onClose={() => setShowRanking(false)} />}
    </div>
  );
}
