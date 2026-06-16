import { useEffect, useRef, useState } from 'react';
import type { ActionType, ChatMessage, Item, PublicGameState, PublicPlayer } from '@hellapagos/shared';
import { ITEM_INFO, itemNeedsTarget, PERMANENT_ITEMS, PERSONA_INFO } from '@hellapagos/shared';
import { api } from '../api.js';
import { playSound } from '../sound.js';

interface Props {
  view: PublicGameState;
  chat: ChatMessage[];
  onSay: (text: string) => void;
  onLeave: () => void;
}

interface Targeting {
  item: Item;
}

const WEATHER_LABEL: Record<string, string> = { sunny: '☀️ 晴れ', rain: '🌧️ 雨', storm: '🌀 嵐' };
const ACTION_LABEL: Record<ActionType, string> = {
  fish: '🎣 魚を釣る',
  water: '💧 水を汲む',
  wood: '🪵 木材を集める',
  search: '🔍 難破船を漁る',
};
const KIND_CLASS: Record<string, string> = {
  good: 'good',
  bad: 'bad',
  death: 'death',
  escape: 'escape',
  info: 'info',
};

export function Board({ view, chat, onSay, onLeave }: Props) {
  const me = view.players.find((p) => p.isYou);
  const alive = view.players.filter((p) => p.alive && !p.escaped);
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [tab, setTab] = useState<'log' | 'chat'>('log');

  // フェイズが変わったらターゲット選択を解除
  useEffect(() => {
    setTargeting(null);
  }, [view.phase, view.day]);

  const isTargetable = (p: PublicPlayer): boolean => {
    if (!targeting) return false;
    if (targeting.item.kind === 'gun') return p.alive && !p.escaped && !p.isYou;
    if (targeting.item.kind === 'voodoo') return !p.alive && !p.escaped;
    return false;
  };

  const pickTarget = (p: PublicPlayer) => {
    if (!targeting || !isTargetable(p)) return;
    api.playItem(targeting.item.id, p.id);
    setTargeting(null);
  };

  return (
    <div className="board">
      <Header view={view} />
      <EventBanner view={view} />
      <DaySplash view={view} />
      {targeting && (
        <div className="banner target">
          {ITEM_INFO[targeting.item.kind].icon} 対象を選んでください
          <button className="btn ghost small" onClick={() => setTargeting(null)}>
            キャンセル
          </button>
        </div>
      )}
      <div className="board-main">
        <div className="board-left">
          <Tracks view={view} />
          <PlayerGrid view={view} targetable={isTargetable} onPick={pickTarget} />
          {me && me.alive && !me.escaped && view.phase !== 'gameover' && (
            <ItemsBar view={view} me={me} onStartTarget={(item) => setTargeting({ item })} />
          )}
          <PhasePanel view={view} me={me} alive={alive} />
        </div>
        <div className={`board-right tab-${tab}`}>
          <div className="right-tabs">
            <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
              記録
            </button>
            <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
              チャット
            </button>
          </div>
          <LogPanel view={view} />
          <Chat view={view} chat={chat} onSay={onSay} />
        </div>
      </div>
      {view.phase === 'gameover' && <GameOver view={view} me={me} onLeave={onLeave} />}
    </div>
  );
}

/** 日付が変わったときに大きく日数と天候を一瞬表示する演出。 */
function DaySplash({ view }: { view: PublicGameState }) {
  const [show, setShow] = useState(false);
  const dayRef = useRef(0);
  useEffect(() => {
    if (view.phase === 'lobby' || view.phase === 'gameover') return;
    if (view.day === dayRef.current) return;
    dayRef.current = view.day;
    setShow(true);
    const id = window.setTimeout(() => setShow(false), 1100);
    return () => window.clearTimeout(id);
  }, [view.day, view.phase]);
  if (!show || view.phase === 'gameover') return null;
  return (
    <div className="day-splash">
      <div className="day-splash-inner">
        <span className="ds-day">{view.day}日目</span>
        <span className="ds-weather">{WEATHER_LABEL[view.weather ?? 'sunny']}</span>
        {view.isFinalDay && <span className="ds-storm">嵐！最後のチャンス</span>}
      </div>
    </div>
  );
}

function Header({ view }: { view: PublicGameState }) {
  const left = useCountdown(view.deadlineAt);
  return (
    <header className="header">
      <div className="header-left">
        <span className="day">{view.day}日目</span>
        <span className="weather">{WEATHER_LABEL[view.weather ?? 'sunny']}</span>
        <span className={`storm ${view.isFinalDay ? 'urgent' : ''}`}>
          {view.isFinalDay ? '嵐到来！本日が最終日' : `嵐まであと ${view.stormIn} 日`}
        </span>
      </div>
      <div className="header-right">
        {view.isSpectator && <span className="tag spectate">観戦中</span>}
        <span className="phase-name">{phaseLabel(view.phase)}</span>
        {left !== null && <span className="timer">⏱ {left}s</span>}
      </div>
    </header>
  );
}

function Tracks({ view }: { view: PublicGameState }) {
  const need = view.need;
  return (
    <div className="tracks">
      <Track icon="🐟" label="食料" value={view.food} need={need} />
      <Track icon="💧" label="水" value={view.water} need={need} />
      <Track icon="🪵" label="木材" value={view.wood} />
      <div className="track raft">
        <div className="track-head">
          <span>🛶 いかだの席</span>
          <strong className={view.raftCapacity >= need ? 'ok' : 'short'}>
            {view.raftCapacity} / {need}
          </strong>
        </div>
        <div className="hint-sm">木材{view.config.raftWoodPerSeat}で1席</div>
      </div>
    </div>
  );
}

function Track({
  icon,
  label,
  value,
  need,
}: {
  icon: string;
  label: string;
  value: number;
  need?: number;
}) {
  const short = need !== undefined && value < need;
  return (
    <div className="track">
      <div className="track-head">
        <span>
          {icon} {label}
        </span>
        <strong key={value} className={`num-pop ${need === undefined ? '' : short ? 'short' : 'ok'}`}>
          {value}
          {need !== undefined && ` / ${need}`}
        </strong>
      </div>
    </div>
  );
}

function PlayerGrid({
  view,
  targetable,
  onPick,
}: {
  view: PublicGameState;
  targetable: (p: PublicPlayer) => boolean;
  onPick: (p: PublicPlayer) => void;
}) {
  return (
    <div className="players">
      {view.players.map((p) => (
        <PlayerCard
          key={p.id}
          p={p}
          view={view}
          targetable={targetable(p)}
          onPick={() => onPick(p)}
        />
      ))}
    </div>
  );
}

function PlayerCard({
  p,
  view,
  targetable,
  onPick,
}: {
  p: PublicPlayer;
  view: PublicGameState;
  targetable: boolean;
  onPick: () => void;
}) {
  const dead = !p.alive && !p.escaped;
  const acted =
    (view.phase === 'action' && p.hasActed) ||
    (view.phase === 'survival' && p.hasContributed) ||
    (view.phase === 'vote' && p.hasVoted) ||
    (view.phase === 'escape' && p.hasEscapeVoted);

  return (
    <div
      className={`pcard ${dead ? 'dead' : ''} ${p.escaped ? 'escaped' : ''} ${
        targetable ? 'targetable' : ''
      }`}
      onClick={targetable ? onPick : undefined}
    >
      <div className="pcard-top">
        <span className="pname">
          {p.isBot ? '🤖' : '🧍'} {p.name}
        </span>
        {p.id === view.hostId && <span className="tag host">主</span>}
        {p.isYou && <span className="tag you">自</span>}
      </div>
      <div className="pcard-status">
        {p.escaped && <span className="badge escape">脱出🛶</span>}
        {dead && <span className="badge death">死亡💀</span>}
        {p.sick && p.alive && <span className="badge sick">病気🐍</span>}
        {p.voteImmune && p.alive && <span className="badge immune">💊免</span>}
        {!dead && !p.escaped && acted && <span className="badge done">✓</span>}
        {!dead && !p.escaped && !acted && view.phase !== 'gameover' && (
          <span className="badge wait">…</span>
        )}
      </div>
      <div className="pcard-foot">
        {p.isYou && p.hand ? (
          <span className="stash">隠し: 🐟{p.hand.food} 💧{p.hand.water}</span>
        ) : (
          <span className="stash">隠し: {p.handCount}個</span>
        )}
        <span className="stash">道具: {p.itemCount}個</span>
        {(view.phase === 'vote' || view.phase === 'escape' || view.phase === 'gameover') &&
          p.contributedFood !== undefined && (
            <span className="contrib">供出 🐟{p.contributedFood} 💧{p.contributedWater}</span>
          )}
        {p.votesReceived !== undefined && p.votesReceived > 0 && (
          <span className="votes">{p.votesReceived}票</span>
        )}
      </div>
    </div>
  );
}

function ItemsBar({
  view,
  me,
  onStartTarget,
}: {
  view: PublicGameState;
  me: PublicPlayer;
  onStartTarget: (item: Item) => void;
}) {
  const items = me.items ?? [];
  if (items.length === 0) return null;
  const phase = view.phase;
  const hasDead = view.players.some((p) => !p.alive && !p.escaped);

  const enabled = (item: Item): boolean => {
    switch (item.kind) {
      case 'antidote':
        return !!me.sick;
      case 'pills':
        return phase === 'action' || phase === 'survival' || phase === 'vote';
      case 'gun':
        return phase === 'action' || phase === 'vote';
      case 'voodoo':
        return phase === 'action' && hasDead;
      default:
        return false;
    }
  };

  const onUse = (item: Item) => {
    if (PERMANENT_ITEMS.has(item.kind)) return;
    playSound('click');
    if (itemNeedsTarget(item.kind)) onStartTarget(item);
    else api.playItem(item.id);
  };

  return (
    <div className="items-bar">
      <span className="items-label">所持アイテム</span>
      {items.map((item) => {
        const info = ITEM_INFO[item.kind];
        const passive = PERMANENT_ITEMS.has(item.kind);
        if (passive) {
          return (
            <span key={item.id} className="item-chip passive" title={info.desc}>
              {info.icon} {info.name}
            </span>
          );
        }
        return (
          <button
            key={item.id}
            className="btn item-chip"
            disabled={!enabled(item)}
            title={info.desc}
            onClick={() => onUse(item)}
          >
            {info.icon} {info.name}
          </button>
        );
      })}
    </div>
  );
}

function PhasePanel({
  view,
  me,
  alive,
}: {
  view: PublicGameState;
  me?: PublicPlayer;
  alive: PublicPlayer[];
}) {
  if (view.isSpectator) {
    return <div className="panel spectate">👀 観戦中。生存者たちの選択を見守りましょう。</div>;
  }
  if (!me || (!me.alive && !me.escaped)) {
    return <div className="panel spectate">あなたは脱落しました。結末を見届けましょう…</div>;
  }
  if (me.escaped) {
    return <div className="panel spectate">あなたは脱出しました！残りの結末を見守りましょう。</div>;
  }

  switch (view.phase) {
    case 'action':
      return <ActionPanel me={me} alive={alive} />;
    case 'survival':
      return <SurvivalPanel view={view} me={me} alive={alive} />;
    case 'vote':
      return <VotePanel view={view} me={me} alive={alive} />;
    case 'escape':
      return <EscapePanel view={view} me={me} alive={alive} />;
    default:
      return null;
  }
}

function waiting(alive: PublicPlayer[], done: (p: PublicPlayer) => boolean) {
  const d = alive.filter(done).length;
  return `${d} / ${alive.length} 提出済み`;
}

function ActionPanel({ me, alive }: { me: PublicPlayer; alive: PublicPlayer[] }) {
  if (me.sick) {
    return <div className="panel">🐍 ヘビの毒で動けません。今日は休みます（解毒剤があれば使えます）。</div>;
  }
  if (me.hasActed) {
    return (
      <div className="panel">
        <p>選択しました：{me.pendingAction ? ACTION_LABEL[me.pendingAction] : ''}</p>
        <p className="hint">{waiting(alive, (p) => p.hasActed)}…全員の行動を待っています。</p>
      </div>
    );
  }
  return (
    <div className="panel">
      <h3>今日の行動を選ぶ</h3>
      <div className="action-grid">
        {(Object.keys(ACTION_LABEL) as ActionType[]).map((a) => (
          <button
            key={a}
            className="btn action"
            onClick={() => {
              playSound(a);
              api.choose(a);
            }}
          >
            {ACTION_LABEL[a]}
          </button>
        ))}
      </div>
    </div>
  );
}

function SurvivalPanel({
  view,
  me,
  alive,
}: {
  view: PublicGameState;
  me: PublicPlayer;
  alive: PublicPlayer[];
}) {
  const hasStash = !!me.hand && me.hand.food + me.hand.water > 0;
  const foodShort = Math.max(0, view.need - view.food);
  const waterShort = Math.max(0, view.need - view.water);
  const [food, setFood] = useState(Math.min(me.hand?.food ?? 0, foodShort));
  const [water, setWater] = useState(Math.min(me.hand?.water ?? 0, waterShort));

  if (!hasStash || me.hasContributed) {
    return (
      <div className="panel">
        <h3>生存判定</h3>
        <p>
          生存者 {view.need} 人に対し、共有プールは 🐟{view.food} ・ 💧{view.water}。
        </p>
        <p className="hint">
          {me.hasContributed ? '供出を決定しました。' : '供出できる備蓄はありません。'}{' '}
          {waiting(alive, (p) => p.hasContributed)}
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>生存判定 — 備蓄を供出しますか？</h3>
      <p>
        生存者 {view.need} 人に対し共有プールは 🐟{view.food} ・ 💧{view.water}。
        {(foodShort > 0 || waterShort > 0) && (
          <strong className="short">
            {' '}
            このままでは {Math.max(foodShort, waterShort)} 人分不足→投票で追放！
          </strong>
        )}
      </p>
      <div className="contrib-row">
        <label>
          🐟 食料を供出: {food} / {me.hand?.food}
          <input
            type="range"
            min={0}
            max={me.hand?.food ?? 0}
            value={food}
            onChange={(e) => setFood(Number(e.target.value))}
          />
        </label>
        <label>
          💧 水を供出: {water} / {me.hand?.water}
          <input
            type="range"
            min={0}
            max={me.hand?.water ?? 0}
            value={water}
            onChange={(e) => setWater(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="panel-actions">
        <button className="btn ghost" onClick={() => api.contribute(0, 0)}>
          何も出さない（隠す）
        </button>
        <button className="btn primary" onClick={() => api.contribute(food, water)}>
          この量を供出する
        </button>
      </div>
    </div>
  );
}

function VotePanel({
  view,
  me,
  alive,
}: {
  view: PublicGameState;
  me: PublicPlayer;
  alive: PublicPlayer[];
}) {
  if (me.hasVoted) {
    return (
      <div className="panel">
        <h3>投票中…</h3>
        <p className="hint">投票しました。{waiting(alive, (p) => p.hasVoted)}</p>
      </div>
    );
  }
  const targets = alive.filter((p) => p.id !== me.id);
  return (
    <div className="panel danger">
      <h3>追放投票 — {view.shortage}人を島から追い出す</h3>
      <p className="hint">供出が少ない者ほど疑われる。誰を犠牲にする？（拳銃・睡眠薬もここで使える）</p>
      <div className="vote-grid">
        {targets.map((p) => (
          <button
            key={p.id}
            className="btn vote"
            onClick={() => {
              playSound('click');
              api.vote(p.id);
            }}
          >
            {p.name}
            {p.voteImmune && ' 💊'}
            <span className="sub">
              供出 🐟{p.contributedFood ?? 0}/💧{p.contributedWater ?? 0}・隠し{p.handCount}
            </span>
          </button>
        ))}
        <button className="btn ghost" onClick={() => api.vote(null)}>
          棄権する
        </button>
      </div>
    </div>
  );
}

function EscapePanel({
  view,
  me,
  alive,
}: {
  view: PublicGameState;
  me: PublicPlayer;
  alive: PublicPlayer[];
}) {
  if (me.hasEscapeVoted) {
    return (
      <div className="panel">
        <h3>出航の投票中…</h3>
        <p className="hint">
          あなたは「{me.escapeVote ? '出航' : '残る'}」に投票。{waiting(alive, (p) => p.hasEscapeVoted)}
        </p>
      </div>
    );
  }
  return (
    <div className="panel escape">
      <h3>脱出のチャンス！</h3>
      <p>
        いかだの席 {view.raftCapacity}（生存 {view.need}人）。航海用の備蓄も十分。今、出航する？
      </p>
      <div className="panel-actions">
        <button className="btn ghost" onClick={() => api.escapeVote(false)}>
          まだ島に残る
        </button>
        <button className="btn primary" onClick={() => api.escapeVote(true)}>
          🛶 出航する！
        </button>
      </div>
    </div>
  );
}

function LogPanel({ view }: { view: PublicGameState }) {
  const entries = [...view.log].reverse();
  return (
    <div className="log">
      <h3>記録</h3>
      <ul>
        {entries.map((e) => (
          <li key={e.id} className={KIND_CLASS[e.kind ?? 'info']}>
            <span className="log-day">D{e.day}</span> {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chat({
  view,
  chat,
  onSay,
}: {
  view: PublicGameState;
  chat: ChatMessage[];
  onSay: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSay(t);
    setText('');
  };

  return (
    <div className="chat">
      <h3>議論チャット</h3>
      <div className="chat-list" ref={listRef}>
        {chat.length === 0 && <p className="hint">まだ発言はありません。なすり付け合いを始めよう。</p>}
        {chat.map((m) => (
          <div key={m.id} className={`chat-msg ${m.isSpectator ? 'spec' : ''}`}>
            <span className="chat-name">
              {m.isSpectator ? '👀' : ''}
              {m.name}
            </span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          value={text}
          maxLength={200}
          placeholder={view.isSpectator ? '観戦者として発言' : 'メッセージ…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn small" onClick={send}>
          送信
        </button>
      </div>
    </div>
  );
}

/** 死亡・脱出・嵐などの重要イベントを一時的に大きく表示する演出。 */
function EventBanner({ view }: { view: PublicGameState }) {
  const notable = [...view.log]
    .reverse()
    .find((e) => e.kind === 'death' || e.kind === 'escape' || e.text.includes('嵐が来た'));
  const [shown, setShown] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notable) return;
    if (notable.id === shown) return;
    setShown(notable.id);
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 2800);
    return () => window.clearTimeout(id);
  }, [notable?.id, shown]);

  if (!notable || !visible) return null;
  return <div className={`event-banner ${notable.kind ?? 'info'}`}>{notable.text}</div>;
}

function GameOver({
  view,
  me,
  onLeave,
}: {
  view: PublicGameState;
  me?: PublicPlayer;
  onLeave: () => void;
}) {
  const escaped = view.players.filter((p) => p.escaped);
  const dead = view.players.filter((p) => !p.alive && !p.escaped);
  const sole = view.config.soleSurvivor;
  const youWon = sole ? !!me?.escaped && escaped.length === 1 : !!me?.escaped;

  const headline = sole
    ? escaped.length === 1
      ? `🏝️ 単独生存：${escaped[0].name}`
      : escaped.length > 0
        ? '⚓ 脱出者はいたが、単独生存者なし'
        : '💀 全滅'
    : escaped.length > 0
      ? '🛶 脱出完了'
      : '💀 全滅';

  const verdict = !me
    ? null
    : youWon
      ? sole
        ? '単独生存、あなたの勝利！'
        : 'あなたは生き延びた！'
      : me.escaped
        ? '脱出したが、独り占めはできなかった…'
        : 'あなたは島に消えた…';

  const line = (p: PublicPlayer, icon: string) => (
    <li key={p.id}>
      {icon} {p.name}
      {p.persona && <span className="reveal">（{PERSONA_INFO[p.persona].label}）</span>}
    </li>
  );

  return (
    <div className="overlay">
      <div className="result">
        <h2>{headline}</h2>
        {sole && <span className="tag spectate">ソロサバイバル</span>}
        {!view.isSpectator && verdict && (
          <p className={`verdict ${youWon ? 'win' : 'lose'}`}>{verdict}</p>
        )}
        {view.isSpectator && <p className="verdict">観戦お疲れさまでした。</p>}
        <div className="result-cols">
          <div>
            <h4>脱出した生存者（{escaped.length}）</h4>
            <ul>
              {escaped.map((p) => line(p, '🛶'))}
              {escaped.length === 0 && <li className="hint">なし</li>}
            </ul>
          </div>
          <div>
            <h4>島に消えた者（{dead.length}）</h4>
            <ul>
              {dead.map((p) => line(p, '💀'))}
              {dead.length === 0 && <li className="hint">なし</li>}
            </ul>
          </div>
        </div>
        <p className="hint">（カッコ内はAIの正体＝性格の答え合わせ）</p>
        <button className="btn primary" onClick={onLeave}>
          新しいゲームへ
        </button>
      </div>
    </div>
  );
}

// ===== ヘルパー =====

function phaseLabel(phase: string): string {
  return (
    {
      action: '行動フェイズ',
      survival: '生存フェイズ',
      vote: '追放投票',
      escape: '脱出フェイズ',
      gameover: '結末',
    }[phase] ?? phase
  );
}

function useCountdown(deadlineAt?: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [deadlineAt]);
  if (!deadlineAt) return null;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}
