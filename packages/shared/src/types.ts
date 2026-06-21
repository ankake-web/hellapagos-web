// ===== 基本型（公式ルール準拠モデル） =====

export type Phase =
  | 'lobby'
  | 'weather' // 天候公開（演出用の一瞬の状態）
  | 'action' // ターン制の行動
  | 'survival' // 生存チェック（カード補填ウィンドウ）
  | 'vote' // 不足による順次・単独追放
  | 'escape' // 任意脱出の決断
  | 'gameover';

export type ActionType = 'fish' | 'water' | 'wood' | 'search';

export type BotPersona = 'cooperative' | 'hoarder' | 'sniper' | 'coward';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Speed = 'slow' | 'normal' | 'fast';

/** 漂着物カードの種類 */
export type CardKind =
  // 資源
  | 'water_bottle'
  | 'dirty_water'
  | 'sandwich'
  | 'sardine_can'
  | 'rotten_fish'
  | 'fruit_basket'
  // 単発
  | 'serum'
  | 'voodoo'
  | 'sleeping_pills'
  | 'alarm_clock'
  // 永続
  | 'canteen'
  | 'fishing_rod'
  | 'axe'
  | 'crystal_ball'
  | 'gun'
  | 'bullet'
  // 無用品
  | 'junk';

export interface Card {
  id: string;
  kind: CardKind;
}

export interface WeatherCard {
  /** 降水量 0〜3（その日の水汲み量） */
  precip: number;
  hurricane: boolean;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  alive: boolean;
  escaped: boolean;
  /** ヘビ等で発病：このラウンド終了時の投票に参加不可（対象にはなる） */
  sick: boolean;
  /** 次ラウンドの行動・カード使用を不可にする（休み）。survival 前に解除 */
  resting: boolean;
  hand: Card[];
  /** その投票での対象 id（null=棄権、未投票=undefined） */
  vote?: string | null;
  /** その投票で資源カードを自分に使って身を守った（追放を免れる）。投票ごとにリセット */
  voteSafe?: boolean;
  /** 脱出フェイズの賛否（未回答=undefined） */
  escapeChoice?: boolean;
  /** 直近の投票で集めた票（表示用） */
  votesReceived?: number;
  /** その日に行動済みか（生存ウィンドウのパスにも流用） */
  acted: boolean;
  /** 使用して公開済みの永続カード種別（斧・銃など。使うまで他者には非公開） */
  revealed: CardKind[];
  botPersona?: BotPersona;
  difficulty?: Difficulty;
}

export interface GameConfig {
  soleSurvivor: boolean;
  difficulty: Difficulty;
  speed: Speed;
  /** 人間の手番の制限時間（秒）。0 = 無制限 */
  timeLimit: number;
  seed: number;
}

export interface LogEntry {
  id: number;
  round: number;
  text: string;
  playerId?: string;
  kind?: 'info' | 'good' | 'bad' | 'death' | 'escape' | 'draw' | 'snake' | 'card';
}

export type VoteReason = 'water' | 'food' | 'hurricane';

/** 資源・カード獲得の演出（飛んでいくトークン）用の種別 */
export type GainKind = 'food' | 'water' | 'wood' | 'card';

export interface GameState {
  phase: Phase;
  round: number;
  players: Player[];
  // 生存トラック（上限36）
  food: number;
  water: number;
  // 筏トラック
  raftSeats: number; // 完成座席（最大12）
  raftProgress: number; // 現在の周回 0..5
  // 天候
  weatherDeck: WeatherCard[]; // index0 = 次に公開
  currentPrecip: number; // 当ラウンドの水汲み量
  hurricaneRevealed: boolean;
  // 漂着物
  deck: Card[];
  // 進行
  firstPlayerIndex: number;
  currentActorIndex: number; // 行動フェイズの手番（players のindex）
  // 投票
  voteReason?: VoteReason;
  pendingEliminations: number; // 残り追放人数
  // 乱数・採番
  rngState: number;
  cardSeq: number;
  // 一時状態
  nextParentId?: string | null; // 目覚まし時計で指定された次の親
  fruitUsed?: boolean; // 当ラウンドにフルーツバスケットで死者ゼロ確定
  lastWoodGain?: { playerId: string; amount: number }; // 直近の木集めで得た木（血清で失う）
  // ログ・結果
  log: LogEntry[];
  logSeq: number;
  winners: string[];
  config: GameConfig;
  // 直近の袋引き結果（演出用）
  lastDraw?: { playerId: string; balls: Array<{ fish: number } | { snake: true }>; action: ActionType };
  // 演出用：直近の資源・カード獲得（飛んでいくトークン）
  eventSeq: number;
  lastGain?: { id: number; playerId: string; kind: GainKind; amount: number };
}

// ===== 公開（リダクション済み） =====

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  alive: boolean;
  escaped: boolean;
  sick: boolean;
  resting: boolean;
  acted: boolean;
  handCount: number;
  /** 永続カード（場に出ている＝公開情報） */
  permanents: CardKind[];
  votesReceived?: number;
  isYou: boolean;
  hand?: Card[]; // 本人のみ
  vote?: string | null; // 本人のみ
  persona?: BotPersona; // gameover時のみ
}

export interface PublicGameState {
  phase: Phase;
  round: number;
  players: PublicPlayer[];
  food: number;
  water: number;
  foodCap: number;
  waterCap: number;
  raftSeats: number;
  raftProgress: number;
  seatsNeeded: number; // = 生存者数
  currentPrecip: number;
  hurricaneRevealed: boolean;
  weatherRemaining: number;
  firstPlayerIndex: number;
  currentActorId: string | null;
  voteReason?: VoteReason;
  pendingEliminations: number;
  canEscape: boolean;
  isYourTurn: boolean;
  youId: string;
  hostId: string;
  isSpectator: boolean;
  log: LogEntry[];
  winners: string[];
  config: GameConfig;
  lastDraw?: GameState['lastDraw'];
  lastGain?: GameState['lastGain'];
  deadlineAt?: number;
}

export interface ChatMessage {
  id: number;
  name: string;
  text: string;
  isSpectator: boolean;
  round: number;
}

export interface LeaderboardEntry {
  name: string;
  games: number;
  escapes: number;
  wins: number;
}

// ===== Socket.IO イベント =====

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
  'room:leave': () => void;
  'room:addBot': () => void;
  'room:removeBot': (p: { botId: string }) => void;
  'game:setConfig': (p: { soleSurvivor?: boolean; difficulty?: Difficulty; speed?: Speed; timeLimit?: number }) => void;
  'game:start': () => void;
  'action:choose': (p: { action: ActionType; woodPush?: number }) => void;
  'card:play': (p: { cardId: string; targetId?: string | null }) => void;
  'survival:pass': () => void;
  'vote:cast': (p: { targetId: string | null }) => void;
  'escape:vote': (p: { leave: boolean }) => void;
  'chat:say': (p: { text: string }) => void;
}
