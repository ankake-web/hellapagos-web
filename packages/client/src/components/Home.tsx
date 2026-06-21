import { useState } from 'react';
import { NAME_POOL } from '@hellapagos/shared';
import type { Stats } from '../stats.js';
import { Rules } from './Rules.js';
import { Leaderboard } from './Leaderboard.js';

function suggestName(): string {
  return NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
}

interface Props {
  onCreate: (name: string, offline: boolean) => void;
  onJoin: (roomId: string, name: string) => void;
  stats: Stats;
}

export function Home({ onCreate, onJoin, stats }: Props) {
  const urlRoom = new URLSearchParams(window.location.search).get('room') ?? '';
  const [name, setName] = useState(suggestName);
  const [roomId, setRoomId] = useState(urlRoom.replace(/\D/g, '').slice(0, 4));
  const [showRules, setShowRules] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  // URLにルームIDが付いている＝招待リンク経由なので最初からオンライン。既定はオンライン。
  const [offline, setOffline] = useState(false);
  const trimmed = name.trim();
  const room = roomId.replace(/\D/g, '');

  return (
    <div className="home">
      <div className="home-card">
        <h1>ヘルパゴス</h1>
        <p className="subtitle">無人島ニセ協力サバイバル。<br />嵐が来る前に、いかだで脱出せよ。</p>

        <div className="home-links">
          <button className="btn ghost small" onClick={() => setShowRules(true)}>
            遊び方
          </button>
          <button className="btn ghost small" onClick={() => setShowRanking(true)}>
            ランキング
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
              別名
            </button>
          </div>
        </label>

        <div className="mode-tabs" role="tablist">
          <button type="button" role="tab" className={`mode-tab ${!offline ? 'active' : ''}`} onClick={() => setOffline(false)}>
            オンライン対戦
          </button>
          <button type="button" role="tab" className={`mode-tab ${offline ? 'active' : ''}`} onClick={() => setOffline(true)}>
            オフライン（CPU）
          </button>
        </div>

        <button className="btn primary" disabled={!trimmed} onClick={() => onCreate(trimmed, offline)}>
          {offline ? 'ひとりで始める' : 'ルームを作る'}
        </button>

        {!offline && (
          <>
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
            <button className="btn" disabled={!trimmed || room.length < 4} onClick={() => onJoin(room, trimmed)}>
              ルームに参加
            </button>
          </>
        )}

        <p className="hint">
          {offline
            ? 'サーバ不要・待ち時間なし。CPUとこの端末だけで対戦します（戦績は記録されます）。'
            : '友達と遊ぶときはルームIDかURLを共有。1人でもAIボットを追加してすぐ遊べます。'}
        </p>

        {stats.games > 0 && (
          <div className="stats">
            <span>通算 {stats.games} 戦</span>
            <span>脱出 {stats.escapes}</span>
            <span>勝利 {stats.wins}</span>
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
