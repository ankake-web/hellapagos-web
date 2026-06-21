import type { ActionType, Ack, Difficulty, LeaderboardEntry, Speed } from '@hellapagos/shared';
import { socket, SERVER_URL } from './socket.js';
import type { LocalRunner } from './game/localRunner.js';

// オフライン対戦中はローカル・ランナーへ、オンラインはソケットへ流す。
// これにより Board / Lobby など呼び出し側は `api.xxx()` のまま無改修で両対応できる。
let local: LocalRunner | null = null;
export function setLocalRunner(r: LocalRunner | null): void {
  local = r;
}
export function isOffline(): boolean {
  return local !== null;
}

export async function fetchLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${SERVER_URL}/leaderboard?limit=${limit}`);
  if (!res.ok) throw new Error('ランキング取得に失敗しました');
  return (await res.json()) as LeaderboardEntry[];
}

type Config = { soleSurvivor?: boolean; difficulty?: Difficulty; speed?: Speed; timeLimit?: number };

export const api = {
  createRoom: (name: string) =>
    local ? Promise.resolve<Ack>(local.createRoom(name)) : new Promise<Ack>((r) => socket.emit('room:create', { name }, r)),
  joinRoom: (roomId: string, name: string) => new Promise<Ack>((r) => socket.emit('room:join', { roomId, name }, r)),
  rejoin: (roomId: string, playerId: string) => new Promise<Ack>((r) => socket.emit('room:rejoin', { roomId, playerId }, r)),
  leaveRoom: () => (local ? local.dispose() : socket.emit('room:leave')),
  addBot: () => (local ? local.addBot() : socket.emit('room:addBot')),
  removeBot: (botId: string) => (local ? local.removeBot(botId) : socket.emit('room:removeBot', { botId })),
  setConfig: (p: Config) => (local ? local.setConfig(p) : socket.emit('game:setConfig', p)),
  start: () => (local ? local.start() : socket.emit('game:start')),
  choose: (action: ActionType, woodPush = 0) =>
    local ? local.choose(action, woodPush) : socket.emit('action:choose', { action, woodPush }),
  playCard: (cardId: string, targetId?: string | null) =>
    local ? local.playCard(cardId, targetId) : socket.emit('card:play', { cardId, targetId }),
  survivalPass: () => (local ? local.survivalPass() : socket.emit('survival:pass')),
  vote: (targetId: string | null) => (local ? local.vote(targetId) : socket.emit('vote:cast', { targetId })),
  escapeVote: (leave: boolean) => (local ? local.escapeVote(leave) : socket.emit('escape:vote', { leave })),
  say: (text: string) => (local ? local.say(text) : socket.emit('chat:say', { text })),
};

const SESSION_KEY = 'hellapagos.session';
export interface Session {
  roomId: string;
  playerId: string;
  name: string;
  offline?: boolean;
}
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
