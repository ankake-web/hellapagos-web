import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ActionType, Card, CardKind, ChatMessage, PublicGameState, PublicPlayer } from '@hellapagos/shared';
import { CARD_INFO, PERSONA_INFO, RAFT_LOOP } from '@hellapagos/shared';
import { api } from '../api.js';
import { GameIcon, UiIcon } from '../assets/icons.js';
import { ART } from '../assets/manifest.js';
import { playSound } from '../sound.js';
import { ConfirmModal, type ConfirmLine } from './Confirm.js';

interface Props {
  view: PublicGameState;
  chat: ChatMessage[];
  onSay: (text: string) => void;
  onLeave: () => void;
}

const ACTION_LABEL: Record<ActionType, string> = {
  fish: '釣り',
  water: '水汲み',
  wood: '木集め',
  search: '難破船',
};
// 行動ボタンのアイコン（icons.tsx のSVGキー）
const ACTION_ICON: Record<ActionType, string> = { fish: 'fish', water: 'water', wood: 'wood', search: 'search' };
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

/** 表示用の整形（サーバ未再デプロイでも表示だけ揃える）。
 *  ・「座席」→「船」に言い換え
 *  ・サーバ側ログに混じる絵文字を除去（アイコンはSVGで別に描いているので二重表示になるため） */
function shipText(s: string): string {
  return s
    .replace(/座席/g, '船')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function weatherLabel(v: PublicGameState): string {
  if (v.hurricaneRevealed) return 'ハリケーン';
  if (v.currentPrecip === 0) return '晴れ（降水0）';
  if (v.currentPrecip >= 3) return '大雨（降水3）';
  return `雨（降水${v.currentPrecip}）`;
}

export function Board({ view, chat, onSay, onLeave }: Props) {
  const me = view.players.find((p) => p.isYou);
  const [targeting, setTargeting] = useState<{ card: Card; mode: 'gun' | 'voodoo' | 'telescope' } | null>(null);
  // 対象を選んだ直後の確認シート（射撃は特に取り返しがつかないので必ず1枚挟む）
  const [targetConfirm, setTargetConfirm] = useState<PublicPlayer | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [tab, setTab] = useState<'log' | 'chat'>('log');
  const freshDraw = useFreshDraw(view);

  useEffect(() => { setTargeting(null); setTargetConfirm(null); }, [view.phase, view.round, view.currentActorId]);

  const targetable = (p: PublicPlayer): boolean => {
    if (!targeting) return false;
    if (targeting.mode === 'voodoo') return !p.alive && !p.escaped; // 死者を蘇生
    return p.alive && !p.escaped && !p.isYou; // gun / telescope は生存中の他人
  };
  const pickTarget = (p: PublicPlayer) => {
    if (!targeting || !targetable(p)) return;
    playSound('click');
    setTargetConfirm(p);
  };
  const commitTarget = () => {
    if (!targeting || !targetConfirm) return;
    playSound('click');
    api.playCard(targeting.card.id, targetConfirm.id);
    setTargetConfirm(null);
    setTargeting(null);
  };

  const weatherClass = view.hurricaneRevealed ? 'w-storm' : view.currentPrecip === 0 ? 'w-sunny' : 'w-rain';
  return (
    <div className={`board ${weatherClass}`}>
      <Header view={view} />
      <HandBar me={me} onSelect={setSelectedCard} />
      <WeatherFX view={view} />
      <RoundSplash view={view} />
      <DrawCenter view={view} draw={freshDraw} />
      <WoodSplash view={view} draw={freshDraw} />
      <EventFX view={view} />
      <FlyLayer view={view} />
      {targeting && (
        <div className="banner target">
          <GameIcon name={targeting.card.kind} size={22} fallback={CARD_INFO[targeting.card.kind].icon} /> {targeting.mode === 'gun' ? '撃つ相手' : targeting.mode === 'telescope' ? 'のぞき見る相手' : '蘇生する相手'}を選択
          <button className="btn ghost small" onClick={() => setTargeting(null)}>キャンセル</button>
        </div>
      )}
      <div className="board-main">
        <div className="board-left">
          <Tracks view={view} />
          <PlayerGrid view={view} draw={freshDraw} targetable={targetable} onPick={pickTarget} />
          <PhasePanel view={view} me={me} />
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
      <PeekModal peek={view.peek} />
      {targeting && targetConfirm && (
        <TargetConfirm
          mode={targeting.mode}
          target={targetConfirm}
          onCancel={() => setTargetConfirm(null)}
          onConfirm={commitTarget}
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

/** 対象を選ぶカード（拳銃・ブードゥー人形・望遠鏡）の確認シート。
 *  特に射撃は相手が即死するので、誰を撃つのか・何を消費するのかを明示する。 */
function TargetConfirm({
  mode,
  target,
  onCancel,
  onConfirm,
}: {
  mode: 'gun' | 'voodoo' | 'telescope';
  target: PublicPlayer;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (mode === 'gun') {
    return (
      <ConfirmModal
        danger
        title={`${target.name} を撃ちますか？`}
        lead="撃たれた人はその場で死亡します。撃った事実は全員に伝わり、取り消せません。"
        lines={[
          { label: `${target.name} の運命`, value: '即死（トタン板を持っていれば1回だけ防がれる）', tone: 'danger' },
          { label: '奪える持ち物', value: `手札 ${target.handCount} 枚`, tone: 'good' },
          { label: 'あなたが失うもの', value: '弾 1発（拳銃は手元に残る）', tone: 'danger' },
        ]}
        confirmLabel="撃つ"
        cancelLabel="やめる"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }
  if (mode === 'voodoo') {
    return (
      <ConfirmModal
        title={`${target.name} を蘇生しますか？`}
        lead="脱落した人が生き返り、以降の水・食料の消費と投票に加わります。"
        lines={[
          { label: '蘇る人', value: target.name, tone: 'good' },
          { label: '生存者', value: '1人増える（必要な水・食料も1人分増える）' },
          { label: 'あなたが失うもの', value: 'ブードゥー人形 1枚（使い切り）', tone: 'danger' },
        ]}
        confirmLabel="蘇生する"
        cancelLabel="やめる"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }
  return (
    <ConfirmModal
      title={`${target.name} の手札をのぞきますか？`}
      lead="のぞいた内容はあなたにだけ見えます。カードは戻ってきません。"
      lines={[
        { label: '見える枚数', value: `${target.handCount} 枚`, tone: 'good' },
        { label: 'あなたが失うもの', value: '望遠鏡 1枚（使い切り）', tone: 'danger' },
      ]}
      confirmLabel="のぞく"
      cancelLabel="やめる"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/** 袋の玉。魚は数字、ヘビはヘビのアイコン（木集めのみ）、釣りのハズレは灰色✗。緊張感のため1個ずつ遅延表示。 */
function Balls({ balls, action, small }: { balls: Array<{ fish: number } | { snake: true }>; action: ActionType; small?: boolean }) {
  // ヘビは最後に出す（最後にドキッ）
  const ordered = [...balls].sort((a, b) => Number('snake' in a) - Number('snake' in b));
  return (
    <div className={`balls ${small ? 'small' : ''}`}>
      {ordered.map((b, i) => {
        const snake = 'snake' in b;
        const cls = snake ? (action === 'wood' ? 'snake' : 'miss') : '';
        const label = snake
          ? action === 'wood'
            ? <GameIcon name="snake" size={small ? 16 : 30} />
            : '✗'
          : (b as { fish: number }).fish;
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
  // 自分の木集めは WoodSplash（一枚絵）が担当する画像があるならそちらに任せる
  if (draw.action === 'wood' && isMine && (ART['wood-bite'] || ART['wood-ok'])) return null;
  const who = view.players.find((p) => p.id === draw.playerId)?.name ?? '';
  const fishTotal = draw.balls.reduce((n, b) => n + ('fish' in b ? b.fish : 0), 0);
  return (
    <div className="draw-pop">
      <span className="draw-who">{who} の{draw.action === 'fish' ? '釣り' : '木集め'}</span>
      <Balls balls={draw.balls} action={draw.action} />
      <span className="draw-sum">
        {snake
          ? '噛まれた！追加分は失う（確定分の木は確保）'
          : draw.action === 'fish'
            ? (fishTotal > 0 ? `食料 +${fishTotal}` : '不漁…')
            : `木 +${draw.balls.length}`}
      </span>
    </div>
  );
}

/** 木集めの「成功（木材ゲット）／失敗（ヘビに噛まれる）」を一枚絵で大きく見せる演出。
 *  art/wood-ok.* と art/wood-bite.* を置くと有効化。無ければ DrawCenter の通常表示にフォールバック。 */
function WoodSplash({ view, draw }: { view: PublicGameState; draw: PublicGameState['lastDraw'] | null }) {
  if (!draw || draw.action !== 'wood' || draw.playerId !== view.youId || !draw.balls.length) return null;
  const bit = draw.balls.some((b) => 'snake' in b);
  const art = bit ? ART['wood-bite'] : ART['wood-ok'];
  if (!art) return null;
  return (
    <div className="wood-splash" aria-hidden>
      <div className={`ws-card ${bit ? 'bite' : 'ok'}`}>
        <img className="ws-art" src={art} alt="" />
        <span className="ws-text">{bit ? 'ヘビに噛まれた！毒で次ラウンド休み・追加分は失う' : `木材 +${draw.balls.length} を確保！`}</span>
      </div>
    </div>
  );
}

/** 対戦中のヘッダー。375px幅で3〜4段に折り返して盤面を圧迫していたので、
 *  1段目に「ラウンド」と「フェイズ＋残り時間」、2段目に「天気」と「天候カードの残り」を置いて2段以内に収める。 */
function Header({ view }: { view: PublicGameState }) {
  const left = useCountdown(view.deadlineAt);
  return (
    <header className="header">
      <div className="header-left">
        <span className="day">{view.round}ラウンド</span>
      </div>
      <div className="header-sub">
        <span className="weather">{weatherLabel(view)}</span>
        <span className={`storm ${view.hurricaneRevealed ? 'urgent' : ''}`}>
          {view.hurricaneRevealed ? '本ラウンドで強制脱出' : `天候カード残り ${view.weatherRemaining}`}
        </span>
      </div>
      <div className="header-right">
        {view.isSpectator && <span className="tag spectate">観戦中</span>}
        <span className="phase-name">{phaseLabel(view)}</span>
        {left !== null && <span className="timer">残り{left}s</span>}
      </div>
    </header>
  );
}

/** 食料・水を上段に2分割、船を下段に大きく表示する。 */
function Tracks({ view }: { view: PublicGameState }) {
  const need = view.seatsNeeded;
  return (
    <div className="tracks">
      <div className="tracks-top">
        <ResCell icon="fish" value={view.food} need={need} flyKey="food" title={`食料 ${view.food} / 必要${need}（上限${view.foodCap}）`} />
        <ResCell icon="water" value={view.water} need={need} flyKey="water" title={`水 ${view.water} / 必要${need}（上限${view.waterCap}）`} />
      </div>
      <ResCell
        icon="ship"
        value={view.raftSeats}
        need={need}
        flyKey="raft"
        raft
        big
        progress={view.raftProgress}
        sub={`次の席まで あと木 ${RAFT_LOOP - view.raftProgress} 本`}
        title={`船 ${view.raftSeats} / ${need}（木${RAFT_LOOP}で+1）`}
      />
    </div>
  );
}

/** 量を「丸の数」で見せるメーター。数字だけだと読み飛ばされるので必ず数字と併記する。
 *  必要数ぶんの枠は必ず描き、足りない分は空の丸にして「あと何個か」を一目で分かるようにする。 */
function Pips({ value, need }: { value: number; need: number }) {
  const MAX = 12; // 丸が増えすぎるとかえって読めないので打ち切って「+n」で示す
  const slots = Math.min(MAX, Math.max(need, Math.min(value, MAX)));
  const over = Math.max(0, value - slots);
  const short = value < need;
  return (
    <div className="pips" aria-hidden>
      {Array.from({ length: slots }, (_, i) => (
        <span key={i} className={`pip ${i < value ? (short ? 'short' : 'ok') : 'empty'}`} />
      ))}
      {over > 0 && <span className="pip-more">+{over}</span>}
    </div>
  );
}

/** 船の進み具合。完成した席は丸、次の1席までの木の進みは板（RAFT_LOOP枚）で見せる。 */
function RaftMeter({ seats, need, progress }: { seats: number; need: number; progress: number }) {
  return (
    <>
      <Pips value={seats} need={need} />
      <div className="raft-bar" aria-hidden>
        {Array.from({ length: RAFT_LOOP }, (_, i) => (
          <span key={i} className={`plank ${i < progress ? 'on' : ''}`} />
        ))}
      </div>
    </>
  );
}

function ResCell({
  icon,
  value,
  need,
  flyKey,
  raft,
  big,
  sub,
  title,
  progress,
}: {
  icon: string;
  value: number;
  need: number;
  flyKey: string;
  raft?: boolean;
  big?: boolean;
  sub?: string;
  title?: string;
  /** 船だけ：次の席までの木の進み（0..RAFT_LOOP-1）。 */
  progress?: number;
}) {
  const short = value < need;
  return (
    <div className={`rcell ${raft ? 'raft' : ''} ${big ? 'big' : ''} ${short ? 'short' : 'ok'}`} data-fly={flyKey} title={title}>
      <GameIcon name={icon} size={big ? 64 : 44} className="rcell-ic" />
      <div className="rcell-body">
        <div className="rcell-num">
          <strong key={value} className={`num-pop ${short ? 'short' : 'ok'}`}>{value}</strong>
          <small>/{need}</small>
        </div>
        {raft ? <RaftMeter seats={value} need={need} progress={progress ?? 0} /> : <Pips value={value} need={need} />}
        {sub && <span className="rcell-sub">{sub}</span>}
      </div>
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
        {p.isYou && ART['you'] ? <img className="pc-avatar" src={ART['you']} alt="" /> : p.isBot ? <span className="pc-face bot">CPU</span> : null}
        <span className="pname">{p.name}</span>
        {p.id === view.hostId && <span className="tag host">主</span>}
        {p.isYou && <span className="tag you">自</span>}
      </div>
      <div className="pcard-status">
        {myDraw && <Balls balls={myDraw.balls} action={myDraw.action} small />}
        {p.escaped && <span className="badge escape">脱出</span>}
        {dead && <span className="badge death">死亡</span>}
        {p.sick && p.alive && <span className="badge sick">病気</span>}
        {p.resting && p.alive && <span className="badge sick">休み</span>}
        {!myDraw && !dead && !p.escaped && isActor && view.phase === 'action' && <span className="badge actor">手番</span>}
        {!dead && !p.escaped && p.acted && view.phase === 'action' && <span className="badge done">済</span>}
      </div>
      <div className="pcard-foot">
        <span className="stash">手札 {p.handCount}</span>
        {p.permanents.length > 0 && <span className="perms">{p.permanents.map((k) => <GameIcon key={k} name={k} size={16} fallback={CARD_INFO[k as CardKind].icon} />)}</span>}
        {view.phase === 'vote' && p.votesReceived ? <span className="votes">{p.votesReceived}票</span> : null}
      </div>
    </div>
  );
}

function PhasePanel({ view, me }: { view: PublicGameState; me?: PublicPlayer }) {
  if (view.isSpectator) return <div className="panel spectate">観戦中。生存者たちの選択を見守りましょう。</div>;
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

/** 行動の確認シートに出す「何が起きるか」の明細。 */
function actionConfirm(view: PublicGameState, action: ActionType, wood: number): { title: string; lines: ConfirmLine[]; danger?: boolean } {
  switch (action) {
    case 'fish':
      return {
        title: '釣りをしますか？',
        lines: [
          { label: '引く玉', value: '1個（魚1〜3 か 不漁）' },
          { label: '見込みの食料', value: '+1〜3（釣り竿を発動済みなら倍）', tone: 'good' },
          { label: 'この手番', value: 'これで確定（他の行動は選べません）', tone: 'danger' },
        ],
      };
    case 'water':
      return {
        title: '水を汲みますか？',
        lines: [
          { label: '得られる水', value: `+${view.currentPrecip}（水筒を発動済みなら倍）`, tone: 'good' },
          { label: 'この手番', value: 'これで確定（他の行動は選べません）', tone: 'danger' },
        ],
      };
    case 'search':
      return {
        title: '難破船を漁りますか？',
        lines: [
          { label: '引くカード', value: '1枚（中身は運まかせ）', tone: 'good' },
          { label: 'この手番', value: 'これで確定（他の行動は選べません）', tone: 'danger' },
        ],
      };
    default:
      return {
        title: wood > 0 ? `木を集めますか？（さらに${wood}本引く）` : '木を集めますか？',
        danger: wood > 0,
        lines: [
          { label: '確定でもらえる木', value: '1本（斧を発動済みなら2本）', tone: 'good' },
          { label: 'さらに引く', value: wood > 0 ? `${wood}本ぶん袋を引く` : 'なし（安全）' },
          ...(wood > 0
            ? ([{ label: 'ヘビが出たら', value: '次ラウンド休み＋その回の木は全部失う', tone: 'danger' }] as ConfirmLine[])
            : []),
          { label: 'この手番', value: 'これで確定（他の行動は選べません）', tone: 'danger' },
        ],
      };
  }
}

function ActionPanel({ view, me }: { view: PublicGameState; me: PublicPlayer }) {
  const [wood, setWood] = useState(0);
  // 行動はワンタップで確定してしまうので、確認シートを1枚挟む
  const [confirm, setConfirm] = useState<{ action: ActionType; wood: number } | null>(null);
  if (me.resting) return <div className="panel">ヘビの毒で今ラウンドは動けません。</div>;
  if (!view.isYourTurn) {
    const actor = view.players.find((p) => p.id === view.currentActorId);
    return <div className="panel"><h3>行動フェイズ</h3><p className="hint">{actor ? `${actor.name} の手番です…` : '進行中…'}</p></div>;
  }
  const commit = () => {
    if (!confirm) return;
    playSound(confirm.action);
    api.choose(confirm.action, confirm.action === 'wood' ? confirm.wood : undefined);
    setConfirm(null);
  };
  const ask = (action: ActionType, n = 0) => { playSound('click'); setConfirm({ action, wood: n }); };
  const meta = confirm ? actionConfirm(view, confirm.action, confirm.wood) : null;
  return (
    <div className="panel yourturn">
      <h3>あなたの番です — 行動を選ぶ</h3>
      <div className="action-grid">
        <div className="action-row3">
          <button className="btn action" onClick={() => ask('fish')}><GameIcon name={ACTION_ICON.fish} size={34} /><span className="act-name">{ACTION_LABEL.fish}</span><span className="sub">袋から1玉・魚1〜3</span></button>
          <button className="btn action" disabled={view.currentPrecip === 0} onClick={() => ask('water')}><GameIcon name={ACTION_ICON.water} size={34} /><span className="act-name">{ACTION_LABEL.water}</span><span className="sub">{view.currentPrecip === 0 ? '今日は雨なし' : `水+${view.currentPrecip}`}</span></button>
          <button className="btn action" onClick={() => ask('search')}><GameIcon name={ACTION_ICON.search} size={34} /><span className="act-name">{ACTION_LABEL.search}</span><span className="sub">カードを1枚引く</span></button>
        </div>
        <div className="btn action wood-action">
          <div className="wood-head">
            <GameIcon name={ACTION_ICON.wood} size={40} />
            <div className="wood-head-txt"><span className="act-name">{ACTION_LABEL.wood}</span><span className="sub">まず木1本（斧で2本）確定。さらに引くとヘビ（病気）の危険。</span></div>
          </div>
          <div className="wood-push">
            <label>さらに引く本数：{wood} 本（0〜5）<input type="range" min={0} max={5} value={wood} onChange={(e) => setWood(Number(e.target.value))} /></label>
            {/* 危険度メーター：数字だけだと「5本」の重さが伝わらないので玉の数で見せる */}
            <div className="risk-meter" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={`risk-pip ${i < wood ? 'on' : ''}`} />
              ))}
              <span className={`risk-label ${wood >= 4 ? 'hot' : wood >= 2 ? 'warm' : ''}`}>
                {wood === 0 ? '安全' : wood <= 2 ? 'ヘビの危険：小' : wood <= 4 ? 'ヘビの危険：中' : 'ヘビの危険：大'}
              </span>
            </div>
            <button className="btn primary" onClick={() => ask('wood', wood)}>{wood > 0 ? `1本＋${wood}本引く` : '木1本だけ取る'}</button>
          </div>
        </div>
      </div>
      <p className="hint">ヘビ（黒玉）に噛まれるのは<strong>木集めの追加引きだけ</strong>。出ると病気で次ラウンド休み＆追加分は無し。釣りの黒玉は「不漁」で病気にはなりません。</p>
      {confirm && meta && (
        <ConfirmModal
          title={meta.title}
          danger={meta.danger}
          lead="行動は1ラウンドに1つだけ。決めると取り消せません。"
          lines={meta.lines}
          confirmLabel="この行動で確定"
          cancelLabel="選び直す"
          onCancel={() => setConfirm(null)}
          onConfirm={commit}
        />
      )}
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
  // 人を追放する＝取り返しがつかない操作なので、誰に入れるのかを確認シートで必ず見せる
  const [confirm, setConfirm] = useState<{ target: PublicPlayer | null } | null>(null);
  const reason = view.voteReason === 'water' ? '水不足' : view.voteReason === 'food' ? '食料不足' : 'ハリケーン';
  if (me.sick) return <div className="panel danger"><h3>追放投票（{reason}）</h3><p className="hint">あなたは病気のため投票できません（対象にはなります）。</p></div>;
  if (me.vote !== undefined) return <div className="panel danger"><h3>追放投票（{reason}）</h3><p className="hint">投票しました。集計を待っています…</p></div>;
  const targets = view.players.filter((p) => p.alive && !p.escaped && p.id !== me.id);
  const commit = () => {
    if (!confirm) return;
    playSound('vote');
    api.vote(confirm.target ? confirm.target.id : null);
    setConfirm(null);
  };
  const t = confirm?.target ?? null;
  return (
    <div className="panel danger">
      <h3>追放投票（{reason}）— 残り{view.pendingEliminations}人</h3>
      <p className="hint">誰を犠牲にする？（手札の資源カードで自分は自動的に救われます）</p>
      <div className="vote-grid">
        {targets.map((p) => (
          <button key={p.id} className="btn vote" onClick={() => { playSound('click'); setConfirm({ target: p }); }}>{p.name}<span className="sub">手札{p.handCount}{p.sick ? '・病気' : ''}{p.votesReceived ? `・${p.votesReceived}票` : ''}</span></button>
        ))}
        <button className="btn ghost" onClick={() => { playSound('click'); setConfirm({ target: null }); }}>棄権</button>
      </div>
      {confirm && (
        <ConfirmModal
          danger
          title={t ? `${t.name} に投票しますか？` : '棄権しますか？'}
          lead={
            t
              ? '最多票の人はその場で追放＝死亡します。投票したあとは変更できません。'
              : '誰にも票を入れません。投票したあとは変更できません。'
          }
          lines={
            t
              ? [
                  { label: '追放される人', value: `${t.name}（あなたの票が入ります）`, tone: 'danger' },
                  { label: '相手の手札', value: `${t.handCount} 枚${t.sick ? '・病気' : ''}` },
                  { label: '相手の現在の票', value: `${t.votesReceived ?? 0} 票` },
                  { label: '今回の犠牲者', value: `あと ${view.pendingEliminations} 人`, tone: 'danger' },
                ]
              : [
                  { label: 'あなたの票', value: '誰にも入りません' },
                  { label: '今回の犠牲者', value: `あと ${view.pendingEliminations} 人（他の人の票で決まります）`, tone: 'danger' },
                ]
          }
          confirmLabel={t ? `${t.name} に投票する` : '棄権する'}
          cancelLabel="選び直す"
          onCancel={() => setConfirm(null)}
          onConfirm={commit}
        />
      )}
    </div>
  );
}

function EscapePanel({ view }: { view: PublicGameState; me: PublicPlayer }) {
  // 出航はやり直せないので確認を1枚。何人が乗れて何人が島に残るかを実数で見せる
  const [confirm, setConfirm] = useState(false);
  const need = view.seatsNeeded;
  const boardable = Math.min(view.raftSeats, view.food, view.water);
  const left = Math.max(0, need - boardable);
  return (
    <div className="panel escape">
      <h3>脱出のチャンス！</h3>
      <p>船{view.raftSeats}（生存{need}人）・航海の水食料も十分。今、出航する？</p>
      <div className="panel-actions">
        <button className="btn ghost" onClick={() => { playSound('click'); api.escapeVote(false); }}>まだ残る</button>
        <button className="btn primary" onClick={() => { playSound('click'); setConfirm(true); }}>出航する！</button>
      </div>
      {confirm && (
        <ConfirmModal
          title="今すぐ出航しますか？"
          lead="出航に賛成したあとは取り消せません。全員の投票がそろうと結果が確定します。"
          lines={[
            { label: '船の席', value: `${view.raftSeats} 席（必要 ${need} 席）` },
            { label: '航海の補給', value: `水 ${view.water}・食料 ${view.food}` },
            { label: '乗れる人数', value: `${Math.min(boardable, need)} 人`, tone: 'good' },
            ...(left > 0
              ? ([{ label: '島に残る人', value: `${left} 人（置き去り）`, tone: 'danger' }] as ConfirmLine[])
              : []),
          ]}
          confirmLabel="出航する"
          cancelLabel="やめる"
          onCancel={() => setConfirm(false)}
          onConfirm={() => { playSound('escape'); api.escapeVote(true); setConfirm(false); }}
        />
      )}
    </div>
  );
}

/** 自分の手札を画面上部に常時表示する帯。スマホでは横スクロール＋スティッキーで常に確認できる。 */
function HandBar({ me, onSelect }: { me?: PublicPlayer; onSelect: (card: Card) => void }) {
  const hand = me?.hand ?? [];
  if (!me || !me.alive || me.escaped || hand.length === 0) return null;
  return (
    <div className="hand-bar">
      <div className="hand-bar-cards">
        {hand.map((c) => {
          const info = CARD_INFO[c.kind];
          return (
            <button key={c.id} className={`card-chip cat-${info.cat}`} title={info.desc} onClick={() => { playSound('click'); onSelect(c); }}>
              <GameIcon className="card-ic" name={c.kind} size={30} fallback={info.icon} />
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
  if (cat === 'permanent' && k !== 'gun')
    return phase === 'action'
      ? { ok: true }
      : { ok: false, reason: '自分の手番（行動フェイズ）で使うと発動し、以後ずっと効果が続きます。' };
  if (cat === 'junk') return { ok: false, reason: '使えません。手札に残るので「カードを使わない＝何を持っているか怪しまれる」状況を作ります。' };
  if (k === 'bullet') return { ok: false, reason: '銃と一緒に使います（単体では使えません）。' };
  if (k === 'tin_sheet') return { ok: false, reason: '銃で撃たれた時に自動で1回だけ防ぎます（自分から使う必要はありません）。' };
  if (cat === 'resource') {
    if (k === 'fruit_basket')
      return phase === 'survival' ? { ok: true } : { ok: false, reason: '不足の救済専用：生存チェック中だけ使えます（脱出の補給には使えません）。' };
    if (phase === 'vote') return { ok: true };
    return phase === 'survival' || phase === 'action'
      ? { ok: true }
      : { ok: false, reason: 'いまは使えません（行動/生存/投票フェイズで）。' };
  }
  if (k === 'serum') return me.sick ? { ok: true } : { ok: false, reason: '病気のときだけ使えます。' };
  if (k === 'voodoo' || k === 'sleeping_pills' || k === 'alarm_clock' || k === 'telescope')
    return phase === 'action' && view.isYourTurn ? { ok: true } : { ok: false, reason: '自分の手番（行動フェイズ）で使えます。' };
  if (k === 'matches')
    return phase === 'action' || phase === 'survival' || phase === 'vote'
      ? { ok: true }
      : { ok: false, reason: '汚れた水/腐った魚を使う前に使えます。' };
  if (k === 'cannibal_bbq')
    return (view.bodiesAvailable ?? 0) > 0 ? { ok: true } : { ok: false, reason: '脱落者（死体）がいる時だけ使えます。' };
  if (k === 'conch')
    return phase === 'vote' ? { ok: true } : { ok: false, reason: '追放投票が進行中のときに使えます。' };
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
  onUse: (card: Card, mode: 'gun' | 'voodoo' | 'telescope' | null) => void;
}) {
  const info = CARD_INFO[card.kind];
  const u = cardUsable(view, me, card);
  const targeted = card.kind === 'gun' || card.kind === 'voodoo' || card.kind === 'telescope';
  const use = () => {
    if (!u.ok) return;
    if (card.kind === 'gun') return onUse(card, 'gun');
    if (card.kind === 'voodoo') return onUse(card, 'voodoo');
    if (card.kind === 'telescope') return onUse(card, 'telescope');
    playSound('click');
    api.playCard(card.id);
    onClose();
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal item-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`item-ic cat-${info.cat}`}><GameIcon name={card.kind} size={56} fallback={info.icon} /></div>
        <h3>{info.name}</h3>
        <p className="item-desc">{info.desc}</p>
        {view.phase === 'vote' && info.cat === 'resource' && u.ok ? (
          <p className="hint">今この投票で使うと、<strong>自分だけ</strong>追放を免れます（みんなの蓄えには入りません）。</p>
        ) : info.cat === 'permanent' && card.kind !== 'gun' ? (
          <p className="hint">使うと<strong>発動して公開</strong>され、以後ずっと効果が続きます。</p>
        ) : (
          <p className="hint">カードを使っても、このターンの行動（釣り・水汲み・木集め・探索）は別に行えます。</p>
        )}
        {!u.ok && u.reason && <p className="short">{u.reason}</p>}
        <div className="panel-actions">
          <button className="btn ghost" onClick={onClose}>やめる</button>
          <button className="btn primary" disabled={!u.ok} onClick={use}>
            {targeted ? '使う（相手を選ぶ）' : '使う'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 望遠鏡でのぞいた相手の手札を本人にだけ見せるモーダル。 */
function PeekModal({ peek }: { peek: PublicGameState['peek'] }) {
  const [closed, setClosed] = useState(false);
  const sig = peek ? `${peek.targetName}:${peek.hand.map((h) => h.id).join(',')}` : '';
  const ref = useRef('');
  useEffect(() => {
    if (sig && sig !== ref.current) {
      ref.current = sig;
      setClosed(false);
    }
  }, [sig]);
  if (!peek || closed) return null;
  return (
    <div className="overlay" onClick={() => setClosed(true)}>
      <div className="modal item-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="with-ic"><GameIcon name="telescope" size={26} />{peek.targetName} の手札</h3>
        <div className="hand-cards" style={{ justifyContent: 'center' }}>
          {peek.hand.length === 0 && <p className="hint">手札なし</p>}
          {peek.hand.map((c) => {
            const info = CARD_INFO[c.kind];
            return (
              <div key={c.id} className={`card-chip cat-${info.cat}`} title={info.desc}>
                <GameIcon className="card-ic" name={c.kind} size={30} fallback={info.icon} />
                <span className="card-nm">{info.name}</span>
              </div>
            );
          })}
        </div>
        <button className="btn primary block" onClick={() => setClosed(true)}>閉じる</button>
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
          <li key={e.id} className={KIND_CLASS[e.kind ?? 'info']}><span className="log-day">R{e.round}</span> {shipText(e.text)}</li>
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
          <div key={m.id} className={`chat-msg ${m.isSpectator ? 'spec' : ''}`}><span className="chat-name">{m.isSpectator && <UiIcon name="eye" size={13} className="spec-ic" />}{m.name}</span><span className="chat-text">{m.text}</span></div>
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

/** ラウンド開始時に「その日の天気」を画面いっぱいに大きく見せる演出（常時の雨ライン表示の代わり）。 */
function RoundSplash({ view }: { view: PublicGameState }) {
  const [show, setShow] = useState(false);
  const ref = useRef(0);
  useEffect(() => {
    if (view.phase === 'lobby' || view.phase === 'gameover') return;
    if (view.round === ref.current) return;
    ref.current = view.round;
    setShow(true);
    const id = window.setTimeout(() => setShow(false), 1900);
    return () => window.clearTimeout(id);
  }, [view.round, view.phase]);
  if (!show) return null;
  const wxName = view.hurricaneRevealed ? 'wx-hurricane' : view.currentPrecip === 0 ? 'wx-sun' : view.currentPrecip >= 3 ? 'wx-storm' : 'wx-rain';
  const wClass = view.hurricaneRevealed ? 'storm' : view.currentPrecip === 0 ? 'sun' : 'rain';
  return (
    <div className="weather-reveal" aria-hidden>
      <div className={`wr-card ${wClass}`}>
        <span className="wr-round">{view.round}ラウンド目</span>
        <GameIcon name={wxName} size={104} className="wr-icon" />
        <span className="wr-weather">{weatherLabel(view)}</span>
        {view.hurricaneRevealed && <span className="wr-storm">本ラウンドで強制脱出！</span>}
      </div>
    </div>
  );
}

/** 天候の常時エフェクト。雨のライン表示は画面が見づらいので廃止し、天気はラウンド開始の大きな演出で示す。
 *  ここでは盤面を覆わない控えめな色味だけ（晴れの陽射し／嵐のうっすらした暗がり）にとどめる。 */
function WeatherFX({ view }: { view: PublicGameState }) {
  if (view.phase === 'lobby' || view.phase === 'gameover') return null;
  if (view.hurricaneRevealed) return <div className="wfx wfx-storm" aria-hidden />;
  if (view.currentPrecip > 0) return null; // 雨ラインは出さない（RoundSplash の演出で代替）
  return <div className="wfx wfx-sun" aria-hidden />;
}

interface Flight { key: string; icon: string; x: number; y: number; dx: number; dy: number; delay: number }
/** 飛ぶトークンの絵柄（icons.tsx のキー）。 */
const GAIN_ICON: Record<string, string> = { food: 'fish', water: 'water', wood: 'wood', card: 'card' };

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
      icon: GAIN_ICON[g.kind] ?? 'card',
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
          <span key={f.key} className="fly-token" style={style as CSSProperties}><GameIcon name={f.icon} size={28} /></span>
        );
      })}
    </div>
  );
}

/** 事件演出の絵柄（icons.tsx のキー）とスタイル。 */
const EV_META: Record<string, { ic: string; cls: string }> = {
  hurricane: { ic: 'wx-hurricane', cls: 'storm' },
  death: { ic: 'skull', cls: 'death' },
  escape: { ic: 'ship', cls: 'escape' },
  snake: { ic: 'snake', cls: 'snake' },
  seat: { ic: 'ship', cls: 'seat' },
};

/** 事件演出：画面フラッシュ＋シェイク＋大きな演出カード。 */
function EventFX({ view }: { view: PublicGameState }) {
  const e = [...view.log]
    .reverse()
    .find((x) => x.kind === 'death' || x.kind === 'escape' || x.kind === 'snake' || x.text.includes('ハリケーン') || x.text.includes('船に乗れる') || x.text.includes('座席が'));
  const [cur, setCur] = useState<{ id: number; kind: string; text: string } | null>(null);
  const seen = useRef(-1);
  useEffect(() => {
    if (!e || e.id === seen.current) return;
    seen.current = e.id;
    const kind = e.text.includes('ハリケーン') ? 'hurricane' : e.text.includes('船に乗れる') || e.text.includes('座席が') ? 'seat' : (e.kind ?? 'info');
    setCur({ id: e.id, kind, text: e.text });
    if (kind === 'death' || kind === 'snake' || kind === 'hurricane') {
      document.documentElement.classList.add('fx-shake');
      window.setTimeout(() => document.documentElement.classList.remove('fx-shake'), 460);
    }
    const t = window.setTimeout(() => setCur(null), kind === 'seat' ? 1300 : 2400);
    return () => window.clearTimeout(t);
  }, [e?.id]);
  if (!cur) return null;
  const meta = EV_META[cur.kind] ?? { ic: 'alert', cls: 'info' };
  // 自分の木集めのヘビは WoodSplash（一枚絵）が担当するので、カードは重ねずフラッシュのみにする。
  const woodSplashHandles =
    cur.kind === 'snake' &&
    view.lastDraw?.action === 'wood' &&
    view.lastDraw?.playerId === view.youId &&
    (!!ART['wood-bite'] || !!ART['wood-ok']);
  return (
    <>
      {cur.kind !== 'seat' && <div className={`fx-flash ${meta.cls}`} key={cur.id} />}
      {!woodSplashHandles && (
        <div className={`event-card ${meta.cls}`} key={`c${cur.id}`}>
          <GameIcon name={meta.ic} size={cur.kind === 'seat' ? 32 : 58} className="ev-ic" />
          <span className="ev-text">{shipText(cur.text)}</span>
        </div>
      )}
    </>
  );
}

function GameOver({ view, me, onLeave }: { view: PublicGameState; me?: PublicPlayer; onLeave: () => void }) {
  const escaped = view.players.filter((p) => p.escaped);
  const dead = view.players.filter((p) => !p.alive && !p.escaped);
  const sole = view.config.soleSurvivor;
  const youWon = sole ? !!me?.escaped && escaped.length === 1 : !!me?.escaped;
  const headline = sole
    ? escaped.length === 1 ? `単独生存：${escaped[0].name}` : escaped.length > 0 ? '脱出者あり（単独生存なし）' : '全滅'
    : escaped.length > 0 ? '脱出成功' : '全滅';
  const verdict = !me ? null : youWon ? (sole ? '単独生存、あなたの勝利！' : 'あなたは生き延びた！') : me.escaped ? '脱出したが独り占めできず…' : 'あなたは島に消えた…';
  const line = (p: PublicPlayer) => (
    <li key={p.id}>{p.name}{p.persona && <span className="reveal">（{PERSONA_INFO[p.persona].label}）</span>}</li>
  );
  // 結末の大きな挿絵（全員脱出/全滅、または自分の生死）。未提供のキーは近い絵にフォールバック。
  const allEscaped = escaped.length > 0 && dead.length === 0;
  const allDead = escaped.length === 0;
  const artKey = allEscaped ? 'res-all-survived'
    : allDead ? 'res-all-dead'
    : view.isSpectator ? (escaped.length > 0 ? 'res-all-survived' : 'res-all-dead')
    : me?.escaped ? 'res-survived' : 'res-died';
  const artUrl = ART[artKey]
    ?? (artKey === 'res-died' ? ART['res-all-dead'] : undefined)
    ?? (artKey === 'res-survived' ? ART['res-all-survived'] : undefined);
  return (
    <div className="overlay">
      <div className={`result ${view.isSpectator ? '' : youWon ? 'win' : 'lose'}`}>
        {artUrl && <img className="result-art" src={artUrl} alt="" />}
        <h2>{headline}</h2>
        {sole && <span className="tag spectate">ソロサバイバル</span>}
        {!view.isSpectator && verdict && <p className={`verdict ${youWon ? 'win' : 'lose'}`}>{verdict}</p>}
        {view.isSpectator && <p className="verdict">観戦お疲れさまでした。</p>}
        <div className="result-cols">
          <div><h4>脱出（{escaped.length}）</h4><ul>{escaped.map((p) => line(p))}{escaped.length === 0 && <li className="hint">なし</li>}</ul></div>
          <div><h4>島に消えた（{dead.length}）</h4><ul>{dead.map((p) => line(p))}{dead.length === 0 && <li className="hint">なし</li>}</ul></div>
        </div>
        <p className="hint">（カッコ内はAIの正体＝性格）</p>
        {/* 6人戦だと縦に長くなるので、この導線は結果カードの下端に貼り付けて必ず届くようにする */}
        <button className="btn primary block result-cta" onClick={onLeave}>新しいゲームへ</button>
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
