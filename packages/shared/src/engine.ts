import {
  BAG,
  DEFAULT_CONFIG,
  MAX_SEATS,
  PERMANENT_KINDS,
  RAFT_LOOP,
  RESOURCE_CAP,
  buildWeatherDeck,
  buildWreckageDeck,
  cardsDealtPerPlayer,
  drawBall,
  initialSupplies,
  isSnake,
} from './content.js';
import { Rng } from './rng.js';
import type {
  ActionType,
  BotPersona,
  Card,
  CardKind,
  GainKind,
  GameConfig,
  GameState,
  Player,
  VoteReason,
} from './types.js';

const clone = <T>(v: T): T => structuredClone(v);

// ===== 基本ヘルパー =====
export function alivePlayers(s: GameState): Player[] {
  return s.players.filter((p) => p.alive && !p.escaped);
}
export function aliveCount(s: GameState): number {
  return alivePlayers(s).length;
}
function find(s: GameState, id: string): Player | undefined {
  return s.players.find((p) => p.id === id);
}
function hasCard(p: Player, kind: CardKind): boolean {
  return p.hand.some((c) => c.kind === kind);
}
/** 永続カードは「使用(発動)」して revealed に入って初めて効果を持つ（所持だけでは無効）。 */
export function hasPermanent(p: Player, kind: CardKind): boolean {
  return (p.revealed ?? []).includes(kind);
}
/** 永続カードを「使用済み（公開）」として記録（銃など、手札に残すもの用）。 */
function reveal(p: Player, kind: CardKind): void {
  if (hasCard(p, kind) && !p.revealed.includes(kind)) p.revealed.push(kind);
}
/** 資源・カード獲得を演出用に記録（飛んでいくトークン）。 */
function recordGain(s: GameState, playerId: string, kind: GainKind, amount: number): void {
  if (amount <= 0) return;
  s.eventSeq += 1;
  s.lastGain = { id: s.eventSeq, playerId, kind, amount };
}
function clampSupply(n: number): number {
  return Math.max(0, Math.min(RESOURCE_CAP, n));
}
function pushLog(s: GameState, text: string, kind?: GameState['log'][number]['kind'], playerId?: string): void {
  s.log.push({ id: s.logSeq++, round: s.round, text, kind, playerId });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}
export function currentActorId(s: GameState): string | null {
  if (s.phase !== 'action') return null;
  const p = s.players[s.currentActorIndex];
  return p && p.alive && !p.escaped ? p.id : null;
}
export function canEscapeAll(s: GameState): boolean {
  const need = aliveCount(s);
  return need > 0 && s.raftSeats >= need && s.food >= need && s.water >= need;
}

/** index から右回り（増加方向）で最初の生存者 index */
function nextAliveIndex(s: GameState, from: number): number {
  const n = s.players.length;
  for (let i = 0; i < n; i++) {
    const idx = (from + i) % n;
    const p = s.players[idx];
    if (p.alive && !p.escaped) return idx;
  }
  return from % n;
}

function addWood(s: GameState, n: number): void {
  let prog = s.raftProgress + n;
  while (prog >= RAFT_LOOP && s.raftSeats < MAX_SEATS) {
    prog -= RAFT_LOOP;
    s.raftSeats += 1;
    pushLog(s, `🛶 船に乗れる人数が1人ぶん増えた！（${s.raftSeats}人）`, 'good');
  }
  s.raftProgress = s.raftSeats >= MAX_SEATS ? 0 : prog;
}

// ===== ロビー =====
type NewPlayer = Pick<Player, 'id' | 'name' | 'isBot'> & { botPersona?: BotPersona };

function newPlayer(p: NewPlayer): Player {
  return {
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    connected: true,
    alive: true,
    escaped: false,
    sick: false,
    resting: false,
    hand: [],
    acted: false,
    revealed: [],
    botPersona: p.botPersona,
  };
}

export function createGame(initial: NewPlayer[], config: Partial<GameConfig> = {}): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    phase: 'lobby',
    round: 0,
    players: initial.map(newPlayer),
    food: 0,
    water: 0,
    raftSeats: 0,
    raftProgress: 0,
    weatherDeck: [],
    currentPrecip: 0,
    hurricaneRevealed: false,
    deck: [],
    firstPlayerIndex: 0,
    currentActorIndex: 0,
    pendingEliminations: 0,
    rngState: cfg.seed,
    cardSeq: 0,
    eventSeq: 0,
    log: [],
    logSeq: 0,
    winners: [],
    config: cfg,
  };
}

export function addPlayer(s: GameState, p: NewPlayer): GameState {
  if (s.phase !== 'lobby') return s;
  const d = clone(s);
  d.players.push(newPlayer(p));
  return d;
}
export function removePlayer(s: GameState, id: string): GameState {
  if (s.phase !== 'lobby') return s;
  const d = clone(s);
  d.players = d.players.filter((p) => p.id !== id);
  if (d.firstPlayerIndex >= d.players.length) d.firstPlayerIndex = 0;
  return d;
}
export function setConnected(s: GameState, id: string, connected: boolean): GameState {
  const d = clone(s);
  const p = find(d, id);
  if (p) p.connected = connected;
  return d;
}
export function setConfig(s: GameState, partial: Partial<GameConfig>): GameState {
  if (s.phase !== 'lobby') return s;
  const d = clone(s);
  d.config = { ...d.config, ...partial };
  return d;
}

// ===== 開始 =====
export function startGame(s: GameState): GameState {
  if (s.phase !== 'lobby') return s;
  const d = clone(s);
  const n = d.players.length;
  const rng = new Rng(d.rngState);
  const sup = initialSupplies(n);
  d.food = sup.food;
  d.water = sup.water;
  d.weatherDeck = buildWeatherDeck(rng);
  const { deck, nextSeq } = buildWreckageDeck(rng, d.cardSeq);
  d.deck = deck;
  d.cardSeq = nextSeq;
  const per = cardsDealtPerPlayer(n);
  for (const p of d.players) {
    for (let i = 0; i < per && d.deck.length; i++) p.hand.push(d.deck.shift() as Card);
  }
  d.firstPlayerIndex = 0;
  d.rngState = rng.state;
  pushLog(d, `${n}人が無人島に漂着。水${d.water}・食料${d.food}で始まる。各自カード${per}枚。`, 'info');
  return beginRound(d);
}

function beginRound(d: GameState): GameState {
  d.round += 1;
  // 親の移動（初回スキップ）
  if (d.round > 1) {
    if (d.nextParentId) {
      const idx = d.players.findIndex((p) => p.id === d.nextParentId);
      d.firstPlayerIndex = idx >= 0 ? nextAliveIndex(d, idx) : nextAliveIndex(d, d.firstPlayerIndex + 1);
      d.nextParentId = null;
    } else {
      d.firstPlayerIndex = nextAliveIndex(d, d.firstPlayerIndex + 1);
    }
  } else {
    d.firstPlayerIndex = nextAliveIndex(d, d.firstPlayerIndex);
  }
  // 病気→休みへ繰り越し
  for (const p of d.players) {
    if (p.sick) {
      p.resting = true;
      p.sick = false;
    }
    p.acted = false;
    p.vote = undefined;
    p.escapeChoice = undefined;
  }
  d.fruitUsed = false;
  d.lastWoodGain = undefined;
  // 天候公開
  const card = d.weatherDeck.shift();
  if (card) {
    d.currentPrecip = card.precip;
    if (card.hurricane) {
      d.hurricaneRevealed = true;
      pushLog(d, `${d.round}ラウンド：🌀ハリケーン到来！今ラウンド終了時に必ず脱出。`, 'bad');
    } else {
      pushLog(d, `${d.round}ラウンド：天候の降水量 ${d.currentPrecip}（水汲み量）。`, 'info');
    }
  }
  d.phase = 'action';
  d.currentActorIndex = d.firstPlayerIndex;
  return prepareActor(d);
}

/** 休み/行動済みをスキップし、全員行動済みなら生存フェイズへ */
function prepareActor(d: GameState): GameState {
  const n = d.players.length;
  for (let i = 0; i < n + 1; i++) {
    const p = d.players[d.currentActorIndex];
    if (!p || !p.alive || p.escaped || p.acted) {
      // 次へ
    } else if (p.resting) {
      p.acted = true;
      pushLog(d, `${p.name} はヘビの毒で動けない（休み）。`, 'bad', p.id);
    } else {
      return d; // この人の手番
    }
    // 全員行動済み？
    if (alivePlayers(d).every((x) => x.acted)) return enterSurvival(d);
    d.currentActorIndex = nextAliveIndex(d, d.currentActorIndex + 1);
  }
  return enterSurvival(d);
}

// ===== 行動フェイズ =====
export function takeAction(s: GameState, playerId: string, action: ActionType, woodPush = 0): GameState {
  if (s.phase !== 'action') return s;
  if (currentActorId(s) !== playerId) return s;
  const d = clone(s);
  const p = find(d, playerId)!;
  const rng = new Rng(d.rngState);
  d.lastWoodGain = undefined;

  switch (action) {
    case 'fish': {
      const ball = drawBall(rng);
      if (isSnake(ball)) {
        // 釣りの黒玉は「不漁」。噛まれて病気になるのは木集めのみ。
        d.lastDraw = { playerId, balls: [ball], action };
        pushLog(d, `${p.name} は釣り：不漁で1匹も釣れなかった。`, 'bad', playerId);
      } else {
        const gain = ball.fish * (hasPermanent(p, 'fishing_rod') ? 2 : 1);
        d.food = clampSupply(d.food + gain);
        d.lastDraw = { playerId, balls: [ball], action };
        recordGain(d, playerId, 'food', gain);
        pushLog(d, `${p.name} は釣り：魚 ${ball.fish}${hasPermanent(p, 'fishing_rod') ? '×2' : ''} で食料 +${gain}。`, 'good', playerId);
      }
      break;
    }
    case 'water': {
      const mult = hasPermanent(p, 'canteen') ? 2 : 1;
      const gain = d.currentPrecip * mult;
      if (gain <= 0) {
        pushLog(d, `${p.name} は水汲み：雨がなく汲めなかった。`, 'info', playerId);
      } else {
        d.water = clampSupply(d.water + gain);
        recordGain(d, playerId, 'water', gain);
        pushLog(d, `${p.name} は水汲み：水 +${gain}（降水量${d.currentPrecip}${mult > 1 ? '×2' : ''}）。`, 'good', playerId);
      }
      break;
    }
    case 'wood': {
      const base = 1 + (hasPermanent(p, 'axe') ? 1 : 0);
      addWood(d, base);
      let gained = base;
      const push = Math.max(0, Math.min(5, Math.floor(woodPush)));
      if (push > 0) {
        const balls = Array.from({ length: push }, () => drawBall(rng));
        d.lastDraw = { playerId, balls, action };
        if (balls.some(isSnake)) {
          p.sick = true;
          pushLog(d, `${p.name} は木集めで${push}本引いて🐍ヘビに噛まれた！追加分は失ったが確定分の木+${base}は確保（病気で次R休み）。`, 'snake', playerId);
        } else {
          addWood(d, push);
          gained += push;
          pushLog(d, `${p.name} は木集めで${push}本引き、木 +${gained}（無事）。`, 'good', playerId);
        }
      } else {
        d.lastDraw = { playerId, balls: [], action };
        pushLog(d, `${p.name} は木を集めた（+${base}）。`, 'good', playerId);
      }
      d.lastWoodGain = { playerId, amount: gained };
      recordGain(d, playerId, 'wood', gained);
      break;
    }
    case 'search': {
      const card = d.deck.shift();
      if (card) {
        p.hand.push(card);
        recordGain(d, playerId, 'card', 1);
        pushLog(d, `${p.name} は難破船を漁り、カードを1枚得た。`, 'card', playerId);
      } else {
        pushLog(d, `${p.name} は難破船を漁ったが山札は尽きていた。`, 'info', playerId);
      }
      break;
    }
  }

  p.acted = true;
  d.rngState = rng.state;
  d.currentActorIndex = nextAliveIndex(d, d.currentActorIndex + 1);
  return prepareActor(d);
}

// ===== 生存フェイズ =====
function enterSurvival(d: GameState): GameState {
  // 休み解除（このラウンドの投票には参加可）
  for (const p of d.players) p.resting = false;
  // 生存ウィンドウ：カード補填のため acted をリセット（パスで true）
  for (const p of alivePlayers(d)) p.acted = false;
  d.phase = 'survival';
  pushLog(d, `生存チェック：生存者${aliveCount(d)}人が水1・食料1を消費。`, 'info');
  return d;
}

/** 生存ウィンドウで「これ以上カードを使わない」宣言 */
export function passSurvival(s: GameState, playerId: string): GameState {
  if (s.phase !== 'survival') return s;
  const d = clone(s);
  const p = find(d, playerId);
  if (p && p.alive && !p.escaped) p.acted = true;
  return d;
}

export function isSurvivalReady(s: GameState): boolean {
  return s.phase === 'survival' && alivePlayers(s).every((p) => p.acted);
}

export function resolveSurvival(s: GameState): GameState {
  if (s.phase !== 'survival') return s;
  return consumeWater(clone(s));
}

function consumeWater(d: GameState): GameState {
  if (d.fruitUsed) return afterFruit(d);
  const need = aliveCount(d);
  if (d.water >= need) {
    d.water -= need;
    return consumeFood(d);
  }
  // 開始時0：投票なし。該当資源カードを出せた者だけ生存、他は死亡。
  if (d.water === 0) {
    cardOrDie(d, 'water');
    if (aliveCount(d) <= 0) {
      pushLog(d, `水が尽き、生存者は全員倒れた……`, 'death');
      d.phase = 'gameover';
      return d;
    }
    return consumeFood(d);
  }
  const deficit = need - d.water;
  d.water = 0;
  d.pendingEliminations = deficit;
  d.voteReason = 'water';
  pushLog(d, `水が${deficit}人分足りない。${deficit}人を投票で決める。`, 'bad');
  return startVote(d);
}

function consumeFood(d: GameState): GameState {
  if (d.fruitUsed) return afterFruit(d);
  const need = aliveCount(d);
  if (d.food >= need) {
    d.food -= need;
    return endRoundCheck(d);
  }
  if (d.food === 0) {
    cardOrDie(d, 'food');
    if (aliveCount(d) <= 0) {
      pushLog(d, `食料が尽き、生存者は全員倒れた……`, 'death');
      d.phase = 'gameover';
      return d;
    }
    return endRoundCheck(d);
  }
  const deficit = need - d.food;
  d.food = 0;
  d.pendingEliminations = deficit;
  d.voteReason = 'food';
  pushLog(d, `食料が${deficit}人分足りない。${deficit}人を投票で決める。`, 'bad');
  return startVote(d);
}

function afterFruit(d: GameState): GameState {
  // フルーツバスケット：誰も死なず、消費なし（両カウンタは0のまま）
  pushLog(d, `フルーツバスケットにより、このラウンドは誰も飢え死にしない。`, 'good');
  return endRoundCheck(d);
}

// ===== 投票 =====
function eligibleVoters(d: GameState): Player[] {
  return alivePlayers(d).filter((p) => !p.sick);
}
function startVote(d: GameState): GameState {
  for (const p of d.players) {
    p.vote = undefined;
    p.voteSafe = false; // 各投票ごとに自己救済の保護はリセット
    (p as { votesReceived?: number }).votesReceived = undefined;
  }
  d.phase = 'vote';
  return d;
}
export function castVote(s: GameState, playerId: string, targetId: string | null): GameState {
  if (s.phase !== 'vote') return s;
  const d = clone(s);
  const voter = find(d, playerId);
  if (!voter || !voter.alive || voter.escaped || voter.sick) return s;
  let valid: string | null = null;
  if (targetId) {
    const t = find(d, targetId);
    if (t && t.alive && !t.escaped && t.id !== playerId) valid = targetId;
  }
  voter.vote = valid;
  return d;
}
export function isVoteReady(s: GameState): boolean {
  return s.phase === 'vote' && eligibleVoters(s).every((p) => p.vote !== undefined);
}

export function resolveVote(s: GameState): GameState {
  if (s.phase !== 'vote') return s;
  const d = clone(s);
  // 集計
  const tally = new Map<string, number>();
  for (const v of eligibleVoters(d)) if (v.vote) tally.set(v.vote, (tally.get(v.vote) ?? 0) + 1);
  for (const p of d.players) (p as { votesReceived?: number }).votesReceived = tally.get(p.id) ?? 0;

  const candidates = alivePlayers(d);
  let max = -1;
  for (const p of candidates) max = Math.max(max, tally.get(p.id) ?? 0);
  let topped = candidates.filter((p) => (tally.get(p.id) ?? 0) === max && max > 0);

  let victim: Player | undefined;
  if (topped.length === 1) {
    victim = topped[0];
  } else {
    // 同票/無投票 → 親が裁定（親が脱落していれば右隣の生存者）
    const parent = d.players[nextAliveIndex(d, d.firstPlayerIndex)];
    const pool = topped.length > 0 ? topped : candidates.filter((p) => p.id !== parent?.id);
    if (parent?.vote && pool.some((p) => p.id === parent.vote)) {
      victim = pool.find((p) => p.id === parent.vote);
    } else {
      victim = [...pool].sort((a, b) => a.hand.length - b.hand.length || d.players.indexOf(a) - d.players.indexOf(b))[0];
    }
  }
  if (!victim) {
    d.pendingEliminations = 0;
    return afterVoteBatch(d);
  }

  // 自己救済：投票中に自分へ資源カードを使って保護済みなら追放を免れる（プールには入らない）。
  // 明示的に使っていなくても、該当資源を持っていれば自動でしのぐ（従来挙動のフォールバック）。
  const reason = d.voteReason;
  const saveKind = reason === 'water' ? resourceWaterCard(victim) : resourceFoodCard(victim);
  if (victim.voteSafe) {
    pushLog(d, `${victim.name} は配給を切って身を守り、追放を免れた。`, 'card', victim.id);
    d.pendingEliminations -= 1;
  } else if (saveKind) {
    consumeCardForSelf(victim, saveKind);
    pushLog(d, `${victim.name} は${cardName(saveKind)}を切り、追放を免れた。`, 'card', victim.id);
    d.pendingEliminations -= 1;
  } else {
    const votes = victim.votesReceived ?? 0;
    killPlayer(d, victim);
    pushLog(d, `${victim.name} は${votes}票を集め、海へ突き落とされた……`, 'death', victim.id);
    d.pendingEliminations -= 1;
  }

  if (aliveCount(d) <= 0) {
    d.phase = 'gameover';
    pushLog(d, `生存者がいなくなった……全滅。`, 'death');
    return d;
  }
  if (d.pendingEliminations > 0) return startVote(d);
  return afterVoteBatch(d);
}

function afterVoteBatch(d: GameState): GameState {
  const reason = d.voteReason;
  d.voteReason = undefined;
  if (reason === 'water') return consumeFood(d);
  if (reason === 'food') return endRoundCheck(d);
  if (reason === 'hurricane') return resolveHurricaneEscape(d);
  return endRoundCheck(d);
}

function resourceWaterCard(p: Player): CardKind | undefined {
  for (const k of ['water_bottle', 'dirty_water'] as CardKind[]) if (hasCard(p, k)) return k;
  return undefined;
}
function resourceFoodCard(p: Player): CardKind | undefined {
  for (const k of ['sardine_can', 'sandwich', 'rotten_fish'] as CardKind[]) if (hasCard(p, k)) return k;
  return undefined;
}

function removeOneCard(p: Player, kind: CardKind): void {
  const i = p.hand.findIndex((c) => c.kind === kind);
  if (i >= 0) p.hand.splice(i, 1);
}

/** 資源カードをプールへ反映（自己救済・生存ウィンドウ共通） */
function applyResourceCard(d: GameState, p: Player, kind: CardKind): void {
  switch (kind) {
    case 'water_bottle':
      d.water = clampSupply(d.water + 1);
      break;
    case 'dirty_water':
      d.water = clampSupply(d.water + 1);
      p.sick = true;
      break;
    case 'sandwich':
      d.food = clampSupply(d.food + 1);
      break;
    case 'sardine_can':
      d.food = clampSupply(d.food + 3);
      break;
    case 'rotten_fish':
      d.food = clampSupply(d.food + 1);
      p.sick = true;
      break;
    case 'fruit_basket':
      d.food = 0;
      d.water = 0;
      d.fruitUsed = true;
      break;
    default:
      return;
  }
  removeOneCard(p, kind);
}

/** 自己救済：資源カードを自分の配給として消費（プールには入れない）。 */
function consumeCardForSelf(p: Player, kind: CardKind): void {
  removeOneCard(p, kind);
  if (kind === 'dirty_water' || kind === 'rotten_fish') p.sick = true;
}

/** 資源0で迎えたとき：該当カードを出せた者だけ生存、他は死亡（投票なし）。 */
function cardOrDie(d: GameState, reason: 'water' | 'food'): void {
  const label = reason === 'water' ? '渇き' : '飢え';
  for (const p of alivePlayers(d)) {
    const k = reason === 'water' ? resourceWaterCard(p) : resourceFoodCard(p);
    if (k) {
      consumeCardForSelf(p, k);
      pushLog(d, `${p.name} は手持ちの${cardName(k)}で${label}をしのいだ。`, 'card', p.id);
    } else {
      killPlayer(d, p);
      pushLog(d, `${p.name} は${label}で倒れた……`, 'death', p.id);
    }
  }
}

/** 脱落処理：手札を両隣へ交互配布（銃も含め場に残す）。ログは呼び出し側。 */
function killPlayer(d: GameState, victim: Player): void {
  victim.alive = false;
  const idx = d.players.indexOf(victim);
  const left = findNeighbor(d, idx, -1);
  const right = findNeighbor(d, idx, +1);
  const targets = [right, left].filter(Boolean) as Player[];
  const hand = victim.hand;
  victim.hand = [];
  if (targets.length === 0) return;
  hand.forEach((c, i) => targets[i % targets.length].hand.push(c));
}
function findNeighbor(d: GameState, idx: number, dir: number): Player | undefined {
  const n = d.players.length;
  for (let i = 1; i <= n; i++) {
    const p = d.players[(idx + dir * i + n * i) % n];
    if (p && p.alive && !p.escaped) return p;
  }
  return undefined;
}

// ===== カードプレイ（手番＋生存/投票ウィンドウ） =====
export function playCard(s: GameState, playerId: string, cardId: string, targetId?: string | null): GameState {
  const p0 = find(s, playerId);
  if (!p0 || !p0.alive || p0.escaped || p0.resting) return s;
  const card = p0.hand.find((c) => c.id === cardId);
  if (!card) return s;
  // 病気中はカード不可（自己救済は自動処理のため除外）
  if (p0.sick && card.kind !== 'serum') return s;
  // 弾は単体では使えない（銃と併用）
  if (card.kind === 'bullet') return s;

  const d = clone(s);
  const p = find(d, playerId)!;
  const c = p.hand.find((x) => x.id === cardId)!;

  switch (c.kind) {
    case 'water_bottle':
    case 'dirty_water':
    case 'sandwich':
    case 'sardine_can':
    case 'rotten_fish':
    case 'fruit_basket': {
      if (d.phase !== 'survival' && d.phase !== 'action' && d.phase !== 'vote') return s;
      if (d.phase === 'vote') {
        // 投票中：自分の配給として消費し「自分だけ」追放を免れる（プールには入れない）。
        // 救えるのは投票理由に合う資源のみ（水不足→水カード／食料不足・ハリケーン→食料カード）。
        const reason = d.voteReason;
        const water = c.kind === 'water_bottle' || c.kind === 'dirty_water';
        const food = c.kind === 'sandwich' || c.kind === 'sardine_can' || c.kind === 'rotten_fish';
        const matches = reason === 'water' ? water : food; // food/hurricane は食料カード
        if (!matches) return s;
        consumeCardForSelf(p, c.kind);
        p.voteSafe = true;
        pushLog(d, `${p.name} は ${cardName(c.kind)} を自分の配給にして身を守った。`, 'card', playerId);
      } else {
        applyResourceCard(d, p, c.kind);
        pushLog(d, `${p.name} は ${cardName(c.kind)} を使った（みんなの蓄えに加えた）。`, 'card', playerId);
      }
      break;
    }
    case 'canteen':
    case 'fishing_rod':
    case 'axe':
    case 'crystal_ball': {
      // 受動の永続：使って初めて効果が発動し、公開される（以後ずっと有効）。
      if (d.phase !== 'action') return s;
      if (p.revealed.includes(c.kind)) return s;
      p.revealed.push(c.kind);
      removeOneCard(p, c.kind);
      pushLog(d, `${p.name} は ${permName(c.kind)} を使った（以後ずっと効果が続く）。`, 'card', playerId);
      break;
    }
    case 'junk': {
      // 無用品：効果は無いが「使った（手放した）」ことにできる＝はったり。
      if (d.phase !== 'action') return s;
      removeOneCard(p, 'junk');
      pushLog(d, `${p.name} は無用品を手放した（はったり）。`, 'card', playerId);
      break;
    }
    case 'serum': {
      if (!p.sick) return s;
      p.sick = false;
      if (d.lastWoodGain?.playerId === playerId && d.lastWoodGain.amount > 0) {
        d.raftProgress -= d.lastWoodGain.amount;
        while (d.raftProgress < 0 && d.raftSeats > 0) {
          d.raftSeats -= 1;
          d.raftProgress += RAFT_LOOP;
        }
        if (d.raftProgress < 0) d.raftProgress = 0;
        d.lastWoodGain = undefined;
      }
      removeOneCard(p, 'serum');
      pushLog(d, `${p.name} は血清で毒を治した（その回の木は失う）。`, 'card', playerId);
      break;
    }
    case 'voodoo': {
      if (d.phase !== 'action') return s;
      const t = targetId ? find(d, targetId) : undefined;
      if (!t || t.alive || t.escaped) return s;
      t.alive = true;
      t.sick = false;
      t.resting = false;
      removeOneCard(p, 'voodoo');
      pushLog(d, `${p.name} はブードゥー人形で ${t.name} を蘇らせた！`, 'card', playerId);
      break;
    }
    case 'sleeping_pills': {
      if (d.phase !== 'action') return s;
      const rng = new Rng(d.rngState + 7);
      const victims = alivePlayers(d).filter((x) => x.id !== playerId && x.hand.length > 0);
      const chosen = rng.shuffle(victims).slice(0, 3);
      for (const v of chosen) {
        const card2 = rng.pick(v.hand);
        v.hand = v.hand.filter((x) => x.id !== card2.id);
        p.hand.push(card2);
      }
      d.rngState = rng.state;
      removeOneCard(p, 'sleeping_pills');
      pushLog(d, `${p.name} は睡眠薬で${chosen.length}人からカードを奪った。`, 'card', playerId);
      break;
    }
    case 'alarm_clock': {
      if (d.phase !== 'action') return s;
      if (targetId && find(d, targetId)) d.nextParentId = targetId;
      removeOneCard(p, 'alarm_clock');
      pushLog(d, `${p.name} は目覚まし時計で次の親を指名した。`, 'card', playerId);
      break;
    }
    case 'gun': {
      // 弾が必要
      if (!hasCard(p, 'bullet')) return s;
      const t = targetId ? find(d, targetId) : undefined;
      if (!t || !t.alive || t.escaped || t.id === playerId) return s;
      removeOneCard(p, 'bullet');
      reveal(p, 'gun');
      // 撃った側が被害者の手札を得る
      for (const card2 of t.hand) p.hand.push(card2);
      t.hand = [];
      t.alive = false;
      pushLog(d, `${p.name} は ${t.name} を銃で撃った！所持品を奪った。`, 'death', t.id);
      // 投票/生存中の射殺で人数が減る → 進行を再評価
      if (d.phase === 'vote' && d.pendingEliminations > 0) {
        d.pendingEliminations = Math.max(0, d.pendingEliminations - 1);
        if (aliveCount(d) <= 0) {
          d.phase = 'gameover';
          return d;
        }
        if (d.pendingEliminations === 0) return afterVoteBatch(d);
        return startVote(d);
      }
      break;
    }
    default:
      return s;
  }
  return d;
}

function cardName(kind: CardKind): string {
  const map: Partial<Record<CardKind, string>> = {
    water_bottle: '水ボトル',
    dirty_water: '汚れた水',
    sandwich: 'サンドイッチ',
    sardine_can: 'イワシ缶',
    rotten_fish: '腐った魚',
    fruit_basket: 'フルーツバスケット',
  };
  return map[kind] ?? kind;
}
function permName(kind: CardKind): string {
  const map: Partial<Record<CardKind, string>> = {
    canteen: '水筒',
    fishing_rod: '釣り竿',
    axe: '斧',
    crystal_ball: '水晶玉',
    gun: '銃',
  };
  return map[kind] ?? kind;
}

// ===== ラウンド終了・脱出 =====
function endRoundCheck(d: GameState): GameState {
  const need = aliveCount(d);
  if (need <= 0) {
    d.phase = 'gameover';
    pushLog(d, `全滅。誰も島を出られなかった。`, 'death');
    return d;
  }
  if (d.hurricaneRevealed) {
    const boardable = Math.min(d.raftSeats, d.food, d.water);
    if (boardable >= need) return doEscape(d, alivePlayers(d));
    if (boardable <= 0) {
      for (const p of alivePlayers(d)) p.alive = false;
      pushLog(d, `ハリケーンに飲まれ、誰も脱出できなかった……`, 'death');
      d.phase = 'gameover';
      return d;
    }
    d.pendingEliminations = need - boardable;
    d.voteReason = 'hurricane';
    pushLog(d, `ハリケーン：筏に乗れるのは${boardable}人。${d.pendingEliminations}人を投票で決める。`, 'bad');
    return startVote(d);
  }
  // 通常ラウンド：脱出可能なら任意脱出の決断へ
  if (canEscapeAll(d)) {
    for (const p of d.players) p.escapeChoice = undefined;
    d.phase = 'escape';
    pushLog(d, `脱出の条件を満たした（船${d.raftSeats}/必要${need}、補給も十分）。出航するか投票。`, 'good');
    return d;
  }
  return beginRound(d);
}

function resolveHurricaneEscape(d: GameState): GameState {
  // 余剰を削った後、乗れる全員が脱出
  return doEscape(d, alivePlayers(d));
}

export function setEscapeChoice(s: GameState, playerId: string, leave: boolean): GameState {
  if (s.phase !== 'escape') return s;
  const d = clone(s);
  const p = find(d, playerId);
  if (p && p.alive && !p.escaped) p.escapeChoice = leave;
  return d;
}
export function isEscapeReady(s: GameState): boolean {
  return s.phase === 'escape' && alivePlayers(s).every((p) => p.escapeChoice !== undefined);
}
export function resolveEscape(s: GameState): GameState {
  if (s.phase !== 'escape') return s;
  const d = clone(s);
  const voters = alivePlayers(d);
  const leave = voters.filter((p) => p.escapeChoice === true).length;
  if (leave > voters.length - leave) {
    pushLog(d, `多数決で出航が決まった。`, 'good');
    return doEscape(d, voters);
  }
  pushLog(d, `出航は見送られた。島でもう1ラウンド。`, 'info');
  return beginRound(d);
}

function doEscape(d: GameState, survivors: Player[]): GameState {
  for (const p of survivors) {
    p.escaped = true;
    d.winners.push(p.id);
  }
  pushLog(d, `${survivors.length}人が筏で島を脱出した！🛶`, 'escape');
  d.phase = 'gameover';
  return d;
}

// ===== サーバ進行用 =====
export type AwaitKind = 'action' | 'survival' | 'vote' | 'escape' | null;
export function awaiting(s: GameState): AwaitKind {
  if (s.phase === 'action') return 'action';
  if (s.phase === 'survival') return 'survival';
  if (s.phase === 'vote') return 'vote';
  if (s.phase === 'escape') return 'escape';
  return null;
}
