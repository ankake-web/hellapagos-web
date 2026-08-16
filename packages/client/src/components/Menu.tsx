import { useState } from 'react';
import { playSound } from '../sound.js';
import { UiIcon } from '../assets/icons.js';
import { Rules } from './Rules.js';
import { Leaderboard } from './Leaderboard.js';
import { ConfirmModal } from './Confirm.js';

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
        <UiIcon name="menu" size={22} />
      </button>

      {open && (
        <>
          <div className="menu-scrim" onClick={close} />
          <div className="menu-panel" role="menu">
            <button className="menu-item" onClick={() => { close(); setShowRules(true); }}><UiIcon name="book" size={18} />遊び方</button>
            <button className="menu-item" onClick={() => { close(); setShowRanking(true); }}><UiIcon name="trophy" size={18} />ランキング</button>
            <button className="menu-item danger" onClick={() => { close(); setConfirm(true); }}><UiIcon name="home" size={18} />トップに戻る</button>
          </div>
        </>
      )}

      {showRules && <Rules onClose={() => setShowRules(false)} />}
      {showRanking && <Leaderboard onClose={() => setShowRanking(false)} />}

      {confirm && (
        <ConfirmModal
          title="トップに戻りますか？"
          danger={midGame}
          lead={
            midGame
              ? 'ゲームを抜けると、あなたの席はAIが引き継いで進行します。同じ部屋へは戻れません。'
              : 'この部屋から退出してトップ画面に戻ります。'
          }
          lines={midGame ? [{ label: 'この対戦', value: '離脱（戻れません）', tone: 'danger' }] : undefined}
          confirmLabel="トップに戻る"
          cancelLabel="キャンセル"
          onCancel={() => setConfirm(false)}
          onConfirm={() => { setConfirm(false); onLeave(); }}
        />
      )}
    </>
  );
}
