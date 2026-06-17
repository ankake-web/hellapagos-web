import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [tab, setTab] = useState<'log' | 'chat'>('log');
  const freshDraw = useFreshDraw(view);

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
      <WeatherFX view={view} />
      <RoundSplash view={view} />
      <DrawCenter view={view} draw={freshDraw} />
      <EventFX view={view} />
      <FlyLayer view={view} />
      {targeting && (
        <div className="banner target">
          {CARD_INFO[targeting.card.kind].icon} {targeting.mode === 'gun' ? '撃つ相手' : '蘇生する相手'}を選択
          <button className="btn ghost small" onClick={() => setTargeting(null)}>キャンセル</button>
        </div>
      )}
      <div className="board-main">
        <div className="board-left">
          <Tracks view={view} />
          <PlayerGrid view={view} draw={freshDraw} targetable={targetable} onPick={pickTarget} />
          <PhasePanel view={view} me={me} />
          {me && me.alive && !me.escaped && <Hand view={view} me={me} onSelect={setSelectedCard} />}
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
      {selectedCard && me && (
        <ItemModal
          view={view}
          me={me}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUse={(card, mode) => {
            setSelectedCard(null);
            if (mode) setTargeting({ card, mode });
          }}
        />
      )}
      {view.phase === 'gameover' && <GameOver view={view} me={me} onLeave={onLeave} />}
    </div>
  );
}

/** 直近の袋引き（lastDraw）を一定時間だけ「新鮮」とみなして返す。 */
function useFreshDraw(view: PublicGameState): PublicGameState['lastDraw'] | null {
  const [fresh, setFresh] = useState<PublicGameState['lastDraw'] | null>(null);
  const ref = useRef('');
  const d = view.lastDraw;
  const sig = d && d.balls.length ? `${d.playerId}|${d.balls.length}|${view.log.length}` : '';
  useEffect(() => {
    if (!d || !d.balls.length || sig === ref.current) return;
    ref.current = sig;
    setFresh(d);
    const id = window.setTimeout(() => setFresh(null), 1700);
    return () => window.clearTimeout(id);
  }, [sig]);
  return fresh;
}

/** 袋の玉。魚は数字、ヘビは🐍（木集めのみ）、釣りのハズレは灰色✗。緊張感のため1個ずつ遅延表示。 */
function Balls({ balls, action, small }: { balls: Array<{ fish: number } | { snake: true }>; action: ActionType; small?: boolean }) {
  // ヘビは最後に出す（最後にドキッ）
  const ordered = [...balls].sort((a, b) => Number('snake' in a) - Number('snake' in b));
  return (
    <div className={`balls ${small ? 'small' : ''}`}>
      {ordered.map((b, i) => {
        const snake = 'snake' in b;
        const cls = snake ? (action === 'wood' ? 'snake' : 'miss') : '';
        const label = snake ? (action === 'wood' ? '🐍' : '✗') : (b as { fish: number }).fish;
        return (
          <span key={i} className={`ball ${cls}`} style={{ animationDelay: `${i * (small ? 0.12 : 0.32)}s` }}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

/** 中央の大きな袋引き演出は「自分の番」か「ヘビが出た時」だけ（CPUの平常ドローはプレイヤーカードに小さく出す）。 */
function DrawCenter({ view, draw }: { view: PublicGameState; draw: PublicGameState['lastDraw'] | null }) {
  if (!draw || !draw.balls.length) return null;
  const isMine = draw.playerId === view.youId;
  const snake = draw.balls.some((b) => 'snake' in b) && draw.action === 'wood';
  if (!isMine && !snake) return null;
  const who = view.players.find((p) => p.id === draw.playerId)?.name ?? '';
  const fishTotal = draw.balls.reduce((n, b) => n + ('fish' in b ? b.fish : 0), 0);
  return (
    <div className="draw-pop">
      <span className="draw-who">{who} の{draw.action === 'fish' ? '釣り' : '木集め'}</span>
      <Balls balls={draw.balls} action={draw.action} />
      <span className="draw-sum">
        {snake ? '🐍 噛まれた！' : draw.action === 'fish' ? (fishTotal > 0 ? `🐟 食料 +${fishTotal}` : '不漁…') : `木 +${draw.balls.length}`}
      </span>
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
      <Track icon="🐟" label="食料" value={view.food} need={need} cap={view.foodCap} flyKey="food" />
      <Track icon="💧" label="水" value={view.water} need={need} cap={view.waterCap} flyKey="water" />
      <div className="track raft" data-fly="raft">
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
function Track({ icon, label, value, need, cap, flyKey }: { icon: string; label: string; value: number; need: number; cap: number; flyKey?: string }) {
  const short = value < need;
  return (
    <div className="track" data-fly={flyKey}>
      <div className="track-head">
        <span>{icon} {label}</span>
        <strong key={value} className={`num-pop ${short ? 'short' : 'ok'}`}>{value}<small> / 必要{need}</small></strong>
      </div>
      <div className="hint-sm">上限{cap}</div>
    </div>
  );
}

function PlayerGrid({ view, draw, targetable, onPick }: { view: PublicGameState; draw: PublicGameState['lastDraw'] | null; targetable: (p: PublicPlayer) => boolean; onPick: (p: PublicPlayer) => void }) {
  return (
    <div className="players">
      {view.players.map((p) => (
        <PlayerCard key={p.id} p={p} view={view} draw={draw} targetable={targetable(p)} onPick={() => onPick(p)} />
      ))}
    </div>
  );
}
function PlayerCard({ p, view, draw, targetable, onPick }: { p: PublicPlayer; view: PublicGameState; draw: PublicGameState['lastDraw'] | null; targetable: boolean; onPick: () => void }) {
  const dead = !p.alive && !p.escaped;
  const isActor = view.currentActorId === p.id;
  const myDraw = draw && draw.playerId === p.id ? draw : null;
  return (
    <div className={`pcard ${dead ? 'dead' : ''} ${p.escaped ? 'escaped' : ''} ${isActor ? 'actor' : ''} ${targetable ? 'targetable' : ''}`} data-pid={p.id} onClick={targetable ? onPick : undefined}>
      <div className="pcard-top">
        <span className="pname">{p.isBot ? '🤖' : '🧍'} {p.name}</span>
        {p.id === view.hostId && <span className="tag host">主</span>}
        {p.isYou && <span className="tag you">自</span>}
      </div>
      <div className="pcard-status">
        {myDraw && <Balls balls={myDraw.balls} action={myDraw.action} small />}
        {p.escaped && <span className="badge escape">脱出🛶</span>}
        {dead && <span className="badge death">死亡💀</span>}
        {p.sick && p.alive && <span className="badge sick">病気🐍</span>}
        {p.resting && p.alive && <span className="badge sick">休み💤</span>}
        {!myDraw && !dead && !p.escaped && isActor && view.phase === 'action' && <span className="badge actor">手番</span>}
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
        <button className="btn action" onClick={() => { playSound('fish'); api.choose('fish'); }}>{ACTION_LABEL.fish}<span className="sub">袋から1玉・魚1〜3（不漁あり）</span></button>
        <button className="btn action" disabled={view.currentPrecip === 0} onClick={() => { playSound('water'); api.choose('water'); }}>{ACTION_LABEL.water}<span className="sub">{view.currentPrecip === 0 ? '今日は雨なし' : `水+${view.currentPrecip}`}</span></button>
        <button className="btn action" onClick={() => { playSound('search'); api.choose('search'); }}>{ACTION_LABEL.search}<span className="sub">カードを1枚引く</span></button>
        <div className="btn action wood-action">
          {ACTION_LABEL.wood}
          <span className="sub">まず木1本（斧で2本）確定</span>
          <div className="wood-push">
            <label>さらに引く本数：{wood} 本（0〜5）<input type="range" min={0} max={5} value={wood} onChange={(e) => setWood(Number(e.target.value))} /></label>
            <button className="btn primary small" onClick={() => { playSound('wood'); api.choose('wood', wood); }}>{wood > 0 ? `確定：1本＋${wood}本引く` : '確定：木1本だけ取る'}</button>
          </div>
        </div>
      </div>
      <p className="hint">🐍ヘビ（黒玉）に噛まれるのは<strong>木集めの追加引きだけ</strong>。出ると病気で次ラウンド休み＆追加分は無し。釣りの黒玉は「不漁」で病気にはなりません。</p>
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

function Hand({ view, me, onSelect }: { view: PublicGameState; me: PublicPlayer; onSelect: (card: Card) => void }) {
  const hand = me.hand ?? [];
  if (hand.length === 0) return null;
  return (
    <div className="hand">
      <span className="hand-label">手札（タップで効果と使い方）</span>
      <div className="hand-cards">
        {hand.map((c) => {
          const info = CARD_INFO[c.kind];
          return (
            <button key={c.id} className={`card-chip cat-${info.cat}`} title={info.desc} onClick={() => { playSound('click'); onSelect(c); }}>
              <span className="card-ic">{info.icon}</span>
              <span className="card-nm">{info.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 今そのカードが使えるか＋使えない理由（説明モーダル用）。 */
function cardUsable(view: PublicGameState, me: PublicPlayer, c: Card): { ok: boolean; reason?: string } {
  const k = c.kind;
  const phase = view.phase;
  const cat = CARD_INFO[k].cat;
  if (me.sick && k !== 'serum') return { ok: false, reason: '病気の間はカードを使えません（血清を除く）。' };
  if (cat === 'permanent' && k !== 'gun') return { ok: false, reason: '持っているだけで自動的に効果が出る永続カードです。' };
  if (cat === 'junk') return { ok: false, reason: '効果はありません（交換やブラフ用）。' };
  if (k === 'bullet') return { ok: false, reason: '銃と一緒に使います（単体では使えません）。' };
  if (cat === 'resource') {
    return phase === 'survival' || phase === 'action' || phase === 'vote'
      ? { ok: true }
      : { ok: false, reason: 'いまは使えません（行動/生存/投票フェイズで）。' };
  }
  if (k === 'serum') return me.sick ? { ok: true } : { ok: false, reason: '病気のときだけ使えます。' };
  if (k === 'voodoo' || k === 'sleeping_pills' || k === 'alarm_clock')
    return phase === 'action' && view.isYourTurn ? { ok: true } : { ok: false, reason: '自分の手番（行動フェイズ）で使えます。' };
  if (k === 'gun') {
    if (!(me.hand ?? []).some((x) => x.kind === 'bullet')) return { ok: false, reason: '弾が必要です。' };
    return phase === 'action' || phase === 'vote' ? { ok: true } : { ok: false, reason: '行動フェイズか投票中に使えます。' };
  }
  return { ok: false };
}

/** カードの効果説明＋「使う／やめる」確認。対象が要るカードはターゲット選択へ。 */
function ItemModal({
  view,
  me,
  card,
  onClose,
  onUse,
}: {
  view: PublicGameState;
  me: PublicPlayer;
  card: Card;
  onClose: () => void;
  onUse: (card: Card, mode: 'gun' | 'voodoo' | null) => void;
}) {
  const info = CARD_INFO[card.kind];
  const u = cardUsable(view, me, card);
  const use = () => {
    if (!u.ok) return;
    if (card.kind === 'gun') return onUse(card, 'gun');
    if (card.kind === 'voodoo') return onUse(card, 'voodoo');
    playSound('click');
    api.playCard(card.id);
    onClose();
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal item-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`item-ic cat-${info.cat}`}>{info.icon}</div>
        <h3>{info.name}</h3>
        <p className="item-desc">{info.desc}</p>
        <p className="hint">カードを使っても、このターンの行動（釣り・水汲み・木集め・探索）は別に行えます。</p>
        {!u.ok && u.reason && <p className="short">{u.reason}</p>}
        <div className="panel-actions">
          <button className="btn ghost" onClick={onClose}>やめる</button>
          <button className="btn primary" disabled={!u.ok} onClick={use}>
            {card.kind === 'gun' || card.kind === 'voodoo' ? '使う（相手を選ぶ）' : '使う'}
          </button>
        </div>
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

const QUICK_PHRASES = ['協力しよう', '水ちょうだい', '食料ちょうだい', '君が怪しい', '俺じゃない！', '取引しよう', '出航しよう', 'まだ待って', 'ナイス！'];

function Chat({ view, chat, onSay }: { view: PublicGameState; chat: ChatMessage[]; onSay: (t: string) => void }) {
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [chat.length]);
  const me = view.players.find((p) => p.isYou);
  const targets = view.players.filter((p) => p.alive && !p.escaped && p.id !== me?.id);
  const prefix = to ? `＞${to} ` : '';
  const sendRaw = (body: string) => {
    const t = (prefix + body).trim();
    if (t) onSay(t);
  };
  const send = () => {
    const b = text.trim();
    if (!b) return;
    sendRaw(b);
    setText('');
  };
  return (
    <div className="chat">
      <h3>議論チャット</h3>
      <div className="chat-list" ref={ref}>
        {chat.length === 0 && <p className="hint">まだ発言はありません。下の定型文でサッと話せます。</p>}
        {chat.map((m) => (
          <div key={m.id} className={`chat-msg ${m.isSpectator ? 'spec' : ''}`}><span className="chat-name">{m.isSpectator ? '👀' : ''}{m.name}</span><span className="chat-text">{m.text}</span></div>
        ))}
      </div>
      <div className="quick-row">
        <select className="quick-to" value={to} onChange={(e) => setTo(e.target.value)} title="宛先">
          <option value="">宛先なし</option>
          {targets.map((p) => (
            <option key={p.id} value={p.name}>＞{p.name}</option>
          ))}
        </select>
        {QUICK_PHRASES.map((q) => (
          <button key={q} className="quick-chip" onClick={() => sendRaw(q)}>{q}</button>
        ))}
      </div>
      <div className="chat-input">
        <input value={text} maxLength={200} placeholder={view.isSpectator ? '観戦者として発言' : prefix ? `${prefix}…` : 'メッセージ…'} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
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

/** 天候の常時エフェクト：雨が降る／晴れの陽射し／嵐の稲妻＋豪雨。 */
function WeatherFX({ view }: { view: PublicGameState }) {
  if (view.phase === 'lobby' || view.phase === 'gameover') return null;
  if (view.hurricaneRevealed) {
    return (
      <div className="wfx wfx-storm" aria-hidden>
        <div className="wfx-rain heavy" />
        <div className="wfx-light" />
      </div>
    );
  }
  if (view.currentPrecip > 0) {
    return (
      <div className="wfx" aria-hidden>
        <div className={`wfx-rain p${Math.min(3, view.currentPrecip)}`} />
      </div>
    );
  }
  return <div className="wfx wfx-sun" aria-hidden />;
}

interface Flight { key: string; icon: string; x: number; y: number; dx: number; dy: number; delay: number }
const GAIN_ICON: Record<string, string> = { food: '🐟', water: '💧', wood: '🪵', card: '🃏' };

/** 資源・カード獲得の演出：トークンが取得元から場（資源カウンタ/筏）やプレイヤーへ1個ずつ飛ぶ。 */
function FlyLayer({ view }: { view: PublicGameState }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  // マウント時点の lastGain は「過去の獲得」なので再生しない（再接続/リロード対策）。
  const seen = useRef(view.lastGain?.id ?? -1);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((id) => window.clearTimeout(id)); }, []);
  const g = view.lastGain;
  useEffect(() => {
    if (!g || g.id === seen.current) return;
    seen.current = g.id;
    const centerOf = (el: Element | null): { x: number; y: number } | null => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    };
    const pcard = document.querySelector(`[data-pid="${g.playerId}"]`);
    let src: { x: number; y: number } | null;
    let tgt: { x: number; y: number } | null;
    if (g.kind === 'card') {
      // カードは山札（上中央）からそのプレイヤーへ飛ぶ
      src = { x: window.innerWidth / 2, y: 84 };
      tgt = centerOf(pcard);
    } else {
      const sel = g.kind === 'food' ? '[data-fly="food"]' : g.kind === 'water' ? '[data-fly="water"]' : '[data-fly="raft"]';
      src = centerOf(pcard) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      tgt = centerOf(document.querySelector(sel));
    }
    if (!src || !tgt) return;
    const n = Math.min(Math.max(1, g.amount), 6);
    const id0 = g.id;
    const arr: Flight[] = Array.from({ length: n }, (_, i) => ({
      key: `${id0}-${i}`,
      icon: GAIN_ICON[g.kind] ?? '✨',
      x: src!.x,
      y: src!.y,
      dx: tgt!.x - src!.x,
      dy: tgt!.y - src!.y,
      delay: i * 0.12,
    }));
    setFlights((f) => [...f, ...arr]);
    // 各獲得のトークンは自前のタイマーで必ず消す。クリーンアップで前回分を消さない
    // （deps変化時に前のタイマーをclearすると、前回トークンが残り続けるため）。
    const t = window.setTimeout(() => setFlights((f) => f.filter((x) => !x.key.startsWith(`${id0}-`))), 850 + n * 130);
    timers.current.push(t);
  }, [g?.id]);
  if (flights.length === 0) return null;
  return (
    <div className="fly-layer" aria-hidden>
      {flights.map((f) => {
        const style: Record<string, string> = {
          left: `${f.x}px`,
          top: `${f.y}px`,
          animationDelay: `${f.delay}s`,
          '--fdx': `${f.dx}px`,
          '--fdy': `${f.dy}px`,
        };
        return (
          <span key={f.key} className="fly-token" style={style as CSSProperties}>{f.icon}</span>
        );
      })}
    </div>
  );
}

const EV_META: Record<string, { ic: string; cls: string }> = {
  hurricane: { ic: '🌀', cls: 'storm' },
  death: { ic: '💀', cls: 'death' },
  escape: { ic: '🛶', cls: 'escape' },
  snake: { ic: '🐍', cls: 'snake' },
  seat: { ic: '🛶', cls: 'seat' },
};

/** 事件演出：画面フラッシュ＋シェイク＋大きな演出カード。 */
function EventFX({ view }: { view: PublicGameState }) {
  const e = [...view.log]
    .reverse()
    .find((x) => x.kind === 'death' || x.kind === 'escape' || x.kind === 'snake' || x.text.includes('ハリケーン') || x.text.includes('座席が'));
  const [cur, setCur] = useState<{ id: number; kind: string; text: string } | null>(null);
  const seen = useRef(-1);
  useEffect(() => {
    if (!e || e.id === seen.current) return;
    seen.current = e.id;
    const kind = e.text.includes('ハリケーン') ? 'hurricane' : e.text.includes('座席が') ? 'seat' : (e.kind ?? 'info');
    setCur({ id: e.id, kind, text: e.text });
    if (kind === 'death' || kind === 'snake' || kind === 'hurricane') {
      document.documentElement.classList.add('fx-shake');
      window.setTimeout(() => document.documentElement.classList.remove('fx-shake'), 460);
    }
    const t = window.setTimeout(() => setCur(null), kind === 'seat' ? 1300 : 2400);
    return () => window.clearTimeout(t);
  }, [e?.id]);
  if (!cur) return null;
  const meta = EV_META[cur.kind] ?? { ic: '❗', cls: 'info' };
  return (
    <>
      {cur.kind !== 'seat' && <div className={`fx-flash ${meta.cls}`} key={cur.id} />}
      <div className={`event-card ${meta.cls}`} key={`c${cur.id}`}>
        <span className="ev-ic">{meta.ic}</span>
        <span className="ev-text">{cur.text}</span>
      </div>
    </>
  );
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
