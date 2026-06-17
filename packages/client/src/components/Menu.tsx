import { useState } from 'react';
import { playSound } from '../sound.js';
import { Rules } from './Rules.js';
import { Leaderboard } from './Leaderboard.js';

interface Props {
  /** ゲーム中（ロビー以外）か。退出時の注意書きを出し分ける。 */
  midGame: boolean;
  onLeave: () => void;
}

/** 画面左上のハンバーガーメニュー。遊び方・ランキング・トップに戻るを提供。 */
export function Menu({ midGame, onLeave }: Props) {
  const [open, setOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        className="menu-btn"
        title="メニュー"
        aria-label="メニュー"
        onClick={() => { playSound('click'); setOpen((o) => !o); }}
      >
        ☰
      </button>

      {open && (
        <>
          <div className="menu-scrim" onClick={close} />
          <div className="menu-panel" role="menu">
            <button className="menu-item" onClick={() => { close(); setShowRules(true); }}>📖 遊び方</button>
            <button className="menu-item" onClick={() => { close(); setShowRanking(true); }}>🏆 ランキング</button>
            <button className="menu-item danger" onClick={() => { close(); setConfirm(true); }}>🏠 トップに戻る</button>
          </div>
        </>
      )}

      {showRules && <Rules onClose={() => setShowRules(false)} />}
      {showRanking && <Leaderboard onClose={() => setShowRanking(false)} />}

      {confirm && (
        <div className="overlay" onClick={() => setConfirm(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>トップに戻りますか？</h3>
            <p className="hint">
              {midGame
                ? 'ゲームを抜けると、あなたの席はAIが引き継いで進行します。同じ部屋へは戻れません。'
                : 'この部屋から退出してトップ画面に戻ります。'}
            </p>
            <div className="panel-actions">
              <button className="btn ghost" onClick={() => setConfirm(false)}>キャンセル</button>
              <button className="btn primary" onClick={() => { setConfirm(false); onLeave(); }}>トップに戻る</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
