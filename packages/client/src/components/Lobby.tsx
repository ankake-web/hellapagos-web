import { useState } from 'react';
import type { PublicGameState } from '@hellapagos/shared';
import { MAX_PLAYERS, MIN_PLAYERS } from '@hellapagos/shared';
import { api } from '../api.js';
import { BotFace, botIndexOf } from '../assets/icons.js';

interface Props {
  view: PublicGameState;
  roomId: string;
  onLeave: () => void;
  offline?: boolean;
}

export function Lobby({ view, roomId, onLeave, offline }: Props) {
  const isHost = view.youId === view.hostId;
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  };

  const canStart = view.players.length >= MIN_PLAYERS;
  const canAdd = view.players.length < MAX_PLAYERS;

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-head">
          <div><p className="lobby-mode">{offline ? 'CPU対戦' : 'オンライン対戦'}</p><h2>出発の準備</h2></div>
          <button className="btn ghost small" onClick={onLeave}>
            退出
          </button>
        </div>

        {!offline && (
          <div className="room-code">
            <span>部屋番号 <strong>{roomId}</strong></span>
            <button className="btn ghost" onClick={copy}>招待リンクをコピー</button>
            {copyState === 'copied' && <p className="invite-note" role="status">リンクをコピーしました。</p>}
            {copyState === 'manual' && (
                <label className="field invite-note">
                  <span>招待リンクを選択してコピー</span>
                  <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
                </label>
              )}
            </div>
          )}

          <div className="lobby-roster">
            <h3>参加者 <span>{view.players.length} / {MAX_PLAYERS}人</span></h3>
            <p className="hint">{isHost ? '空いている席にはCPUを追加できる。' : '参加者がそろうと開始できます。'}</p>
            <ul className="player-list">
              {view.players.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.isBot && <BotFace name={p.name} index={botIndexOf(view.players, p.id)} size={22} />} {p.name}
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
          </div>

          <div className="lobby-actions">
            {isHost ? (
              <>
                <button className="btn" disabled={!canAdd} onClick={() => api.addBot()}>CPUを追加</button>
                <button className="btn primary" disabled={!canStart} onClick={() => api.start()}>
                  ゲーム開始（{view.players.length}人）
                </button>
                {!canStart && <p className="hint" role="status">あと{MIN_PLAYERS - view.players.length}人必要です。</p>}
              </>
            ) : (
              <p className="hint" role="status">ホストの開始を待っています…</p>
            )}
          </div>

          <details className="lobby-settings">
            <summary>対戦設定</summary>
          <label className={`mode-row ${isHost ? '' : 'readonly'}`}>
            <input
              type="checkbox"
              checked={view.config.soleSurvivor}
              disabled={!isHost}
              onChange={(e) => api.setConfig({ soleSurvivor: e.target.checked })}
            />
            <span>
              <strong>ソロサバイバル</strong>　単独で脱出した人だけが勝者
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
            <label>
              手番の制限時間
              <select disabled={!isHost} value={String(view.config.timeLimit)} onChange={(e) => api.setConfig({ timeLimit: Number(e.target.value) })}>
                <option value="0">なし</option>
                <option value="60">1分</option>
                <option value="120">2分</option>
                <option value="180">3分</option>
              </select>
            </label>
          </div>

        </details>
      </div>
    </div>
  );
}
