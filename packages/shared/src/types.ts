// ===== ゲームの基本型 =====

export type Phase =
  | 'lobby'
  | 'action'
  | 'survival'
  | 'vote'
  | 'escape'
  | 'gameover';

export type ActionType = 'fish' | 'water' | 'wood' | 'search';

export type WeatherType = 'sunny' | 'rain' | 'storm';

/** AIボットの性格。供出・投票・アイテム使用の傾向が変わる。 */
export type BotPersona = 'cooperative' | 'hoarder' | 'sniper' | 'coward';

/** 隠し財産（個人の備蓄）。MVPでは資源を数量で保持する。 */
export interface Stash {
  food: number;
  water: number;
}

/** 難破船で見つかる特殊アイテム。 */
export type ItemKind =
  | 'gun' // 拳銃：他の生存者を即座に射殺し、所持品を奪う（1回）
  | 'pills' // 睡眠薬：この追放投票で自分を対象外にする（1回）
  | 'antidote' // 解毒剤：ヘビの毒（病気）を治す（1回）
  | 'voodoo' // ブードゥー人形：死者1人を蘇らせる（1回）
  | 'axe' // 斧：木材集めの収量+1（永続）
  | 'rod' // 釣り竿：魚釣りの収量+1（永続）
  | 'filter'; // 浄水器：水汲みの収量+1（永続）

export interface Item {
  id: string;
  kind: ItemKind;
}

/** 永続効果のアイテムか（所持しているだけで効果発動） */
export const PERMANENT_ITEMS: ReadonlySet<ItemKind> = new Set<ItemKind>(['axe', 'rod', 'filter']);

/** プレイに対象指定が必要なアイテムか */
export function itemNeedsTarget(kind: ItemKind): boolean {
  return kind === 'gun' || kind === 'voodoo';
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  alive: boolean;
  escaped: boolean;
  sick: boolean;
  /** 探索で得た個人の隠し財産（他人には数量のみ公開） */
  hand: Stash;
  /** 所持している特殊アイテム（他人には所持数のみ公開） */
  items: Item[];
  /** この追放投票で対象外（睡眠薬） */
  voteImmune?: boolean;
  /** ボットの性格（人間は undefined）。ゲーム終了時のみ公開される。 */
  botPersona?: BotPersona;
  /** その日に選んだ行動（解決までは本人以外に伏せる） */
  pendingAction?: ActionType;
  /** 生存判定で共有プールへ供出する量（解決までは伏せる） */
  contribute?: Stash;
  /** 追放投票の対象 id（null = 棄権） */
  vote?: string | null;
  /** 脱出フェイズの賛否 */
  escapeVote?: boolean;
  /** 直近の投票で集めた票数（表示用） */
  votesReceived?: number;
}

export interface GameConfig {
  /** いかだの1席あたりに必要な木材 */
  raftWoodPerSeat: number;
  /** 脱出時、1席につき確保すべき航海用の水・食料 */
  voyageProvisionPerSeat: number;
  /** ゲーム開始時の嵐までの残り日数 */
  initialStormIn: number;
  /** ソロサバイバル：単独で脱出した者だけが勝者になるバリアント */
  soleSurvivor: boolean;
  /** 乱数シード */
  seed: number;
}

export interface LogEntry {
  id: number;
  day: number;
  /** 公開向けの本文 */
  text: string;
  /** この出来事に関わる playerId（演出用、任意） */
  playerId?: string;
  kind?: 'info' | 'good' | 'bad' | 'death' | 'escape';
}

export interface GameState {
  phase: Phase;
  day: number;
  players: Player[];
  // 共有トラック
  food: number;
  water: number;
  wood: number;
  /** 嵐到来までの残り日数（0 で当日が最終日 = 嵐） */
  stormIn: number;
  weather: WeatherType | null;
  /** リーダー（同票の裁定者）の players インデックス */
  firstPlayerIndex: number;
  /** 生存判定で不足し、投票で減らすべき人数 */
  shortage: number;
  rngState: number;
  itemSeq: number;
  log: LogEntry[];
  logSeq: number;
  /** 脱出に成功した playerId */
  winners: string[];
  config: GameConfig;
}

// ===== 公開（リダクション済み）状態 =====

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  alive: boolean;
  escaped: boolean;
  sick: boolean;
  handCount: number;
  itemCount: number;
  voteImmune?: boolean;
  hasActed: boolean;
  hasContributed: boolean;
  hasVoted: boolean;
  hasEscapeVoted: boolean;
  votesReceived?: number;
  /** ゲーム終了時にのみ公開されるボットの性格 */
  persona?: BotPersona;
  /** 投票/脱出フェイズ以降に公開される供出量 */
  contributedFood?: number;
  contributedWater?: number;
  // ↓ 閲覧者本人にのみ入る
  isYou: boolean;
  hand?: Stash;
  items?: Item[];
  pendingAction?: ActionType;
  vote?: string | null;
  escapeVote?: boolean;
}

export interface PublicGameState {
  phase: Phase;
  day: number;
  players: PublicPlayer[];
  food: number;
  water: number;
  wood: number;
  raftCapacity: number;
  stormIn: number;
  isFinalDay: boolean;
  weather: WeatherType | null;
  firstPlayerIndex: number;
  shortage: number;
  /** 生存判定で必要な消費量（= 生存者数） */
  need: number;
  log: LogEntry[];
  winners: string[];
  config: GameConfig;
  youId: string;
  hostId: string;
  /** 閲覧者が席を持たない観戦者か */
  isSpectator: boolean;
  /** 現フェイズの締切（epoch ms）。締切後は未提出をデフォルト処理 */
  deadlineAt?: number;
}

export interface ChatMessage {
  id: number;
  name: string;
  text: string;
  isSpectator: boolean;
  day: number;
}

/** サーバ側で集計する通算戦績（名前単位）。 */
export interface LeaderboardEntry {
  name: string;
  games: number;
  escapes: number;
  wins: number;
}

// ===== Socket.IO イベント型 =====

export type Ack =
  | { ok: true; roomId: string; playerId: string; spectator?: boolean }
  | { ok: false; error: string };

export interface ServerToClientEvents {
  'game:state': (state: PublicGameState) => void;
  'chat:msg': (msg: ChatMessage) => void;
  'chat:history': (msgs: ChatMessage[]) => void;
  error: (err: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': (p: { name: string }, cb: (res: Ack) => void) => void;
  'room:join': (p: { roomId: string; name: string }, cb: (res: Ack) => void) => void;
  'room:rejoin': (p: { roomId: string; playerId: string }, cb: (res: Ack) => void) => void;
  'room:addBot': () => void;
  'room:removeBot': (p: { botId: string }) => void;
  'game:setConfig': (p: { soleSurvivor: boolean }) => void;
  'game:start': () => void;
  'action:choose': (p: { action: ActionType }) => void;
  'survival:contribute': (p: { food: number; water: number }) => void;
  'vote:cast': (p: { targetId: string | null }) => void;
  'escape:vote': (p: { leave: boolean }) => void;
  'item:play': (p: { itemId: string; targetId?: string | null }) => void;
  'chat:say': (p: { text: string }) => void;
}
