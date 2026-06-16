import {
  DEFAULT_CONFIG,
  FISH_RANGE,
  ITEM_DRAW_PROB,
  ITEM_WEIGHTS,
  RAIN_PROB,
  SEARCH_RANGE,
  WATER_YIELD,
  WOOD_PER_ACTION,
  raftCapacity,
} from './content.js';
import { Rng } from './rng.js';
import {
  PERMANENT_ITEMS,
  type ActionType,
  type BotPersona,
  type GameConfig,
  type GameState,
  type ItemKind,
  type Player,
  type Phase,
  type WeatherType,
} from './types.js';

type NewPlayerInput = Pick<Player, 'id' | 'name' | 'isBot'> & { botPersona?: BotPersona };

// ===== 小さなヘルパー =====

const clone = <T>(v: T): T => structuredClone(v);

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.alive && !p.escaped);
}

export function aliveCount(state: GameState): number {
  return alivePlayers(state).length;
}

export function getCapacity(state: GameState): number {
  return raftCapacity(state.wood, state.config);
}

export function isFinalDay(state: GameState): boolean {
  return state.stormIn <= 0;
}

function findPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

function pushLog(
  state: GameState,
  text: string,
  kind?: 'info' | 'good' | 'bad' | 'death' | 'escape',
  playerId?: string,
): void {
  state.log.push({ id: state.logSeq++, day: state.day, text, kind, playerId });
  // ログは直近 200 件に制限
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

// ===== ロビー =====

export function createGame(
  initialPlayers: NewPlayerInput[],
  config: Partial<GameConfig> = {},
): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    phase: 'lobby',
    day: 0,
    players: initialPlayers.map((p) => newPlayer(p)),
    food: 0,
    water: 0,
    wood: 0,
    stormIn: cfg.initialStormIn,
    weather: null,
    firstPlayerIndex: 0,
    shortage: 0,
    rngState: cfg.seed,
    itemSeq: 0,
    log: [],
    logSeq: 0,
    winners: [],
    config: cfg,
  };
}

function newPlayer(p: NewPlayerInput): Player {
  return {
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    connected: true,
    alive: true,
    escaped: false,
    sick: false,
    hand: { food: 0, water: 0 },
    items: [],
    botPersona: p.botPersona,
  };
}

function hasItem(p: Player, kind: ItemKind): boolean {
  return p.items.some((it) => it.kind === kind);
}

function drawItemKind(rng: Rng): ItemKind {
  const entries = Object.entries(ITEM_WEIGHTS) as [ItemKind, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng.next() * total;
  for (const [kind, w] of entries) {
    r -= w;
    if (r < 0) return kind;
  }
  return entries[entries.length - 1][0];
}

export function addPlayer(state: GameState, p: NewPlayerInput): GameState {
  if (state.phase !== 'lobby') return state;
  const s = clone(state);
  s.players.push(newPlayer(p));
  return s;
}

/** ロビー中のみ、設定（ソロサバイバル等）を変更する。 */
export function setConfig(state: GameState, partial: Partial<GameConfig>): GameState {
  if (state.phase !== 'lobby') return state;
  const s = clone(state);
  s.config = { ...s.config, ...partial };
  return s;
}

export function removePlayer(state: GameState, id: string): GameState {
  if (state.phase !== 'lobby') return state;
  const s = clone(state);
  s.players = s.players.filter((p) => p.id !== id);
  if (s.firstPlayerIndex >= s.players.length) s.firstPlayerIndex = 0;
  return s;
}

export function setConnected(state: GameState, id: string, connected: boolean): GameState {
  const s = clone(state);
  const p = findPlayer(s, id);
  if (p) p.connected = connected;
  return s;
}

// ===== 開始 / 1日の開始 =====

export function startGame(state: GameState): GameState {
  if (state.phase !== 'lobby') return state;
  const s = clone(state);
  pushLog(s, `${s.players.length}人の生存者が無人島に漂着した。嵐が来るまで${s.config.initialStormIn}日。`, 'info');
  return beginDay(s);
}

function beginDay(state: GameState): GameState {
  const s = state; // beginDay は常に clone 済みの draft に対して呼ぶ
  s.day += 1;
  // stormIn は day から再計算（ドリフト防止）
  s.stormIn = s.config.initialStormIn - (s.day - 1);
  s.shortage = 0;

  // 病人は回復し、その日の選択をリセット
  for (const p of s.players) {
    p.pendingAction = undefined;
    p.contribute = undefined;
    p.vote = undefined;
    p.escapeVote = undefined;
    p.votesReceived = undefined;
    p.voteImmune = false;
    if (p.alive) p.sick = false;
  }

  const rng = new Rng(s.rngState);
  let weather: WeatherType;
  if (s.stormIn <= 0) weather = 'storm';
  else weather = rng.chance(RAIN_PROB) ? 'rain' : 'sunny';
  s.rngState = rng.state;
  s.weather = weather;

  const label = weather === 'storm' ? '嵐' : weather === 'rain' ? '雨' : '晴れ';
  if (weather === 'storm') {
    pushLog(s, `${s.day}日目。ついに嵐が来た。今日中に脱出できなければ全滅だ。`, 'bad');
  } else {
    pushLog(s, `${s.day}日目（天候: ${label}）。嵐まであと${s.stormIn}日。`, 'info');
  }

  s.phase = 'action';
  return s;
}

// ===== 行動フェイズ =====

export function chooseAction(state: GameState, playerId: string, action: ActionType): GameState {
  if (state.phase !== 'action') return state;
  const s = clone(state);
  const p = findPlayer(s, playerId);
  if (!p || !p.alive || p.escaped) return state;
  // 病人は行動できない（自動で待機）
  if (p.sick) {
    p.pendingAction = 'fish';
    return s;
  }
  p.pendingAction = action;
  return s;
}

export function resolveActions(state: GameState): GameState {
  if (state.phase !== 'action') return state;
  const s = clone(state);
  const rng = new Rng(s.rngState);

  for (const p of alivePlayers(s)) {
    const action: ActionType = p.sick ? 'fish' : p.pendingAction ?? 'fish';
    if (p.sick) {
      pushLog(s, `${p.name} はヘビの毒で動けなかった。`, 'bad', p.id);
      continue;
    }
    switch (action) {
      case 'fish': {
        const n = rng.int(FISH_RANGE[0], FISH_RANGE[1]) + (hasItem(p, 'rod') ? 1 : 0);
        s.food += n;
        pushLog(s, `${p.name} は魚を釣った（食料 +${n}）。`, 'good', p.id);
        break;
      }
      case 'water': {
        const [lo, hi] = WATER_YIELD[s.weather ?? 'sunny'];
        const n = rng.int(lo, hi) + (hasItem(p, 'filter') ? 1 : 0);
        s.water += n;
        pushLog(s, `${p.name} は水を確保した（水 +${n}）。`, 'good', p.id);
        break;
      }
      case 'wood': {
        const n = WOOD_PER_ACTION + (hasItem(p, 'axe') ? 1 : 0);
        s.wood += n;
        pushLog(s, `${p.name} は木材を集めた（木材 +${n}）。`, 'good', p.id);
        break;
      }
      case 'search': {
        if (rng.chance(ITEM_DRAW_PROB)) {
          const kind = drawItemKind(rng);
          p.items.push({ id: `i${s.itemSeq++}`, kind });
          pushLog(s, `${p.name} は難破船で何か（道具）を見つけた。`, 'info', p.id);
        } else {
          const kind: 'food' | 'water' = rng.chance(0.5) ? 'food' : 'water';
          const n = rng.int(SEARCH_RANGE[0], SEARCH_RANGE[1]);
          p.hand[kind] += n;
          pushLog(s, `${p.name} は難破船を漁った。（隠し財産を得た）`, 'info', p.id);
        }
        break;
      }
    }
  }

  s.rngState = rng.state;

  // 隠し財産を持たない生存者は供出ステップが不要 → 自動で 0 供出
  for (const p of alivePlayers(s)) {
    if (p.hand.food + p.hand.water <= 0) p.contribute = { food: 0, water: 0 };
  }

  s.phase = 'survival';
  return s;
}

// ===== 生存フェイズ（供出 → 判定） =====

export function setContribute(
  state: GameState,
  playerId: string,
  contribute: { food: number; water: number },
): GameState {
  if (state.phase !== 'survival') return state;
  const s = clone(state);
  const p = findPlayer(s, playerId);
  if (!p || !p.alive || p.escaped) return state;
  const food = Math.max(0, Math.min(p.hand.food, Math.floor(contribute.food)));
  const water = Math.max(0, Math.min(p.hand.water, Math.floor(contribute.water)));
  p.contribute = { food, water };
  return s;
}

export function resolveSurvival(state: GameState): GameState {
  if (state.phase !== 'survival') return state;
  let s = clone(state);

  // 供出を共有プールへ移動
  for (const p of alivePlayers(s)) {
    const c = p.contribute ?? { food: 0, water: 0 };
    const food = Math.min(p.hand.food, c.food);
    const water = Math.min(p.hand.water, c.water);
    p.hand.food -= food;
    p.hand.water -= water;
    s.food += food;
    s.water += water;
    if (food + water > 0) {
      pushLog(s, `${p.name} は備蓄を供出した（食料${food}・水${water}）。`, 'good', p.id);
    }
  }

  const need = aliveCount(s);
  const supportable = Math.min(s.food, s.water);
  const shortage = Math.max(0, need - supportable);

  pushLog(s, `生存判定: 生存者${need}人に水${s.water}・食料${s.food}。`, 'info');

  if (shortage <= 0) {
    // 全員生存。消費して脱出フェイズへ
    s.food -= need;
    s.water -= need;
    pushLog(s, `全員が今日を生き延びた。`, 'good');
    return enterEscape(s);
  }

  if (shortage >= need) {
    // 誰も支えられない → 全滅
    for (const p of alivePlayers(s)) p.alive = false;
    pushLog(s, `水も食料も尽き、生存者は全員力尽きた……`, 'death');
    s.phase = 'gameover';
    return s;
  }

  // 不足分だけ投票で追放
  s.shortage = shortage;
  pushLog(s, `水・食料が${shortage}人分足りない。${shortage}人を追放するしかない。`, 'bad');
  s.phase = 'vote';
  return s;
}

// ===== 投票フェイズ =====

export function castVote(state: GameState, playerId: string, targetId: string | null): GameState {
  if (state.phase !== 'vote') return state;
  const s = clone(state);
  const voter = findPlayer(s, playerId);
  if (!voter || !voter.alive || voter.escaped) return state;
  // 対象は「生存中・自分以外」のみ有効。無効なら棄権扱い
  let valid: string | null = null;
  if (targetId) {
    const t = findPlayer(s, targetId);
    if (t && t.alive && !t.escaped && t.id !== playerId) valid = targetId;
  }
  voter.vote = valid;
  return s;
}

export function resolveVotes(state: GameState): GameState {
  if (state.phase !== 'vote') return state;
  let s = clone(state);
  const rng = new Rng(s.rngState);

  // 集計
  const tally = new Map<string, number>();
  for (const p of alivePlayers(s)) {
    if (p.vote) tally.set(p.vote, (tally.get(p.vote) ?? 0) + 1);
  }
  for (const p of alivePlayers(s)) p.votesReceived = tally.get(p.id) ?? 0;

  // 投票開始後に拳銃などで人数が変わっている可能性があるため、不足数を再計算
  const need0 = aliveCount(s);
  const supportable = Math.min(s.food, s.water);
  const shortage = Math.max(0, Math.min(s.shortage, need0 - supportable));

  if (shortage <= 0) {
    pushLog(s, `状況が変わり、犠牲は不要になった。`, 'good');
  } else {
    // 票数の多い順に追放。睡眠薬による免疫者は可能な限り後回し。同票は乱数で裁定。
    const shuffled = rng.shuffle(alivePlayers(s));
    shuffled.sort((a, b) => (b.votesReceived ?? 0) - (a.votesReceived ?? 0));
    const order = [
      ...shuffled.filter((p) => !p.voteImmune),
      ...shuffled.filter((p) => p.voteImmune),
    ];

    const toEliminate = order.slice(0, shortage);
    for (const victim of toEliminate) {
      victim.alive = false;
      // 追放者の隠し財産は共有プールへ（生存者が分け合う）。道具は失われる。
      s.food += victim.hand.food;
      s.water += victim.hand.water;
      victim.hand = { food: 0, water: 0 };
      victim.items = [];
      const note = victim.voteImmune ? '（睡眠薬も及ばず）' : '';
      pushLog(
        s,
        `${victim.name} は${victim.votesReceived}票を集め、海へ突き落とされた${note}……`,
        'death',
        victim.id,
      );
    }
  }

  s.rngState = rng.state;
  s.shortage = 0;

  // 残った生存者で消費
  const need = aliveCount(s);
  s.food = Math.max(0, s.food - need);
  s.water = Math.max(0, s.water - need);
  pushLog(s, `残った${need}人が水と食料を分け合った。`, 'info');

  return enterEscape(s);
}

// ===== 特殊アイテム（割り込みプレイ） =====

/**
 * 手札の特殊アイテムを使用する。行動・生存・投票・脱出のいずれの能動フェイズでも割り込み可能。
 * 永続アイテム（斧・釣り竿・浄水器）は所持で自動発動するため手動プレイ不可。
 */
export function playItem(
  state: GameState,
  playerId: string,
  itemId: string,
  targetId?: string | null,
): GameState {
  if (!isAwaitingInput(state.phase)) return state;
  const s = clone(state);
  const p = findPlayer(s, playerId);
  if (!p || !p.alive || p.escaped) return state;
  const item = p.items.find((it) => it.id === itemId);
  if (!item || PERMANENT_ITEMS.has(item.kind)) return state;

  let used = false;
  switch (item.kind) {
    case 'antidote': {
      if (!p.sick) return state; // 病気でなければ無駄遣いさせない
      p.sick = false;
      used = true;
      pushLog(s, `${p.name} は解毒剤を使い、毒を抜いた。`, 'good', p.id);
      break;
    }
    case 'pills': {
      if (s.phase !== 'action' && s.phase !== 'survival' && s.phase !== 'vote') return state;
      p.voteImmune = true;
      used = true;
      pushLog(s, `${p.name} は睡眠薬を飲んだ。（この追放投票では対象外）`, 'info', p.id);
      break;
    }
    case 'gun': {
      if (s.phase !== 'action' && s.phase !== 'vote') return state;
      const t = targetId ? findPlayer(s, targetId) : undefined;
      if (!t || !t.alive || t.escaped || t.id === p.id) return state;
      t.alive = false;
      // 所持品を奪う
      p.hand.food += t.hand.food;
      p.hand.water += t.hand.water;
      t.hand = { food: 0, water: 0 };
      for (const it of t.items) p.items.push(it);
      t.items = [];
      used = true;
      pushLog(s, `${p.name} は ${t.name} を撃ち殺し、所持品を奪った！`, 'death', t.id);
      break;
    }
    case 'voodoo': {
      if (s.phase !== 'action') return state; // 蘇生は行動フェイズのみ（進行の混乱を避ける）
      const t = targetId ? findPlayer(s, targetId) : undefined;
      if (!t || t.alive || t.escaped) return state; // 対象は死者のみ
      t.alive = true;
      t.sick = false;
      used = true;
      pushLog(s, `${p.name} はブードゥー人形で ${t.name} を蘇らせた！`, 'good', t.id);
      break;
    }
  }

  if (!used) return state;
  p.items = p.items.filter((it) => it.id !== itemId);
  return s;
}

// ===== 脱出フェイズ =====

function enterEscape(state: GameState): GameState {
  const s = state; // 既に clone 済みの draft 前提
  for (const p of s.players) p.escapeVote = undefined;

  const need = aliveCount(s);
  if (need <= 0) {
    s.phase = 'gameover';
    return s;
  }

  const capacity = getCapacity(s);
  const provisionNeed = need * s.config.voyageProvisionPerSeat;
  const provisionsOk = s.food >= provisionNeed && s.water >= provisionNeed;
  const canEscapeAll = capacity >= need && provisionsOk;

  if (isFinalDay(s)) {
    return resolveFinalEscape(s);
  }

  if (canEscapeAll) {
    // 出航するか継続するかを全員で投票
    pushLog(s, `いかだの準備が整った（席${capacity}/必要${need}、備蓄も十分）。出航するか投票しよう。`, 'good');
    s.phase = 'escape';
    return s;
  }

  // まだ脱出できない → 翌日へ
  pushLog(
    s,
    `まだ脱出できない（席${capacity}/必要${need}、航海用の水食料も要確認）。翌日へ。`,
    'info',
  );
  return beginDay(s);
}

export function setEscapeVote(state: GameState, playerId: string, leave: boolean): GameState {
  if (state.phase !== 'escape') return state;
  const s = clone(state);
  const p = findPlayer(s, playerId);
  if (!p || !p.alive || p.escaped) return state;
  p.escapeVote = leave;
  return s;
}

export function resolveEscapeVote(state: GameState): GameState {
  if (state.phase !== 'escape') return state;
  let s = clone(state);
  const voters = alivePlayers(s);
  const leave = voters.filter((p) => p.escapeVote === true).length;
  const stay = voters.length - leave;

  if (leave > stay) {
    pushLog(s, `多数決で出航が決まった。`, 'good');
    return doEscape(s, voters);
  }

  pushLog(s, `出航は見送られた。島でもう1日を過ごす。`, 'info');
  return beginDay(s);
}

/** 最終日（嵐）の強制脱出。乗れる人数だけが脱出し、残りは飲まれる。 */
function resolveFinalEscape(state: GameState): GameState {
  const s = state;
  const survivors = alivePlayers(s);
  const capacity = getCapacity(s);
  const prov = s.config.voyageProvisionPerSeat;
  // 木材・水・食料いずれかで決まる席数
  const seats = Math.max(
    0,
    Math.min(
      capacity,
      prov > 0 ? Math.floor(s.food / prov) : survivors.length,
      prov > 0 ? Math.floor(s.water / prov) : survivors.length,
    ),
  );

  const rng = new Rng(s.rngState);
  const ordered = rng.shuffle(survivors);
  s.rngState = rng.state;

  const escapees = ordered.slice(0, seats);
  const drowned = ordered.slice(seats);

  for (const p of escapees) {
    p.escaped = true;
    s.winners.push(p.id);
  }
  for (const p of drowned) {
    p.alive = false;
  }

  if (escapees.length > 0) {
    pushLog(s, `嵐の中、${escapees.length}人がいかだで脱出に成功した！`, 'escape');
  }
  if (drowned.length > 0) {
    pushLog(s, `${drowned.length}人は乗りきれず、嵐に飲まれた……`, 'death');
  }
  s.phase = 'gameover';
  return s;
}

/** 全員（生存者）がいかだで脱出する。 */
function doEscape(state: GameState, survivors: Player[]): GameState {
  const s = state;
  for (const p of survivors) {
    p.escaped = true;
    s.winners.push(p.id);
  }
  pushLog(s, `${survivors.length}人全員が島からの脱出に成功した！`, 'escape');
  s.phase = 'gameover';
  return s;
}

// ===== フェイズ進行ヘルパー（サーバが利用） =====

/** プレイヤー入力を待っているフェイズか */
export function isAwaitingInput(phase: Phase): boolean {
  return phase === 'action' || phase === 'survival' || phase === 'vote' || phase === 'escape';
}

/** 生存中の全員が現フェイズの入力を提出済みか */
export function isPhaseReady(state: GameState): boolean {
  const players = alivePlayers(state);
  switch (state.phase) {
    case 'action':
      return players.every((p) => p.pendingAction !== undefined);
    case 'survival':
      return players.every((p) => p.contribute !== undefined);
    case 'vote':
      return players.every((p) => p.vote !== undefined);
    case 'escape':
      return players.every((p) => p.escapeVote !== undefined);
    default:
      return false;
  }
}

/** 現フェイズを解決し、次フェイズへ。 */
export function resolvePhase(state: GameState): GameState {
  switch (state.phase) {
    case 'action':
      return resolveActions(state);
    case 'survival':
      return resolveSurvival(state);
    case 'vote':
      return resolveVotes(state);
    case 'escape':
      return resolveEscapeVote(state);
    default:
      return state;
  }
}

/** 締切到達時など、未提出のプレイヤーに安全なデフォルト入力を補完する。 */
export function fillDefaults(state: GameState): GameState {
  let s = clone(state);
  for (const p of alivePlayers(s)) {
    switch (s.phase) {
      case 'action':
        if (p.pendingAction === undefined) p.pendingAction = 'fish';
        break;
      case 'survival':
        if (p.contribute === undefined) p.contribute = { food: 0, water: 0 };
        break;
      case 'vote':
        if (p.vote === undefined) p.vote = null;
        break;
      case 'escape':
        if (p.escapeVote === undefined) p.escapeVote = false;
        break;
    }
  }
  return s;
}
