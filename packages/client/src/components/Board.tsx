import { useEffect, useRef, useState } from 'react';
import type { ActionType, Card, CardKind, ChatMessage, PublicGameState, PublicPlayer } from '@hellapagos/shared';
import { CARD_INFO, MAX_SEATS, PERSONA_INFO, RAFT_LOOP } from '@hellapagos/shared';
import { api } from '../api.js';
import { playSound } from '../sound.js';

interface Props {
  view: PublicGameState;
  chat: ChatMessage[];
  onSay: (text: string) => void;
  onLeave: () => void;
}

const ACTION_LABEL: Record<ActionType, string> = {
  fish: '🎣 釣り',
  water: '💧 水汲み',
  wood: '🪵 木集め',
  search: '🔍 難破船',
};
const KIND_CLASS: Record<string, string> = {
  good: 'good',
  bad: 'bad',
  death: 'death',
  escape: 'escape',
  snake: 'bad',
  card: 'info',
  draw: 'info',
  info: 'info',
};

function weatherLabel(v: PublicGameState): string {
  if (v.hurricaneRevealed) return '🌀 ハリケーン';
  if (v.currentPrecip === 0) return '☀️ 晴れ（降水0）';
  if (v.currentPrecip >= 3) return '🌧️ 大雨（降水3）';
  return `🌦️ 雨（降水${v.currentPrecip}）`;
}

export function Board({ view, chat, onSay, onLeave }: Props) {
  const me = view.players.find((p) => p.isYou);
  const [targeting, setTargeting] = useState<{ card: Card; mode: 'gun' | 'voodoo' } | null>(null);
  const [tab, setTab] = useState<'log' | 'chat'>('log');

  useEffect(() => setTargeting(null), [view.phase, view.round, view.currentActorId]);

  const targetable = (p: PublicPlayer): boolean => {
    if (!targeting) return false;
    if (targeting.mode === 'gun') return p.alive && !p.escaped && !p.isYou;
    return !p.alive && !p.escaped; // voodoo
  };
  const pickTarget = (p: PublicPlayer) => {
    if (!targeting || !targetable(p)) return;
    playSound('click');
    api.playCard(targeting.card.id, p.id);
    setTargeting(null);
  };

  const weatherClass = view.hurricaneRevealed ? 'w-storm' : view.currentPrecip === 0 ? 'w-sunny' : 'w-rain';
  return (
    <div className={`board ${weatherClass}`}>
      <Header view={view} />
      <RoundSplash view={view} />
      <DrawResult view={view} />
      <EventBanner view={view} />
      {targeting && (
        <div className="banner target">
          {CARD_INFO[targeting.card.kind].icon} {targeting.mode === 'gun' ? '撃つ相手' : '蘇生する相手'}を選択
          <button className="btn ghost small" onClick={() => setTargeting(null)}>キャンセル</button>
        </div>
      )}
      <div className="board-main">
        <div className="board-left">
          <Tracks view={view} />
          <PlayerGrid view={view} targetable={targetable} onPick={pickTarget} />
          <PhasePanel view={view} me={me} />
          {me && me.alive && !me.escaped && <Hand view={view} me={me} onTarget={(card, mode) => setTargeting({ card, mode })} />}
        </div>
        <div className={`board-right tab-${tab}`}>
          <div className="right-tabs">
            <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>記録</button>
            <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>チャット</button>
          </div>
          <LogPanel view={view} />
          <Chat view={view} chat={chat} onSay={onSay} />
        </div>
      </div>
      {view.phase === 'gameover' && <GameOver view={view} me={me} onLeave={onLeave} />}
    </div>
  );
}

function Header({ view }: { view: PublicGameState }) {
  const left = useCountdown(view.deadlineAt);
  return (
    <header className="header">
      <div className="header-left">
        <span className="day">{view.round}ラウンド</span>
        <span className="weather">{weatherLabel(view)}</span>
        <span className={`storm ${view.hurricaneRevealed ? 'urgent' : ''}`}>
          {view.hurricaneRevealed ? '本ラウンドで強制脱出' : `天候カード残り ${view.weatherRemaining}`}
        </span>
      </div>
      <div className="header-right">
        {view.isSpectator && <span className="tag spectate">観戦中</span>}
        <span className="phase-name">{phaseLabel(view)}</span>
        {left !== null && <span className="timer">⏱ {left}s</span>}
      </div>
    </header>
  );
}

function Tracks({ view }: { view: PublicGameState }) {
  const need = view.seatsNeeded;
  return (
    <div className="tracks">
      <Track icon="🐟" label="食料" value={view.food} need={need} cap={view.foodCap} />
      <Track icon="💧" label="水" value={view.water} need={need} cap={view.waterCap} />
      <div className="track raft">
        <div className="track-head">
          <span>🛶 座席</span>
          <strong className={view.raftSeats >= need ? 'ok' : 'short'}>{view.raftSeats} / {need}</strong>
        </div>
        <div className="raft-bar" title={`木 ${view.raftProgress}/${RAFT_LOOP}`}>
          {Array.from({ length: RAFT_LOOP }).map((_, i) => (
            <span key={i} className={`plank ${i < view.raftProgress ? 'on' : ''}`} />
          ))}
        </div>
        <div className="hint-sm">木{RAFT_LOOP}で座席+1（最大{MAX_SEATS}）</div>
      </div>
    </div>
  );
}
function Track({ icon, label, value, need, cap }: { icon: string; label: string; value: number; need: number; cap: number }) {
  const short = value < need;
  return (
    <div className="track">
      <div className="track-head">
        <span>{icon} {label}</span>
        <strong key={value} className={`num-pop ${short ? 'short' : 'ok'}`}>{value}<small> / 必要{need}</small></strong>
      </div>
      <div className="hint-sm">上限{cap}</div>
    </div>
  );
}

function PlayerGrid({ view, targetable, onPick }: { view: PublicGameState; targetable: (p: PublicPlayer) => boolean; onPick: (p: PublicPlayer) => void }) {
  return (
    <div className="players">
      {view.players.map((p) => (
        <PlayerCard key={p.id} p={p} view={view} targetable={targetable(p)} onPick={() => onPick(p)} />
      ))}
    </div>
  );
}
function PlayerCard({ p, view, targetable, onPick }: { p: PublicPlayer; view: PublicGameState; targetable: boolean; onPick: () => void }) {
  const dead = !p.alive && !p.escaped;
  const isActor = view.currentActorId === p.id;
  return (
    <div className={`pcard ${dead ? 'dead' : ''} ${p.escaped ? 'escaped' : ''} ${isActor ? 'actor' : ''} ${targetable ? 'targetable' : ''}`} onClick={targetable ? onPick : undefined}>
      <div className="pcard-top">
        <span className="pname">{p.isBot ? '🤖' : '🧍'} {p.name}</span>
        {p.id === view.hostId && <span className="tag host">主</span>}
        {p.isYou && <span className="tag you">自</span>}
      </div>
      <div className="pcard-status">
        {p.escaped && <span className="badge escape">脱出🛶</span>}
        {dead && <span className="badge death">死亡💀</span>}
        {p.sick && p.alive && <span className="badge sick">病気🐍</span>}
        {p.resting && p.alive && <span className="badge sick">休み💤</span>}
        {!dead && !p.escaped && isActor && view.phase === 'action' && <span className="badge actor">手番</span>}
        {!dead && !p.escaped && p.acted && view.phase === 'action' && <span className="badge done">✓</span>}
      </div>
      <div className="pcard-foot">
        <span className="stash">手札 {p.handCount}</span>
        {p.permanents.length > 0 && <span className="perms">{p.permanents.map((k) => CARD_INFO[k as CardKind].icon).join('')}</span>}
        {view.phase === 'vote' && p.votesReceived ? <span className="votes">{p.votesReceived}票</span> : null}
      </div>
    </div>
  );
}

function PhasePanel({ view, me }: { view: PublicGameState; me?: PublicPlayer }) {
  if (view.isSpectator) return <div className="panel spectate">👀 観戦中。生存者たちの選択を見守りましょう。</div>;
  if (!me || (!me.alive && !me.escaped)) return <div className="panel spectate">あなたは脱落しました。結末を見届けましょう…</div>;
  if (me.escaped) return <div className="panel spectate">あなたは脱出しました！</div>;

  switch (view.phase) {
    case 'action':
      return <ActionPanel view={view} me={me} />;
    case 'survival':
      return <SurvivalPanel view={view} me={me} />;
    case 'vote':
      return <VotePanel view={view} me={me} />;
    case 'escape':
      return <EscapePanel view={view} me={me} />;
    default:
      return null;
  }
}

function ActionPanel({ view, me }: { view: PublicGameState; me: PublicPlayer }) {
  const [wood, setWood] = useState(0);
  if (me.resting) return <div className="panel">💤 ヘビの毒で今ラウンドは動けません。</div>;
  if (!view.isYourTurn) {
    const actor = view.players.find((p) => p.id === view.currentActorId);
    return <div className="panel"><h3>行動フェイズ</h3><p className="hint">{actor ? `${actor.name} の手番です…` : '進行中…'}</p></div>;
  }
  return (
    <div className="panel yourturn">
      <h3>あなたの番です — 行動を選ぶ</h3>
      <div className="action-grid">
        <button className="btn action" onClick={() => { playSound('fish'); api.choose('fish'); }}>{ACTION_LABEL.fish}<span className="sub">袋から1玉（魚 or ヘビ）</span></button>
        <button className="btn action" disabled={view.currentPrecip === 0} onClick={() => { playSound('water'); api.choose('water'); }}>{ACTION_LABEL.water}<span className="sub">{view.currentPrecip === 0 ? '今日は雨なし' : `水+${view.currentPrecip}`}</span></button>
        <button className="btn action" onClick={() => { playSound('search'); api.choose('search'); }}>{ACTION_LABEL.search}<span className="sub">カードを1枚引く</span></button>
        <div className="btn action wood-action">
          {ACTION_LABEL.wood}
          <span className="sub">+1（斧で+2）＋追加引き</span>
          <div className="wood-push">
            <label>追加 {wood}個 <input type="range" min={0} max={5} value={wood} onChange={(e) => setWood(Number(e.target.value))} /></label>
            <button className="btn primary small" onClick={() => { playSound('wood'); api.choose('wood', wood); }}>木を集める{wood > 0 ? `（+${wood}）` : ''}</button>
          </div>
        </div>
      </div>
      <p className="hint">追加引きは黒玉(ヘビ)が出ると病気＝次ラウンド休み。リスクと相談。</p>
    </div>
  );
}

function SurvivalPanel({ view, me }: { view: PublicGameState; me: PublicPlayer }) {
  if (me.acted) return <div className="panel"><h3>生存チェック</h3><p className="hint">確定済み。他のプレイヤーを待っています…</p></div>;
  const waterShort = Math.max(0, view.seatsNeeded - view.water);
  const foodShort = Math.max(0, view.seatsNeeded - view.food);
  return (
    <div className="panel">
      <h3>生存チェック — 水→食料の順に消費</h3>
      <p>生存者{view.seatsNeeded}人。水{view.water}・食料{view.food}。
        {(waterShort > 0 || foodShort > 0) && <strong className="short"> 不足分は投票で犠牲が出ます。資源カードがあれば下から出せます。</strong>}</p>
      <div className="panel-actions">
        <button className="btn primary" onClick={() => { playSound('click'); api.survivalPass(); }}>確定（これで消費へ）</button>
      </div>
    </div>
  );
}

function VotePanel({ view, me }: { view: PublicGameState; me: PublicPlayer }) {
  const reason = view.voteReason === 'water' ? '水不足' : view.voteReason === 'food' ? '食料不足' : 'ハリケーン';
  if (me.sick) return <div className="panel danger"><h3>追放投票（{reason}）</h3><p className="hint">あなたは病気のため投票できません（対象にはなります）。</p></div>;
  if (me.vote !== undefined) return <div className="panel danger"><h3>追放投票（{reason}）</h3><p className="hint">投票しました。集計を待っています…</p></div>;
  const targets = view.players.filter((p) => p.alive && !p.escaped && p.id !== me.id);
  return (
    <div className="panel danger">
      <h3>追放投票（{reason}）— 残り{view.pendingEliminations}人</h3>
      <p className="hint">誰を犠牲にする？（手札の資源カードで自分は自動的に救われます）</p>
      <div className="vote-grid">
        {targets.map((p) => (
          <button key={p.id} className="btn vote" onClick={() => { playSound('click'); api.vote(p.id); }}>{p.name}<span className="sub">手札{p.handCount}{p.sick ? '・病気' : ''}</span></button>
        ))}
        <button className="btn ghost" onClick={() => { playSound('click'); api.vote(null); }}>棄権</button>
      </div>
    </div>
  );
}

function EscapePanel({ view }: { view: PublicGameState; me: PublicPlayer }) {
  return (
    <div className="panel escape">
      <h3>脱出のチャンス！</h3>
      <p>座席{view.raftSeats}（生存{view.seatsNeeded}人）・航海の水食料も十分。今、出航する？</p>
      <div className="panel-actions">
        <button className="btn ghost" onClick={() => { playSound('click'); api.escapeVote(false); }}>まだ残る</button>
        <button className="btn primary" onClick={() => { playSound('escape'); api.escapeVote(true); }}>🛶 出航する！</button>
      </div>
    </div>
  );
}

function Hand({ view, me, onTarget }: { view: PublicGameState; me: PublicPlayer; onTarget: (card: Card, mode: 'gun' | 'voodoo') => void }) {
  const hand = me.hand ?? [];
  if (hand.length === 0) return null;
  const phase = view.phase;

  const playable = (c: Card): boolean => {
    const k = c.kind;
    if (me.sick && k !== 'serum') return false;
    if (CARD_INFO[k].cat === 'resource') return phase === 'survival' || phase === 'action' || phase === 'vote';
    if (k === 'serum') return me.sick;
    if (k === 'voodoo' || k === 'sleeping_pills' || k === 'alarm_clock') return phase === 'action' && view.isYourTurn;
    if (k === 'gun') return hand.some((x) => x.kind === 'bullet') && (phase === 'action' || phase === 'vote');
    return false;
  };
  const onUse = (c: Card) => {
    const k = c.kind;
    playSound('click');
    if (k === 'gun') return onTarget(c, 'gun');
    if (k === 'voodoo') return onTarget(c, 'voodoo');
    api.playCard(c.id);
  };

  return (
    <div className="hand">
      <span className="hand-label">手札</span>
      <div className="hand-cards">
        {hand.map((c) => {
          const info = CARD_INFO[c.kind];
          const can = playable(c);
          return (
            <button key={c.id} className={`card-chip cat-${info.cat}`} disabled={!can} title={info.desc} onClick={() => can && onUse(c)}>
              <span className="card-ic">{info.icon}</span>
              <span className="card-nm">{info.name}</span>
            </button>
          );
        })}
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
          <li key={e.id} className={KIND_CLASS[e.kind ?? 'info']}><span className="log-day">R{e.round}</span> {e.text}</li>
        ))}
      </ul>
    </div>
  );
}

function Chat({ view, chat, onSay }: { view: PublicGameState; chat: ChatMessage[]; onSay: (t: string) => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [chat.length]);
  const send = () => { const t = text.trim(); if (!t) return; onSay(t); setText(''); };
  return (
    <div className="chat">
      <h3>議論チャット</h3>
      <div className="chat-list" ref={ref}>
        {chat.length === 0 && <p className="hint">まだ発言はありません。</p>}
        {chat.map((m) => (
          <div key={m.id} className={`chat-msg ${m.isSpectator ? 'spec' : ''}`}><span className="chat-name">{m.isSpectator ? '👀' : ''}{m.name}</span><span className="chat-text">{m.text}</span></div>
        ))}
      </div>
      <div className="chat-input">
        <input value={text} maxLength={200} placeholder={view.isSpectator ? '観戦者として発言' : 'メッセージ…'} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn small" onClick={send}>送信</button>
      </div>
    </div>
  );
}

function RoundSplash({ view }: { view: PublicGameState }) {
  const [show, setShow] = useState(false);
  const ref = useRef(0);
  useEffect(() => {
    if (view.phase === 'lobby' || view.phase === 'gameover') return;
    if (view.round === ref.current) return;
    ref.current = view.round;
    setShow(true);
    const id = window.setTimeout(() => setShow(false), 1100);
    return () => window.clearTimeout(id);
  }, [view.round, view.phase]);
  if (!show) return null;
  return (
    <div className="day-splash">
      <div className="day-splash-inner">
        <span className="ds-day">{view.round}ラウンド</span>
        <span className="ds-weather">{weatherLabel(view)}</span>
        {view.hurricaneRevealed && <span className="ds-storm">ハリケーン！</span>}
      </div>
    </div>
  );
}

/** 袋から引いた玉の演出（魚の数 / 黒玉=ヘビ） */
function DrawResult({ view }: { view: PublicGameState }) {
  const d = view.lastDraw;
  const newest = view.log.length ? view.log[view.log.length - 1].id : -1;
  const sig = d ? `${d.playerId}|${d.action}|${d.balls.length}|${newest}` : '';
  const [shown, setShown] = useState('');
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!d || !d.balls.length || sig === shown) return;
    setShown(sig);
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 1500);
    return () => window.clearTimeout(id);
  }, [sig, shown, d]);
  if (!d || !visible || !d.balls.length) return null;
  const who = view.players.find((p) => p.id === d.playerId)?.name ?? '';
  return (
    <div className="draw-pop">
      <span className="draw-who">{who} の{d.action === 'fish' ? '釣り' : '木集め'}</span>
      <div className="balls">
        {d.balls.map((b, i) => (
          <span key={i} className={`ball ${'snake' in b ? 'snake' : ''}`} style={{ animationDelay: `${i * 0.12}s` }}>
            {'snake' in b ? '🐍' : (b as { fish: number }).fish}
          </span>
        ))}
      </div>
    </div>
  );
}

function EventBanner({ view }: { view: PublicGameState }) {
  const notable = [...view.log].reverse().find((e) => e.kind === 'death' || e.kind === 'escape' || e.text.includes('ハリケーン'));
  const [shown, setShown] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!notable || notable.id === shown) return;
    setShown(notable.id);
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(id);
  }, [notable?.id, shown]);
  if (!notable || !visible) return null;
  return <div className={`event-banner ${notable.kind ?? 'info'}`}>{notable.text}</div>;
}

function GameOver({ view, me, onLeave }: { view: PublicGameState; me?: PublicPlayer; onLeave: () => void }) {
  const escaped = view.players.filter((p) => p.escaped);
  const dead = view.players.filter((p) => !p.alive && !p.escaped);
  const sole = view.config.soleSurvivor;
  const youWon = sole ? !!me?.escaped && escaped.length === 1 : !!me?.escaped;
  const headline = sole
    ? escaped.length === 1 ? `🏝️ 単独生存：${escaped[0].name}` : escaped.length > 0 ? '⚓ 脱出者あり（単独生存なし）' : '💀 全滅'
    : escaped.length > 0 ? '🛶 脱出成功' : '💀 全滅';
  const verdict = !me ? null : youWon ? (sole ? '単独生存、あなたの勝利！' : 'あなたは生き延びた！') : me.escaped ? '脱出したが独り占めできず…' : 'あなたは島に消えた…';
  const line = (p: PublicPlayer, icon: string) => (
    <li key={p.id}>{icon} {p.name}{p.persona && <span className="reveal">（{PERSONA_INFO[p.persona].label}）</span>}</li>
  );
  return (
    <div className="overlay">
      <div className="result">
        <h2>{headline}</h2>
        {sole && <span className="tag spectate">ソロサバイバル</span>}
        {!view.isSpectator && verdict && <p className={`verdict ${youWon ? 'win' : 'lose'}`}>{verdict}</p>}
        {view.isSpectator && <p className="verdict">観戦お疲れさまでした。</p>}
        <div className="result-cols">
          <div><h4>脱出（{escaped.length}）</h4><ul>{escaped.map((p) => line(p, '🛶'))}{escaped.length === 0 && <li className="hint">なし</li>}</ul></div>
          <div><h4>島に消えた（{dead.length}）</h4><ul>{dead.map((p) => line(p, '💀'))}{dead.length === 0 && <li className="hint">なし</li>}</ul></div>
        </div>
        <p className="hint">（カッコ内はAIの正体＝性格）</p>
        <button className="btn primary" onClick={onLeave}>新しいゲームへ</button>
      </div>
    </div>
  );
}

function phaseLabel(v: PublicGameState): string {
  const m: Record<string, string> = { lobby: 'ロビー', weather: '天候', action: '行動', survival: '生存チェック', vote: '追放投票', escape: '脱出', gameover: '結末' };
  return m[v.phase] ?? v.phase;
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
