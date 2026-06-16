import { useState } from 'react';
import type { PublicGameState } from '@hellapagos/shared';
import { MAX_PLAYERS, MIN_PLAYERS } from '@hellapagos/shared';
import { api } from '../api.js';

interface Props {
  view: PublicGameState;
  onLeave: () => void;
}

export function Lobby({ view, onLeave }: Props) {
  const isHost = view.youId === view.hostId;
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCodeOf(view)}`;

  const copy = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const canStart = view.players.length >= MIN_PLAYERS;
  const canAdd = view.players.length < MAX_PLAYERS;

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-head">
          <h2>ロビー</h2>
          <button className="btn ghost small" onClick={onLeave}>
            退出
          </button>
        </div>

        <div className="room-code">
          ルームID: <strong>{roomCodeOf(view)}</strong>
          <button className="btn ghost small" onClick={copy}>
            {copied ? 'コピーしました' : '招待URLをコピー'}
          </button>
        </div>

        <ul className="player-list">
          {view.players.map((p) => (
            <li key={p.id}>
              <span>
                {p.isBot ? '🤖' : '🧍'} {p.name}
                {p.id === view.hostId && <span className="tag host">ホスト</span>}
                {p.id === view.youId && <span className="tag you">あなた</span>}
              </span>
              {isHost && p.isBot && (
                <button className="btn ghost small" onClick={() => api.removeBot(p.id)}>
                  削除
                </button>
              )}
            </li>
          ))}
        </ul>

        <label className={`mode-row ${isHost ? '' : 'readonly'}`}>
          <input
            type="checkbox"
            checked={view.config.soleSurvivor}
            disabled={!isHost}
            onChange={(e) => api.setConfig({ soleSurvivor: e.target.checked })}
          />
          <span>
            <strong>ソロサバイバル</strong>：単独で脱出した者だけが勝者（最も殺伐）
          </span>
        </label>

        <div className="config-row">
          <label>
            CPU難易度
            <select disabled={!isHost} value={view.config.difficulty} onChange={(e) => api.setConfig({ difficulty: e.target.value as never })}>
              <option value="easy">やさしい</option>
              <option value="normal">ふつう</option>
              <option value="hard">むずかしい</option>
            </select>
          </label>
          <label>
            演出スピード
            <select disabled={!isHost} value={view.config.speed} onChange={(e) => api.setConfig({ speed: e.target.value as never })}>
              <option value="slow">ゆっくり</option>
              <option value="normal">ふつう</option>
              <option value="fast">速い</option>
            </select>
          </label>
        </div>

        <div className="lobby-actions">
          {isHost ? (
            <>
              <button className="btn" disabled={!canAdd} onClick={() => api.addBot()}>
                ＋ AIボットを追加
              </button>
              <button className="btn primary" disabled={!canStart} onClick={() => api.start()}>
                ゲーム開始（{view.players.length}人）
              </button>
              {!canStart && <p className="hint">あと{MIN_PLAYERS - view.players.length}人必要です。</p>}
            </>
          ) : (
            <p className="hint">ホストの開始を待っています…（{view.players.length}人）</p>
          )}
        </div>
      </div>
    </div>
  );
}

// 公開状態にはルームIDが直接含まれないため、招待URLは現在のURLのクエリを優先しつつ
// localStorage 経由のセッションを使う。ここでは表示用に URL/保存値から復元する。
function roomCodeOf(_view: PublicGameState): string {
  const fromUrl = new URLSearchParams(window.location.search).get('room');
  if (fromUrl) return fromUrl.toUpperCase();
  try {
    const raw = localStorage.getItem('hellapagos.session');
    if (raw) return (JSON.parse(raw) as { roomId: string }).roomId;
  } catch {
    /* ignore */
  }
  return '----';
}
