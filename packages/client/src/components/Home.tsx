import { useState, type FormEvent } from 'react';
import { NAME_POOL } from '@hellapagos/shared';
import type { Stats } from '../stats.js';
import { Rules } from './Rules.js';
import { Leaderboard } from './Leaderboard.js';
import { HeroArt, UiIcon } from '../assets/icons.js';

function suggestName(): string {
  return NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
}

type Mode = 'solo' | 'create' | 'join';

const MODES: { id: Mode; label: string; submit: string }[] = [
  { id: 'solo', label: 'ひとりで遊ぶ', submit: 'ひとりで始める' },
  { id: 'create', label: '部屋を作る', submit: '部屋を作成' },
  { id: 'join', label: '部屋に入る', submit: 'この部屋に参加' },
];

interface Props {
  onCreate: (name: string, offline: boolean) => Promise<void>;
  onJoin: (roomId: string, name: string) => Promise<void>;
  stats: Stats;
  error: string | null;
}

export function Home({ onCreate, onJoin, stats, error }: Props) {
  const urlRoom = (new URLSearchParams(window.location.search).get('room') ?? '').replace(/\D/g, '').slice(0, 4);
  const [name, setName] = useState(suggestName);
  const [roomId, setRoomId] = useState(urlRoom);
  const [mode, setMode] = useState<Mode>(urlRoom ? 'join' : 'solo');
  const [pending, setPending] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const trimmed = name.trim();
  const ready = Boolean(trimmed && (mode !== 'join' || roomId.length === 4));
  const current = MODES.find((item) => item.id === mode)!;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    try {
      if (mode === 'join') await onJoin(roomId, trimmed);
      else await onCreate(trimmed, mode === 'solo');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="home">
      <div className="island-entry">
        <section className="island-cover" aria-labelledby="game-title">
          <HeroArt className="cover-image" />
          <div className="cover-copy">
            <h1 id="game-title">ヘルパゴス</h1>
            <p>嵐が来る前に、無人島を脱出せよ。</p>
          </div>
        </section>

        <section className="entry-console" aria-labelledby="entry-heading">
          <h2 id="entry-heading">遊び方を選ぶ</h2>
          <div className="entry-modes" role="group" aria-label="対戦方法">
            {MODES.map(({ id, label }) => (
              <button key={id} type="button" aria-pressed={id === mode} disabled={pending} onClick={() => setMode(id)}>
                {label}
              </button>
            ))}
          </div>

          <p className="entry-note">
            {mode === 'solo' ? 'この端末でCPUと遊ぶ。' :
              mode === 'create' ? '友だちを招待できるオンラインの部屋を開く。' :
              urlRoom ? '招待リンクから部屋番号を入力済み。' : '友だちから届いた4桁の部屋番号を入力。'}
          </p>

          <form className="entry-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="player-name">プレイヤー名</label>
              <div className="name-row">
                <input id="player-name" value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} required disabled={pending} />
                <button type="button" className="btn ghost" aria-label="名前をランダムに選ぶ" onClick={() => setName(suggestName())} disabled={pending}>別名</button>
              </div>
            </div>

            {mode === 'join' && (
              <label className="field">
                <span>部屋番号（4桁）</span>
                <input value={roomId} maxLength={4} placeholder="1234" className="roomid-input"
                  autoComplete="off" spellCheck={false} inputMode="numeric" pattern="[0-9]{4}"
                  required disabled={pending} onChange={(e) => setRoomId(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </label>
            )}

            <button type="submit" className="btn primary entry-submit" disabled={!ready || pending}>
              {pending ? '接続中…' : current.submit}
            </button>
            {pending && <p role="status" className="entry-note">部屋に接続しています。最初の接続は時間がかかることがあります。</p>}
            {error && <p role="alert" className="entry-error">{error}</p>}
          </form>

          <div className="entry-links">
            <button className="btn ghost with-ic" onClick={() => setShowRules(true)}>
              <UiIcon name="book" size={17} />ルールを見る
            </button>
            <button className="btn ghost with-ic" onClick={() => setShowRanking(true)}>
              <UiIcon name="trophy" size={17} />ランキング
            </button>
          </div>
          <p className="deck-edition">基本54＋拡張20 ／ 漂着物カード74枚</p>
          {stats.games > 0 && (
            <div className="stats">
              <span>通算 {stats.games} 戦</span>
              <span>脱出 {stats.escapes}</span>
              <span>勝利 {stats.wins}</span>
              <span>脱出率 {Math.round((stats.escapes / stats.games) * 100)}%</span>
            </div>
          )}
        </section>
      </div>
      {showRules && <Rules onClose={() => setShowRules(false)} />}
      {showRanking && <Leaderboard onClose={() => setShowRanking(false)} />}
    </main>
  );
}
