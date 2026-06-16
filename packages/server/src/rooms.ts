import type { Server } from 'socket.io';
import { recordResult } from './leaderboard.js';
import {
  BOT_PERSONAS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  Rng,
  addPlayer,
  aiAction,
  aiChatLine,
  aiEscape,
  aiSurvivalPlays,
  aiVote,
  alivePlayers,
  awaiting,
  castVote,
  createGame,
  currentActorId,
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

const HUMAN_DEADLINE_MS: Record<string, number> = {
  action: 60_000,
  survival: 18_000,
  vote: 30_000,
  escape: 20_000,
};
const CHAT_HISTORY = 60;
const BOT_NAMES = ['CPUアカ', 'CPUアオ', 'CPUミドリ', 'CPUキイロ', 'CPUモモ', 'CPUクロ', 'CPUシロ', 'CPUムラサキ', 'CPUハイ', 'CPUチャ'];

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
  // 進行制御
  botTimer?: ReturnType<typeof setTimeout>;
  deadline?: ReturnType<typeof setTimeout>;
  deadlineAt?: number;
  survivalKey?: string; // ラウンド毎の生存ウィンドウ初期化済みマーカー
  voteKey?: string; // 投票ラウンド毎のボット投票・煽り済みマーカー
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
function rngFor(s: GameState, salt: number): Rng {
  return new Rng(s.rngState + s.round * 131 + salt * 17 + 1);
}

export class RoomManager {
  private rooms = new Map<string, ServerRoom>();
  private socketIndex = new Map<string, { roomId: string; playerId: string }>();
  constructor(private io: IO) {}

  // ===== ロビー =====
  createRoom(name: string, socketId: string): { roomId: string; playerId: string } {
    let roomId = genId(4);
    while (this.rooms.has(roomId)) roomId = genId(4);
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
    };
    this.rooms.set(roomId, room);
    this.socketIndex.set(socketId, { roomId, playerId });
    this.broadcast(room);
    return { roomId, playerId };
  }

  joinRoom(roomId: string, name: string, socketId: string): { playerId: string; spectator: boolean } {
    const room = this.requireRoom(roomId);
    if (room.state.phase !== 'lobby' || room.state.players.length >= MAX_PLAYERS) {
      const specId = 'spec_' + genId(8);
      room.spectators.set(specId, clean(name));
      room.sockets.set(specId, socketId);
      this.socketIndex.set(socketId, { roomId, playerId: specId });
      this.sendStateTo(room, specId, socketId);
      this.sendChatHistory(room, socketId);
      return { playerId: specId, spectator: true };
    }
    const playerId = genId(8);
    room.state = addPlayer(room.state, { id: playerId, name: clean(name), isBot: false });
    room.sockets.set(playerId, socketId);
    this.socketIndex.set(socketId, { roomId, playerId });
    this.sendChatHistory(room, socketId);
    this.broadcast(room);
    return { playerId, spectator: false };
  }

  rejoin(roomId: string, playerId: string, socketId: string): void {
    const room = this.requireRoom(roomId);
    if (room.state.players.some((p) => p.id === playerId)) {
      room.state = setConnected(room.state, playerId, true);
      room.sockets.set(playerId, socketId);
    } else {
      if (!room.spectators.has(playerId)) room.spectators.set(playerId, '観戦者');
      room.sockets.set(playerId, socketId);
    }
    this.socketIndex.set(socketId, { roomId, playerId });
    this.sendChatHistory(room, socketId);
    this.broadcast(room);
  }

  addBot(socketId: string): void {
    const { room, playerId } = this.ctx(socketId);
    this.assertHost(room, playerId);
    if (room.state.phase !== 'lobby' || room.state.players.length >= MAX_PLAYERS) return;
    const name = BOT_NAMES[room.botCounter % BOT_NAMES.length] + (room.botCounter >= BOT_NAMES.length ? `${Math.floor(room.botCounter / BOT_NAMES.length) + 1}` : '');
    const persona = BOT_PERSONAS[room.botCounter % BOT_PERSONAS.length] as BotPersona;
    room.botCounter++;
    room.state = addPlayer(room.state, { id: 'bot_' + genId(6), name, isBot: true, botPersona: persona });
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
  setRoomConfig(socketId: string, p: { soleSurvivor?: boolean; difficulty?: Difficulty; speed?: Speed }): void {
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
  private drive(room: ServerRoom): void {
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
        if (room.voteKey !== key) {
          room.voteKey = key;
          this.botTaunt(room);
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
          for (const p of alivePlayers(room.state).filter((x) => this.isAuto(x) && !x.sick)) {
            const r = rngFor(room.state, p.id.charCodeAt(p.id.length - 1));
            room.state = castVote(room.state, p.id, aiVote(room.state, this.live(room, p.id)!, r));
          }
        }
        if (isVoteReady(room.state)) {
          room.state = resolveVote(room.state);
          continue;
        }
        this.ensureDeadline(room, 'vote', () => {
          for (const p of alivePlayers(room.state).filter((x) => !x.sick && x.vote === undefined)) {
            room.state = castVote(room.state, p.id, null);
          }
        });
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
      const bot = this.live(room, botId);
      if (!bot || currentActorId(room.state) !== botId) {
        this.drive(room);
        return;
      }
      const decision = aiAction(room.state, bot, rngFor(room.state, botId.length));
      // たまにセリフ
      if (bot.botPersona && r.chance(0.25)) {
        const line = aiChatLine(bot, r);
        if (line) this.postChat(room, bot.name, line, false);
      }
      room.state = takeAction(room.state, botId, decision.action, decision.woodPush);
      // 噛まれたら血清で治す（手番を失わないため）
      const after = this.live(room, botId);
      if (after?.sick) {
        const serum = after.hand.find((c) => c.kind === 'serum');
        if (serum) room.state = playCard(room.state, botId, serum.id);
      }
      this.drive(room);
    }, delay);
  }

  private botTaunt(room: ServerRoom): void {
    for (const p of alivePlayers(room.state).filter((x) => x.isBot && !x.sick)) {
      const r = rngFor(room.state, p.id.charCodeAt(0) + 3);
      const line = aiChatLine(p, r);
      if (line) this.postChat(room, p.name, line, false);
    }
  }

  private ensureDeadline(room: ServerRoom, phase: string, onFire?: () => void): void {
    if (room.deadline) return;
    const ms = HUMAN_DEADLINE_MS[phase] ?? 30_000;
    room.deadlineAt = Date.now() + ms;
    room.deadline = setTimeout(() => {
      room.deadline = undefined;
      room.deadlineAt = undefined;
      if (onFire) onFire();
      else if (room.state.phase === 'action') {
        const actorId = currentActorId(room.state);
        if (actorId) room.state = takeAction(room.state, actorId, 'fish', 0);
      }
      this.drive(room);
    }, ms);
  }
  private clearTimers(room: ServerRoom): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    if (room.deadline) clearTimeout(room.deadline);
    room.botTimer = undefined;
    room.deadline = undefined;
    room.deadlineAt = undefined;
  }

  // ===== チャット =====
  chat(socketId: string, text: string): void {
    const { room, playerId } = this.ctx(socketId);
    const t = (text ?? '').trim().slice(0, 200);
    if (!t) return;
    const player = room.state.players.find((p) => p.id === playerId);
    this.postChat(room, player?.name ?? room.spectators.get(playerId) ?? '???', t, !player);
  }
  private postChat(room: ServerRoom, name: string, text: string, isSpectator: boolean): void {
    const msg: ChatMessage = { id: room.chatSeq++, name, text, isSpectator, round: room.state.round };
    room.chat.push(msg);
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
    for (const sid of room.sockets.values()) this.io.to(sid).emit('chat:msg', msg);
  }

  // ===== 出力 =====
  private broadcast(room: ServerRoom): void {
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
    const room = this.rooms.get(roomId.toUpperCase());
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
