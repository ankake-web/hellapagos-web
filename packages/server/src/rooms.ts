import type { Server } from 'socket.io';
import { recordResult } from './leaderboard.js';
import { botSpeak, llmEnabled, type SpeakCtx } from './llm.js';
import {
  BOT_PERSONAS,
  CARD_INFO,
  PERSONA_INFO,
  MAX_PLAYERS,
  MIN_PLAYERS,
  Rng,
  addPlayer,
  aiAction,
  aiChatLine,
  aiEscape,
  aiSurvivalPlays,
  aiVote,
  aliveCount,
  alivePlayers,
  randomName,
  scriptedNegotiation,
  awaiting,
  castVote,
  createGame,
  currentActorId,
  giftCard,
  isEscapeReady,
  isSurvivalReady,
  isVoteReady,
  passSurvival,
  playCard,
  redactFor,
  removePlayer,
  resolveEscape,
  resolveSurvival,
  resolveVote,
  setConfig,
  setConnected,
  setEscapeChoice,
  startGame,
  takeAction,
  thinkDelayRange,
  type ActionType,
  type BotPersona,
  type ChatMessage,
  type ClientToServerEvents,
  type Difficulty,
  type GameState,
  type Player,
  type ServerToClientEvents,
  type Speed,
} from '@hellapagos/shared';

const CHAT_HISTORY = 60;

interface ServerRoom {
  id: string;
  hostId: string;
  state: GameState;
  sockets: Map<string, string>;
  spectators: Map<string, string>;
  chat: ChatMessage[];
  chatSeq: number;
  botCounter: number;
  recorded: boolean;
  // 再接続認証：playerId/specId -> 秘密トークン。state には絶対載せない（リダクションで配らない）。
  tokens: Map<string, string>;
  // ルームGC：最終アクティビティ時刻
  lastActiveAt: number;
  // 進行制御
  botTimer?: ReturnType<typeof setTimeout>;
  deadline?: ReturnType<typeof setTimeout>;
  deadlineAt?: number;
  deadlineKey?: string; // 締切が張られたフェイズの識別子（stale発火の防止）
  survivalKey?: string; // ラウンド毎の生存ウィンドウ初期化済みマーカー
  voteKey?: string; // 投票ラウンド毎のボット投票・煽り済みマーカー
  // LLM交渉
  botVoteIntent: Map<string, string | null>; // botId -> 追放したい playerId
  negotiateUntil: number; // 交渉ウィンドウ終了 epoch ms
  negTimer?: ReturnType<typeof setTimeout>;
  lastReplyAt: number; // 直近のCPU反応返信の時刻
  // 演出の「ため」：蛇/死亡/脱出/ハリケーンの直後に少し止めて見せる
  holdUntil?: number;
  holdTimer?: ReturnType<typeof setTimeout>;
  lastDramaId?: number; // 直近で「ため」を入れた劇的ログのid
}

// 劇的イベント後の演出ホールド（ミリ秒）。速度設定に依らず必ず見えるよう固定。
const DRAMA_HOLD_MS = 2400;
// 締切なし設定でも、この時間で必ずフェイズを前進させる（AFK人間でのデッドロック防止）。
const HARD_CAP_MS = 5 * 60_000;
/** 締切の有効性照合用キー：フェイズが進んだら stale 締切を無効化するために使う。 */
function phaseKey(s: GameState): string {
  return `${s.phase}|${s.round}|${s.voteReason ?? ''}|${s.pendingEliminations}|${s.currentActorIndex}`;
}
/** 直近の「劇的」ログ（蛇・死亡・脱出・ハリケーン）のid。無ければ -1。 */
function latestDramaId(s: GameState): number {
  let id = -1;
  for (const e of s.log) {
    const dramatic = e.kind === 'snake' || e.kind === 'death' || e.kind === 'escape' || e.text.includes('ハリケーン');
    if (dramatic && e.id > id) id = e.id;
  }
  return id;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

function genId(len: number): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(len);
  globalThis.crypto.getRandomValues(b);
  let o = '';
  for (let i = 0; i < len; i++) o += a[b[i] % a.length];
  return o;
}
/** ルームコードは数字のみ（共有しやすく入力もテンキーで済む）。偏りを避け 0-249 を採用。 */
function genRoomId(len = 4): string {
  const b = new Uint8Array(len * 3);
  globalThis.crypto.getRandomValues(b);
  let o = '';
  for (let i = 0; i < b.length && o.length < len; i++) {
    if (b[i] < 250) o += String(b[i] % 10);
  }
  while (o.length < len) o += '0';
  return o;
}
/** 入力ゆれを吸収してルームコードを数字のみに正規化。 */
function normRoomId(roomId: string): string {
  return String(roomId).replace(/\D/g, '');
}
function rngFor(s: GameState, salt: number): Rng {
  return new Rng(s.rngState + s.round * 131 + salt * 17 + 1);
}

// ルームGC：gameover到達後や無人のまま放置されたルームを掃除する閾値。
const ROOM_GC_INTERVAL_MS = 60_000;
const ROOM_GAMEOVER_TTL_MS = 5 * 60_000; // 決着後5分でクローズ
const ROOM_IDLE_TTL_MS = 30 * 60_000; // ソケット0かつ無活動30分でクローズ

export class RoomManager {
  private rooms = new Map<string, ServerRoom>();
  private socketIndex = new Map<string, { roomId: string; playerId: string }>();
  private gcTimer: ReturnType<typeof setInterval>;
  constructor(private io: IO) {
    this.gcTimer = setInterval(() => this.reap(), ROOM_GC_INTERVAL_MS);
    // Node が GC タイマーでプロセスを引き止めないように（あれば）。
    (this.gcTimer as { unref?: () => void }).unref?.();
  }

  /** 決着済み/無人で放置されたルームを定期的にクローズしてメモリリークを防ぐ。 */
  private reap(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const idleFor = now - room.lastActiveAt;
      const noSockets = room.sockets.size === 0;
      // 接続中の卓は回収しない（gameover でも、結果画面を見ている/再戦しようとしているホストを守る）。
      if (room.state.phase === 'gameover' && noSockets && idleFor > ROOM_GAMEOVER_TTL_MS) {
        this.closeRoom(room);
      } else if (noSockets && idleFor > ROOM_IDLE_TTL_MS) {
        this.closeRoom(room);
      }
    }
  }

  /** グレースフルシャットダウン用：GCタイマーと全ルームのタイマーを停止。 */
  dispose(): void {
    clearInterval(this.gcTimer);
    for (const room of this.rooms.values()) this.clearTimers(room);
  }

  private mintToken(room: ServerRoom, id: string): string {
    const token = genId(24);
    room.tokens.set(id, token);
    return token;
  }

  // ===== ロビー =====
  createRoom(name: string, socketId: string): { roomId: string; playerId: string; token: string } {
    let roomId = genRoomId();
    while (this.rooms.has(roomId)) roomId = genRoomId();
    const playerId = genId(8);
    const room: ServerRoom = {
      id: roomId,
      hostId: playerId,
      state: createGame([{ id: playerId, name: clean(name), isBot: false }]),
      sockets: new Map([[playerId, socketId]]),
      spectators: new Map(),
      chat: [],
      chatSeq: 0,
      botCounter: 0,
      recorded: false,
      tokens: new Map(),
      lastActiveAt: Date.now(),
      botVoteIntent: new Map(),
      negotiateUntil: 0,
      lastReplyAt: 0,
    };
    const token = this.mintToken(room, playerId);
    this.rooms.set(roomId, room);
    this.socketIndex.set(socketId, { roomId, playerId });
    this.broadcast(room);
    return { roomId, playerId, token };
  }

  joinRoom(roomId: string, name: string, socketId: string): { playerId: string; spectator: boolean; token: string } {
    const room = this.requireRoom(roomId);
    if (room.state.phase !== 'lobby' || room.state.players.length >= MAX_PLAYERS) {
      const specId = 'spec_' + genId(8);
      room.spectators.set(specId, clean(name));
      room.sockets.set(specId, socketId);
      const token = this.mintToken(room, specId);
      this.socketIndex.set(socketId, { roomId, playerId: specId });
      this.touch(room);
      this.sendStateTo(room, specId, socketId);
      this.sendChatHistory(room, socketId);
      return { playerId: specId, spectator: true, token };
    }
    const playerId = genId(8);
    room.state = addPlayer(room.state, { id: playerId, name: clean(name), isBot: false });
    room.sockets.set(playerId, socketId);
    const token = this.mintToken(room, playerId);
    this.socketIndex.set(socketId, { roomId, playerId });
    this.sendChatHistory(room, socketId);
    this.broadcast(room);
    return { playerId, spectator: false, token };
  }

  rejoin(roomId: string, playerId: string, token: string | undefined, socketId: string): void {
    const room = this.requireRoom(roomId);
    // 認証：発行済みトークンと一致しない再接続は拒否（席乗っ取り・秘匿手札の覗き見対策）。
    const expected = room.tokens.get(playerId);
    if (!expected || token !== expected) {
      throw new GameError('BAD_TOKEN', 'セッションが無効です。トップへ戻ってやり直してください。');
    }
    if (room.state.players.some((p) => p.id === playerId)) {
      room.state = setConnected(room.state, playerId, true);
      room.sockets.set(playerId, socketId);
    } else {
      if (!room.spectators.has(playerId)) room.spectators.set(playerId, '観戦者');
      room.sockets.set(playerId, socketId);
    }
    this.socketIndex.set(socketId, { roomId, playerId });
    this.touch(room);
    this.sendChatHistory(room, socketId);
    this.broadcast(room);
  }

  addBot(socketId: string): void {
    const { room, playerId } = this.ctx(socketId);
    this.assertHost(room, playerId);
    if (this.addBotTo(room)) this.broadcast(room);
  }
  /** ルームへCPUを1体追加（ホスト判定はしない）。追加できたら true。 */
  private addBotTo(room: ServerRoom): boolean {
    if (room.state.phase !== 'lobby' || room.state.players.length >= MAX_PLAYERS) return false;
    const seedArr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(seedArr);
    const used = new Set(room.state.players.map((p) => p.name));
    const name = randomName(new Rng(seedArr[0] || 1), used);
    const persona = BOT_PERSONAS[room.botCounter % BOT_PERSONAS.length] as BotPersona;
    room.botCounter++;
    room.state = addPlayer(room.state, { id: 'bot_' + genId(6), name, isBot: true, botPersona: persona });
    return true;
  }

  /** ひとりで今すぐ：ルーム作成→CPU補充→即開始を1発で行う。 */
  quickStart(name: string, socketId: string, bots: number): { roomId: string; playerId: string; token: string } {
    const created = this.createRoom(name, socketId);
    const room = this.rooms.get(created.roomId);
    if (!room) return created;
    for (let i = 0; i < bots && room.state.players.length < MAX_PLAYERS; i++) this.addBotTo(room);
    if (room.state.players.length >= MIN_PLAYERS) {
      room.state = startGame(room.state);
      this.drive(room);
    } else {
      this.broadcast(room);
    }
    return created;
  }

  /** 同じ顔ぶれでもう1戦：構成（人間・CPU・設定）を保ったままロビーへ戻す。 */
  rematch(socketId: string): void {
    const { room, playerId } = this.ctx(socketId);
    this.assertHost(room, playerId);
    if (room.state.phase !== 'gameover') return;
    const seedArr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(seedArr);
    const players = room.state.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, botPersona: p.botPersona }));
    const cfg = { ...room.state.config, seed: seedArr[0] || 1 };
    this.clearTimers(room);
    room.state = createGame(players, cfg);
    room.recorded = false;
    room.survivalKey = undefined;
    room.voteKey = undefined;
    room.lastDramaId = undefined;
    room.holdUntil = undefined;
    this.broadcast(room);
  }
  removeBot(socketId: string, botId: string): void {
    const { room, playerId } = this.ctx(socketId);
    this.assertHost(room, playerId);
    if (room.state.players.find((p) => p.id === botId)?.isBot) {
      room.state = removePlayer(room.state, botId);
      this.broadcast(room);
    }
  }
  setRoomConfig(socketId: string, p: { soleSurvivor?: boolean; difficulty?: Difficulty; speed?: Speed; timeLimit?: number; quickGame?: boolean }): void {
    const { room, playerId } = this.ctx(socketId);
    this.assertHost(room, playerId);
    room.state = setConfig(room.state, p);
    this.broadcast(room);
  }
  startGame(socketId: string): void {
    const { room, playerId } = this.ctx(socketId);
    this.assertHost(room, playerId);
    if (room.state.phase !== 'lobby') return;
    if (room.state.players.length < MIN_PLAYERS) throw new GameError('TOO_FEW', `${MIN_PLAYERS}人以上必要です。`);
    room.state = startGame(room.state);
    this.drive(room);
  }

  // ===== プレイヤー入力 =====
  submitAction(socketId: string, action: ActionType, woodPush = 0): void {
    const { room, playerId } = this.ctx(socketId);
    if (currentActorId(room.state) !== playerId) return;
    room.state = takeAction(room.state, playerId, action, woodPush);
    this.drive(room);
  }
  submitCard(socketId: string, cardId: string, targetId?: string | null): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = playCard(room.state, playerId, cardId, targetId ?? undefined);
    this.drive(room);
  }
  submitGift(socketId: string, cardId: string, targetId: string): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = giftCard(room.state, playerId, cardId, targetId);
    this.drive(room);
  }
  submitSurvivalPass(socketId: string): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = passSurvival(room.state, playerId);
    this.drive(room);
  }
  submitVote(socketId: string, targetId: string | null): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = castVote(room.state, playerId, targetId);
    this.drive(room);
  }
  submitEscape(socketId: string, leave: boolean): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = setEscapeChoice(room.state, playerId, leave);
    this.drive(room);
  }

  // 明示的な退出（トップへ戻る）。切断と同じ扱い：ロビーなら離脱、ゲーム中は席をAIが引き継ぐ。
  leaveRoom(socketId: string): void {
    this.handleDisconnect(socketId);
  }

  // ===== 切断 =====
  handleDisconnect(socketId: string): void {
    const idx = this.socketIndex.get(socketId);
    if (!idx) return;
    this.socketIndex.delete(socketId);
    const room = this.rooms.get(idx.roomId);
    if (!room) return;
    if (room.sockets.get(idx.playerId) === socketId) room.sockets.delete(idx.playerId);
    if (room.spectators.has(idx.playerId)) {
      room.spectators.delete(idx.playerId);
      if (room.sockets.size === 0 && room.state.phase === 'lobby') this.closeRoom(room);
      return;
    }
    if (room.state.phase === 'lobby') {
      room.state = removePlayer(room.state, idx.playerId);
      if (room.state.players.length === 0) return this.closeRoom(room);
      if (idx.playerId === room.hostId) room.hostId = (room.state.players.find((p) => !p.isBot) ?? room.state.players[0]).id;
      this.broadcast(room);
    } else {
      room.state = setConnected(room.state, idx.playerId, false);
      this.drive(room); // 切断者はAIが代行
    }
  }

  // ===== 進行エンジン（ターン制＋逐次CPU） =====
  /** drive 本体を例外で包む：1つの不正遷移でプロセス全体を落とさない。 */
  private drive(room: ServerRoom): void {
    try {
      this.driveInner(room);
    } catch (err) {
      console.error('[room] drive failed', room.id, err);
      try {
        this.broadcast(room);
      } catch {
        /* ignore */
      }
    }
  }
  private driveInner(room: ServerRoom): void {
    let guard = 0;
    while (guard++ < 4000) {
      const s = room.state;
      const aw = awaiting(s);

      if (aw === null) {
        this.clearTimers(room);
        this.recordIfGameOver(room);
        this.broadcast(room);
        return;
      }

      // 劇的イベント（蛇・死亡・脱出・ハリケーン）の直後は少し止めて、演出を見せる。
      const dId = latestDramaId(s);
      if (dId > (room.lastDramaId ?? -1)) {
        room.lastDramaId = dId;
        room.holdUntil = Date.now() + DRAMA_HOLD_MS;
      }
      if (room.holdUntil && Date.now() < room.holdUntil) {
        this.broadcast(room);
        this.scheduleHold(room, room.holdUntil - Date.now());
        return;
      }

      if (aw === 'action') {
        const actorId = currentActorId(s);
        const actor = actorId ? s.players.find((p) => p.id === actorId) : undefined;
        if (!actor) return; // 念のため
        if (this.isAuto(actor)) {
          if (room.botTimer) {
            this.broadcast(room);
            return;
          }
          this.scheduleBotAction(room, actor.id);
          this.broadcast(room);
          return;
        }
        this.ensureDeadline(room, 'action');
        this.broadcast(room);
        return;
      }

      if (aw === 'survival') {
        const key = `surv-${s.round}`;
        if (room.survivalKey !== key) {
          room.survivalKey = key;
          // ボット：供出カードを出してパス
          for (const p of alivePlayers(s).filter((x) => this.isAuto(x))) {
            for (const cardId of aiSurvivalPlays(room.state, this.live(room, p.id)!)) {
              room.state = playCard(room.state, p.id, cardId);
            }
            room.state = passSurvival(room.state, p.id);
          }
        }
        if (isSurvivalReady(room.state)) {
          room.state = resolveSurvival(room.state);
          continue;
        }
        this.ensureDeadline(room, 'survival', () => {
          for (const p of alivePlayers(room.state)) room.state = passSurvival(room.state, p.id);
        });
        this.broadcast(room);
        return;
      }

      if (aw === 'vote') {
        const key = `vote-${s.round}-${s.voteReason}-${s.pendingEliminations}`;
        const useNeg = this.humanAlive(room); // 人間がいれば交渉ウィンドウ（LLM/スクリプト両対応）
        if (room.voteKey !== key) {
          room.voteKey = key;
          room.botVoteIntent.clear();
          // 狙撃手CPU：弾を持つなら裕福な相手を撃って人数を削る
          for (const p of alivePlayers(room.state).filter((x) => this.isAuto(x) && x.botPersona === 'sniper')) {
            if (awaiting(room.state) !== 'vote') break;
            const cur = this.live(room, p.id);
            const gun = cur?.hand.find((c) => c.kind === 'gun');
            const bullet = cur?.hand.find((c) => c.kind === 'bullet');
            const r = rngFor(room.state, p.id.charCodeAt(0) + 9);
            if (gun && bullet && r.chance(0.6)) {
              const rich = alivePlayers(room.state)
                .filter((t) => t.id !== p.id)
                .sort((a, b) => b.hand.length - a.hand.length)[0];
              if (rich) room.state = playCard(room.state, p.id, gun.id, rich.id);
            }
          }
          if (awaiting(room.state) !== 'vote') continue;
          room.negotiateUntil = useNeg ? Date.now() + this.negotiationMs(room) : 0;
          if (useNeg) this.startVoteNegotiation(room, key);
        }

        const past = !useNeg || Date.now() >= room.negotiateUntil;
        if (past) {
          // ボットの投票を確定（LLMの意図があれば優先、無ければヒューリスティック）
          for (const p of alivePlayers(room.state).filter((x) => this.isAuto(x) && !x.sick && x.vote === undefined)) {
            const intent = this.intentTarget(room, p.id);
            const r = rngFor(room.state, p.id.charCodeAt(p.id.length - 1));
            room.state = castVote(room.state, p.id, intent ?? aiVote(room.state, this.live(room, p.id)!, r));
          }
        }
        if (isVoteReady(room.state)) {
          room.state = resolveVote(room.state);
          continue;
        }
        if (useNeg && !past) {
          // 交渉ウィンドウ：締切で再評価（ボット票を確定）。人間はその間に発言・投票できる。
          this.scheduleRedrive(room, room.negotiateUntil - Date.now());
        } else {
          this.ensureDeadline(room, 'vote', () => {
            for (const p of alivePlayers(room.state).filter((x) => !x.sick && x.vote === undefined)) {
              room.state = castVote(room.state, p.id, null);
            }
          });
        }
        this.broadcast(room);
        return;
      }

      if (aw === 'escape') {
        for (const p of alivePlayers(s).filter((x) => this.isAuto(x) && x.escapeChoice === undefined)) {
          room.state = setEscapeChoice(room.state, p.id, aiEscape(room.state, this.live(room, p.id)!));
        }
        if (isEscapeReady(room.state)) {
          room.state = resolveEscape(room.state);
          continue;
        }
        this.ensureDeadline(room, 'escape', () => {
          for (const p of alivePlayers(room.state).filter((x) => x.escapeChoice === undefined)) {
            room.state = setEscapeChoice(room.state, p.id, false);
          }
        });
        this.broadcast(room);
        return;
      }
      return;
    }
    this.broadcast(room);
  }

  private isAuto(p: Player): boolean {
    return p.isBot || !p.connected;
  }
  private live(room: ServerRoom, id: string): Player | undefined {
    return room.state.players.find((p) => p.id === id);
  }

  private scheduleBotAction(room: ServerRoom, botId: string): void {
    const [lo, hi] = thinkDelayRange(room.state.config.speed);
    const r = rngFor(room.state, botId.charCodeAt(botId.length - 1));
    const delay = lo + Math.floor(r.next() * (hi - lo));
    room.botTimer = setTimeout(() => {
      room.botTimer = undefined;
      try {
        const bot = this.live(room, botId);
        if (bot && currentActorId(room.state) === botId) {
          // 手番開始時のアイテム活用（蘇生・睡眠薬・目覚まし時計）。手番は消費しない。
          this.botUseItems(room, botId, r);
          const actor = this.live(room, botId);
          if (actor && currentActorId(room.state) === botId) {
            const decision = aiAction(room.state, actor, rngFor(room.state, botId.length));
            // たまにセリフ
            if (actor.botPersona && r.chance(0.25)) {
              const line = aiChatLine(actor, r);
              if (line) this.postChat(room, actor.name, line, false);
            }
            room.state = takeAction(room.state, botId, decision.action, decision.woodPush);
            // 噛まれたら血清で治す（手番を失わないため）
            const after = this.live(room, botId);
            if (after?.sick) {
              const serum = after.hand.find((c) => c.kind === 'serum');
              if (serum) room.state = playCard(room.state, botId, serum.id);
            }
          }
        }
      } catch (err) {
        console.error('[room] bot action failed', room.id, err);
      }
      this.drive(room);
    }, delay);
  }

  /** 手番開始時：性格に応じて単発アイテムを使う（蘇生・睡眠薬・目覚まし時計）。手番は消費しない。 */
  private botUseItems(room: ServerRoom, botId: string, r: Rng): void {
    const bot = this.live(room, botId);
    if (!bot || room.state.phase !== 'action' || bot.sick || bot.resting) return;
    const persona = bot.botPersona ?? 'cooperative';
    const others = alivePlayers(room.state).filter((p) => p.id !== botId);

    // ブードゥー人形：生存者が危機的に少ないとき、協力的/臆病者が死者を蘇らせ全滅を防ぐ。
    const voodoo = bot.hand.find((c) => c.kind === 'voodoo');
    if (voodoo && (persona === 'cooperative' || persona === 'coward') && aliveCount(room.state) <= 2) {
      const dead = room.state.players.find((p) => !p.alive && !p.escaped);
      if (dead && r.chance(0.7)) {
        room.state = playCard(room.state, botId, voodoo.id, dead.id);
        return; // 1ターンに1アイテムまで
      }
    }

    // 睡眠薬：手札が薄く裕福な相手がいるとき、溜め込み屋/狙撃手/臆病者が奪う。
    const pills = bot.hand.find((c) => c.kind === 'sleeping_pills');
    const richest = [...others].sort((a, b) => b.hand.length - a.hand.length)[0];
    if (
      pills &&
      (persona === 'hoarder' || persona === 'sniper' || persona === 'coward') &&
      richest &&
      richest.hand.length >= 3 &&
      bot.hand.length <= 3 &&
      r.chance(0.5)
    ) {
      room.state = playCard(room.state, botId, pills.id);
      return;
    }

    // 目覚まし時計：たまに使って親を別の誰かへ回す（場を動かす演出）。
    const alarm = bot.hand.find((c) => c.kind === 'alarm_clock');
    if (alarm && others.length > 0 && r.chance(0.2)) {
      const target = r.pick(others);
      room.state = playCard(room.state, botId, alarm.id, target.id);
    }
  }

  // ===== LLMによるCPUの会話・交渉 =====
  private humanAlive(room: ServerRoom): boolean {
    return room.state.players.some((p) => !p.isBot && p.alive && !p.escaped && p.connected);
  }
  private negotiationMs(room: ServerRoom): number {
    return room.state.config.speed === 'fast' ? 6000 : room.state.config.speed === 'slow' ? 14000 : 10000;
  }
  private intentTarget(room: ServerRoom, botId: string): string | null {
    const id = room.botVoteIntent.get(botId);
    if (!id) return null;
    const t = room.state.players.find((p) => p.id === id);
    return t && t.alive && !t.escaped && t.id !== botId ? id : null;
  }
  private scheduleRedrive(room: ServerRoom, ms: number): void {
    if (room.negTimer) return;
    room.negTimer = setTimeout(() => {
      room.negTimer = undefined;
      this.drive(room);
    }, Math.max(300, ms));
  }
  /** 演出ホールド：劇的イベントの直後に少しだけ進行を止める。 */
  private scheduleHold(room: ServerRoom, ms: number): void {
    if (room.holdTimer) return;
    room.holdTimer = setTimeout(() => {
      room.holdTimer = undefined;
      this.drive(room);
    }, Math.max(200, ms));
  }

  /** 投票フェイズ：各CPUが一言（交渉/告発/はったり）を述べ、投票意図を保持する。
   *  APIキーがあれば LLM、無ければ文脈付きスクリプトでフォールバック。 */
  private startVoteNegotiation(room: ServerRoom, key: string): void {
    const bots = alivePlayers(room.state).filter((p) => p.isBot && !p.sick);
    const useLLM = llmEnabled();
    bots.forEach((bot, i) => {
      const post = (say: string) => {
        setTimeout(() => {
          if (room.voteKey === key && say) this.postChat(room, bot.name, say, false);
        }, i * 750);
      };
      const scripted = () => {
        const cur = this.live(room, bot.id);
        if (!cur) return;
        const r = rngFor(room.state, bot.id.charCodeAt(0) + 5 + i);
        const { say, voteId } = scriptedNegotiation(room.state, cur, r);
        if (voteId) room.botVoteIntent.set(bot.id, voteId);
        post(say);
      };
      if (!useLLM) {
        scripted();
        return;
      }
      const ctx = this.buildCtx(room, bot.id, 'vote');
      if (!ctx) return scripted();
      botSpeak(ctx)
        .then((res) => {
          if (room.voteKey !== key) return;
          if (!res) return scripted();
          if (res.voteName) {
            const target = this.matchPlayerByName(room, res.voteName, bot.id);
            if (target) room.botVoteIntent.set(bot.id, target);
          }
          post(res.say);
        })
        .catch(() => scripted());
    });
  }

  /** 人間の発言に、生存中のCPU1体がLLMで反応して返信する（クールダウン付き）。 */
  private maybeBotReply(room: ServerRoom): void {
    if (!llmEnabled() || !this.humanAlive(room)) return;
    const phase = room.state.phase;
    if (phase !== 'action' && phase !== 'vote' && phase !== 'survival') return;
    if (Date.now() - room.lastReplyAt < 4000) return;
    const bots = alivePlayers(room.state).filter((p) => p.isBot && !p.sick);
    if (bots.length === 0) return;
    room.lastReplyAt = Date.now();
    const r = rngFor(room.state, room.chatSeq + 1);
    if (!r.chance(0.8)) return;
    const bot = r.pick(bots);
    const ctx = this.buildCtx(room, bot.id, 'reply');
    if (!ctx) return;
    botSpeak(ctx)
      .then((res) => {
        if (res?.say) this.postChat(room, bot.name, res.say, false);
      })
      .catch(() => {});
  }

  private matchPlayerByName(room: ServerRoom, name: string, exceptId: string): string | null {
    // 厳密一致のみ採用（双方向 includes は誤爆＆プロンプトインジェクションでの誤投票誘発を招くため不可）。
    const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();
    const n = norm(name);
    if (!n) return null;
    const hit = alivePlayers(room.state).find((p) => p.id !== exceptId && norm(p.name) === n);
    return hit?.id ?? null;
  }

  private buildCtx(room: ServerRoom, botId: string, situation: 'vote' | 'reply'): SpeakCtx | null {
    const s = room.state;
    const me = s.players.find((p) => p.id === botId);
    if (!me) return null;
    const persona = me.botPersona ?? 'cooperative';
    const info = PERSONA_INFO[persona];
    const handKinds = me.hand.map((c) => CARD_INFO[c.kind].name);
    const players = alivePlayers(s)
      .map((p) => `${p.name}(手札${p.hand.length}${p.sick ? '/病' : ''}${p.contributedThisRound === false ? '/出し渋り' : ''}${p.isBot ? '' : '/人間'})`)
      .join('、');
    const candidates = alivePlayers(s)
      .filter((p) => p.id !== botId)
      .map((p) => p.name);
    const recent = room.chat.slice(-8).map((m) => `${m.name}: ${m.text}`).join('\n');
    return {
      situation,
      round: s.round,
      voteReason: s.voteReason === 'water' ? '水不足' : s.voteReason === 'food' ? '食料不足' : s.voteReason === 'hurricane' ? 'ハリケーン' : undefined,
      pendingEliminations: s.pendingEliminations,
      you: me.name,
      persona: info.label,
      personaDesc: info.desc,
      hand: handKinds.length ? handKinds.join('、') : 'なし',
      sick: me.sick,
      tracks: `食料${s.food}/水${s.water}/座席${s.raftSeats}（生存${alivePlayers(s).length}人）`,
      players,
      candidates,
      recentChat: recent || '（まだ無し）',
    };
  }

  private ensureDeadline(room: ServerRoom, phase: string, onFire?: () => void): void {
    if (room.deadline) return;
    const limit = room.state.config.timeLimit;
    const unlimited = !limit || limit <= 0;
    // 無制限でも「絶対上限」を必ず張る：AFKの人間で当該フェイズが永久停止するのを防ぐ。
    const ms = unlimited ? HARD_CAP_MS : limit * 1000;
    // 無制限のときは UI に締切を見せない（人間は好きなだけ考えられる、でも最大HARD_CAPで前進）。
    room.deadlineAt = unlimited ? undefined : Date.now() + ms;
    const key = phaseKey(room.state);
    room.deadlineKey = key;
    room.deadline = setTimeout(() => {
      room.deadline = undefined;
      room.deadlineAt = undefined;
      // stale: タイマー設定後にフェイズが進んでいたら、その締切は無効。再評価だけする。
      if (room.deadlineKey !== key || phaseKey(room.state) !== key) {
        room.deadlineKey = undefined;
        this.drive(room);
        return;
      }
      room.deadlineKey = undefined;
      try {
        if (onFire) onFire();
        else if (room.state.phase === 'action') {
          const actorId = currentActorId(room.state);
          if (actorId) room.state = takeAction(room.state, actorId, 'fish', 0);
        }
      } catch (err) {
        console.error('[room] deadline onFire failed', room.id, err);
      }
      this.drive(room);
    }, ms);
  }
  private clearTimers(room: ServerRoom): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    if (room.deadline) clearTimeout(room.deadline);
    if (room.negTimer) clearTimeout(room.negTimer);
    if (room.holdTimer) clearTimeout(room.holdTimer);
    room.botTimer = undefined;
    room.deadline = undefined;
    room.deadlineAt = undefined;
    room.deadlineKey = undefined;
    room.negTimer = undefined;
    room.holdTimer = undefined;
  }

  // ===== チャット =====
  chat(socketId: string, text: string): void {
    const { room, playerId } = this.ctx(socketId);
    const t = (text ?? '').trim().slice(0, 200);
    if (!t) return;
    const player = room.state.players.find((p) => p.id === playerId);
    this.postChat(room, player?.name ?? room.spectators.get(playerId) ?? '???', t, !player);
    // 人間プレイヤーの発言にはCPUが反応して返信する
    if (player && !player.isBot) this.maybeBotReply(room);
  }
  private postChat(room: ServerRoom, name: string, text: string, isSpectator: boolean): void {
    this.touch(room); // 結果画面でのチャットも「活動」とみなし、GCのTTLを延ばす
    const msg: ChatMessage = { id: room.chatSeq++, name, text, isSpectator, round: room.state.round };
    room.chat.push(msg);
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
    for (const sid of room.sockets.values()) this.io.to(sid).emit('chat:msg', msg);
  }

  // ===== 出力 =====
  private touch(room: ServerRoom): void {
    room.lastActiveAt = Date.now();
  }
  private broadcast(room: ServerRoom): void {
    this.touch(room);
    for (const [viewerId, socketId] of room.sockets) this.sendStateTo(room, viewerId, socketId);
  }
  private sendStateTo(room: ServerRoom, viewerId: string, socketId: string): void {
    const view = redactFor(room.state, viewerId, room.hostId);
    view.deadlineAt = room.deadlineAt;
    this.io.to(socketId).emit('game:state', view);
  }
  private sendChatHistory(room: ServerRoom, socketId: string): void {
    if (room.chat.length) this.io.to(socketId).emit('chat:history', room.chat);
  }
  private closeRoom(room: ServerRoom): void {
    this.clearTimers(room);
    this.rooms.delete(room.id);
    // このルームを指す socketIndex の残骸も掃除（GC で消えた卓への参照を残さない）。
    for (const [sid, idx] of this.socketIndex) {
      if (idx.roomId === room.id) this.socketIndex.delete(sid);
    }
  }
  private recordIfGameOver(room: ServerRoom): void {
    if (room.state.phase !== 'gameover' || room.recorded) return;
    room.recorded = true;
    const escapedCount = room.state.players.filter((p) => p.escaped).length;
    const sole = room.state.config.soleSurvivor;
    for (const p of room.state.players) {
      if (p.isBot) continue;
      const won = sole ? p.escaped && escapedCount === 1 : p.escaped;
      recordResult(p.name, { escaped: p.escaped, won });
    }
  }

  // ===== 内部 =====
  private requireRoom(roomId: string): ServerRoom {
    const room = this.rooms.get(normRoomId(roomId));
    if (!room) throw new GameError('NO_ROOM', 'ルームが見つかりません。');
    return room;
  }
  private ctx(socketId: string): { room: ServerRoom; playerId: string } {
    const idx = this.socketIndex.get(socketId);
    if (!idx) throw new GameError('NO_SESSION', 'セッションがありません。再読み込みしてください。');
    const room = this.rooms.get(idx.roomId);
    if (!room) throw new GameError('NO_ROOM', 'ルームが見つかりません。');
    return { room, playerId: idx.playerId };
  }
  private assertHost(room: ServerRoom, playerId: string): void {
    if (room.hostId !== playerId) throw new GameError('NOT_HOST', 'ホストのみが操作できます。');
  }
}

export class GameError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
function clean(name: string): string {
  const t = (name ?? '').trim().slice(0, 16);
  return t.length ? t : '名無し';
}
