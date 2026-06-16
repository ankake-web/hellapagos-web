import type { Server } from 'socket.io';
import { recordResult } from './leaderboard.js';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  Rng,
  addPlayer,
  BOT_PERSONAS,
  aiChatLine,
  aiChooseAction,
  aiContribute,
  aiEscapeVote,
  aiItemPlay,
  aiVote,
  alivePlayers,
  castVote,
  chooseAction,
  createGame,
  fillDefaults,
  isAwaitingInput,
  isPhaseReady,
  playItem,
  redactFor,
  removePlayer,
  resolvePhase,
  setConfig,
  setConnected,
  setContribute,
  setEscapeVote,
  startGame,
  type ActionType,
  type BotPersona,
  type ChatMessage,
  type ClientToServerEvents,
  type GameState,
  type Phase,
  type ServerToClientEvents,
} from '@hellapagos/shared';

const PHASE_DEADLINE_MS: Record<string, number> = {
  action: 45_000,
  survival: 30_000,
  vote: 30_000,
  escape: 20_000,
};

const BOT_NAMES = [
  'CPUアカ',
  'CPUアオ',
  'CPUミドリ',
  'CPUキイロ',
  'CPUモモ',
  'CPUクロ',
  'CPUシロ',
  'CPUムラサキ',
  'CPUハイ',
  'CPUチャ',
];

interface ServerRoom {
  id: string;
  hostId: string;
  state: GameState;
  /** viewerId -> socketId（接続中のプレイヤー＋観戦者） */
  sockets: Map<string, string>;
  /** 観戦者 specId -> 表示名 */
  spectators: Map<string, string>;
  chat: ChatMessage[];
  chatSeq: number;
  /** ボットの煽りを1投票につき1回に抑えるためのキー */
  tauntKey: string;
  /** リーダーボードへ記録済みか（gameoverで1回だけ） */
  recorded: boolean;
  deadline?: ReturnType<typeof setTimeout>;
  deadlineAt?: number;
  botCounter: number;
}

const CHAT_HISTORY = 60;

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

function genId(len: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export class RoomManager {
  private rooms = new Map<string, ServerRoom>();
  /** socketId -> {roomId, playerId} */
  private socketIndex = new Map<string, { roomId: string; playerId: string }>();

  constructor(private io: IO) {}

  // ===== ロビー操作 =====

  createRoom(name: string, socketId: string): { roomId: string; playerId: string } {
    let roomId = genId(4);
    while (this.rooms.has(roomId)) roomId = genId(4);
    const playerId = genId(8);
    const state = createGame([{ id: playerId, name: sanitizeName(name), isBot: false }]);
    const room: ServerRoom = {
      id: roomId,
      hostId: playerId,
      state,
      sockets: new Map([[playerId, socketId]]),
      spectators: new Map(),
      chat: [],
      chatSeq: 0,
      tauntKey: '',
      recorded: false,
      botCounter: 0,
    };
    this.rooms.set(roomId, room);
    this.socketIndex.set(socketId, { roomId, playerId });
    this.broadcast(room);
    return { roomId, playerId };
  }

  joinRoom(
    roomId: string,
    name: string,
    socketId: string,
  ): { playerId: string; spectator: boolean } {
    const room = this.requireRoom(roomId);
    // ゲーム進行中・満員なら観戦者として参加
    if (room.state.phase !== 'lobby' || room.state.players.length >= MAX_PLAYERS) {
      const specId = 'spec_' + genId(8);
      room.spectators.set(specId, sanitizeName(name));
      room.sockets.set(specId, socketId);
      this.socketIndex.set(socketId, { roomId, playerId: specId });
      this.sendStateTo(room, specId, socketId);
      this.sendChatHistory(room, socketId);
      return { playerId: specId, spectator: true };
    }
    const playerId = genId(8);
    room.state = addPlayer(room.state, { id: playerId, name: sanitizeName(name), isBot: false });
    room.sockets.set(playerId, socketId);
    this.socketIndex.set(socketId, { roomId, playerId });
    this.sendChatHistory(room, socketId);
    this.broadcast(room);
    return { playerId, spectator: false };
  }

  rejoin(roomId: string, playerId: string, socketId: string): void {
    const room = this.requireRoom(roomId);
    const player = room.state.players.find((p) => p.id === playerId);
    if (player) {
      room.state = setConnected(room.state, playerId, true);
      room.sockets.set(playerId, socketId);
    } else {
      // 観戦者として復帰（名前が分からなければ既定名）
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
    if (room.state.phase !== 'lobby') return;
    if (room.state.players.length >= MAX_PLAYERS) throw new GameError('FULL', '満員です。');
    const name = BOT_NAMES[room.botCounter % BOT_NAMES.length] + (room.botCounter >= BOT_NAMES.length ? `${Math.floor(room.botCounter / BOT_NAMES.length) + 1}` : '');
    const persona = BOT_PERSONAS[room.botCounter % BOT_PERSONAS.length];
    const botId = 'bot_' + genId(6);
    room.botCounter++;
    room.state = addPlayer(room.state, { id: botId, name, isBot: true, botPersona: persona });
    this.broadcast(room);
  }

  removeBot(socketId: string, botId: string): void {
    const { room, playerId } = this.ctx(socketId);
    this.assertHost(room, playerId);
    const target = room.state.players.find((p) => p.id === botId);
    if (target?.isBot) {
      room.state = removePlayer(room.state, botId);
      this.broadcast(room);
    }
  }

  setConfig(socketId: string, soleSurvivor: boolean): void {
    const { room, playerId } = this.ctx(socketId);
    this.assertHost(room, playerId);
    if (room.state.phase !== 'lobby') return;
    room.state = setConfig(room.state, { soleSurvivor });
    this.broadcast(room);
  }

  startGame(socketId: string): void {
    const { room, playerId } = this.ctx(socketId);
    this.assertHost(room, playerId);
    if (room.state.phase !== 'lobby') return;
    if (room.state.players.length < MIN_PLAYERS) {
      throw new GameError('TOO_FEW', `${MIN_PLAYERS}人以上必要です（ボットを追加できます）。`);
    }
    room.state = startGame(room.state);
    this.progress(room);
  }

  // ===== プレイヤー入力 =====

  submitAction(socketId: string, action: ActionType): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = chooseAction(room.state, playerId, action);
    this.progress(room);
  }

  submitContribute(socketId: string, contribute: { food: number; water: number }): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = setContribute(room.state, playerId, contribute);
    this.progress(room);
  }

  submitVote(socketId: string, targetId: string | null): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = castVote(room.state, playerId, targetId);
    this.progress(room);
  }

  submitEscapeVote(socketId: string, leave: boolean): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = setEscapeVote(room.state, playerId, leave);
    this.progress(room);
  }

  submitItem(socketId: string, itemId: string, targetId?: string | null): void {
    const { room, playerId } = this.ctx(socketId);
    room.state = playItem(room.state, playerId, itemId, targetId ?? undefined);
    this.progress(room);
  }

  chat(socketId: string, text: string): void {
    const { room, playerId } = this.ctx(socketId);
    const clean = (text ?? '').trim().slice(0, 200);
    if (!clean) return;
    const player = room.state.players.find((p) => p.id === playerId);
    const name = player?.name ?? room.spectators.get(playerId) ?? '???';
    const msg: ChatMessage = {
      id: room.chatSeq++,
      name,
      text: clean,
      isSpectator: !player,
      day: room.state.day,
    };
    room.chat.push(msg);
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
    for (const sid of room.sockets.values()) this.io.to(sid).emit('chat:msg', msg);
  }

  // ===== 切断 =====

  handleDisconnect(socketId: string): void {
    const idx = this.socketIndex.get(socketId);
    if (!idx) return;
    this.socketIndex.delete(socketId);
    const room = this.rooms.get(idx.roomId);
    if (!room) return;
    if (room.sockets.get(idx.playerId) === socketId) room.sockets.delete(idx.playerId);

    // 観戦者の切断は席に影響しない
    if (room.spectators.has(idx.playerId)) {
      room.spectators.delete(idx.playerId);
      if (room.sockets.size === 0 && room.state.phase === 'lobby') this.closeRoom(room);
      return;
    }

    if (room.state.phase === 'lobby') {
      // ロビーでは席を削除。ホストが抜けたら委譲、無人なら部屋を閉じる。
      room.state = removePlayer(room.state, idx.playerId);
      if (room.state.players.length === 0) {
        this.closeRoom(room);
        return;
      }
      if (idx.playerId === room.hostId) {
        const next = room.state.players.find((p) => !p.isBot) ?? room.state.players[0];
        room.hostId = next.id;
      }
      this.broadcast(room);
    } else {
      // ゲーム中は切断として記録し、AIが代行（進行を止めない）
      room.state = setConnected(room.state, idx.playerId, false);
      this.progress(room);
    }
  }

  // ===== 進行エンジン =====

  private progress(room: ServerRoom): void {
    let guard = 0;
    while (guard++ < 5000) {
      if (!isAwaitingInput(room.state.phase)) break;
      this.maybeBotTaunt(room);
      this.fillAutoInputs(room);
      if (isPhaseReady(room.state)) {
        this.clearDeadline(room);
        room.state = resolvePhase(room.state);
        continue;
      }
      this.ensureDeadline(room);
      break;
    }
    this.recordIfGameOver(room);
    this.broadcast(room);
  }

  /** ゲーム終了時、人間プレイヤーの結果をリーダーボードへ1回だけ記録する。 */
  private recordIfGameOver(room: ServerRoom): void {
    if (room.state.phase !== 'gameover' || room.recorded) return;
    room.recorded = true;
    const escapedCount = room.state.players.filter((p) => p.escaped).length;
    const sole = room.state.config.soleSurvivor;
    for (const p of room.state.players) {
      if (p.isBot) continue;
      const escaped = p.escaped;
      const won = sole ? escaped && escapedCount === 1 : escaped;
      recordResult(p.name, { escaped, won });
    }
  }

  /** ボット・切断中プレイヤーの入力をAIで補完する。 */
  private fillAutoInputs(room: ServerRoom): void {
    const phase = room.state.phase;
    const autoIds = alivePlayers(room.state)
      .filter((p) => p.isBot || !p.connected)
      .map((p) => p.id);

    for (const id of autoIds) {
      const rng = new Rng(room.state.rngState + room.state.day * 131 + id.charCodeAt(id.length - 1) * 17);
      const persona = this.personaOf(room, id);

      // アイテムの自動使用（解毒剤・拳銃・睡眠薬など）。消費されるたび再評価する。
      for (let guard = 0; guard < 4; guard++) {
        const play = aiItemPlay(redactFor(room.state, id, room.hostId), persona, rng);
        if (!play) break;
        const before = room.state;
        room.state = playItem(room.state, id, play.itemId, play.targetId);
        if (room.state === before) break; // 無効プレイ（変化なし）なら打ち切り
      }

      const s = room.state;
      const p = s.players.find((x) => x.id === id);
      if (!p || !p.alive || p.escaped) continue; // 撃たれて死んだ等
      const view = redactFor(s, id, room.hostId);
      switch (phase) {
        case 'action':
          if (p.pendingAction === undefined) {
            room.state = chooseAction(s, id, aiChooseAction(view, persona, rng));
          }
          break;
        case 'survival':
          if (p.contribute === undefined) {
            room.state = setContribute(s, id, aiContribute(view, persona, rng));
          }
          break;
        case 'vote':
          if (p.vote === undefined) {
            room.state = castVote(s, id, aiVote(view, persona, rng));
          }
          break;
        case 'escape':
          if (p.escapeVote === undefined) {
            room.state = setEscapeVote(s, id, aiEscapeVote(view, persona, rng));
          }
          break;
      }
    }
  }

  private personaOf(room: ServerRoom, playerId: string): BotPersona {
    return room.state.players.find((p) => p.id === playerId)?.botPersona ?? 'cooperative';
  }

  /** 投票フェイズに入ったとき、ボットが性格に応じた煽りを1度だけ発言する。 */
  private maybeBotTaunt(room: ServerRoom): void {
    if (room.state.phase !== 'vote') return;
    const key = `${room.state.day}:vote`;
    if (room.tauntKey === key) return;
    room.tauntKey = key;

    for (const p of alivePlayers(room.state)) {
      if (!p.isBot) continue;
      const rng = new Rng(room.state.rngState + room.state.day * 7 + p.id.charCodeAt(p.id.length - 1));
      const line = aiChatLine(redactFor(room.state, p.id, room.hostId), this.personaOf(room, p.id), rng);
      if (!line) continue;
      const msg: ChatMessage = {
        id: room.chatSeq++,
        name: p.name,
        text: line,
        isSpectator: false,
        day: room.state.day,
      };
      room.chat.push(msg);
      if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
      for (const sid of room.sockets.values()) this.io.to(sid).emit('chat:msg', msg);
    }
  }

  private ensureDeadline(room: ServerRoom): void {
    if (room.deadline) return;
    const ms = PHASE_DEADLINE_MS[room.state.phase as Phase] ?? 30_000;
    room.deadlineAt = Date.now() + ms;
    room.deadline = setTimeout(() => {
      room.deadline = undefined;
      room.deadlineAt = undefined;
      // 未提出の人間プレイヤーをデフォルトで前進
      room.state = fillDefaults(room.state);
      this.progress(room);
    }, ms);
  }

  private clearDeadline(room: ServerRoom): void {
    if (room.deadline) clearTimeout(room.deadline);
    room.deadline = undefined;
    room.deadlineAt = undefined;
  }

  private broadcast(room: ServerRoom): void {
    for (const [viewerId, socketId] of room.sockets) {
      this.sendStateTo(room, viewerId, socketId);
    }
  }

  private sendStateTo(room: ServerRoom, viewerId: string, socketId: string): void {
    const view = redactFor(room.state, viewerId, room.hostId);
    view.deadlineAt = room.deadlineAt;
    this.io.to(socketId).emit('game:state', view);
  }

  private sendChatHistory(room: ServerRoom, socketId: string): void {
    if (room.chat.length > 0) this.io.to(socketId).emit('chat:history', room.chat);
  }

  private closeRoom(room: ServerRoom): void {
    this.clearDeadline(room);
    this.rooms.delete(room.id);
  }

  // ===== 内部ヘルパー =====

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

function sanitizeName(name: string): string {
  const trimmed = (name ?? '').trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : '名無し';
}
