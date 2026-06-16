import type { ActionType, Ack, LeaderboardEntry } from '@hellapagos/shared';
import { socket, SERVER_URL } from './socket.js';

export async function fetchLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${SERVER_URL}/leaderboard?limit=${limit}`);
  if (!res.ok) throw new Error('ランキング取得に失敗しました');
  return (await res.json()) as LeaderboardEntry[];
}

export const api = {
  createRoom: (name: string) =>
    new Promise<Ack>((resolve) => socket.emit('room:create', { name }, resolve)),
  joinRoom: (roomId: string, name: string) =>
    new Promise<Ack>((resolve) => socket.emit('room:join', { roomId, name }, resolve)),
  rejoin: (roomId: string, playerId: string) =>
    new Promise<Ack>((resolve) => socket.emit('room:rejoin', { roomId, playerId }, resolve)),
  addBot: () => socket.emit('room:addBot'),
  removeBot: (botId: string) => socket.emit('room:removeBot', { botId }),
  setConfig: (soleSurvivor: boolean) => socket.emit('game:setConfig', { soleSurvivor }),
  start: () => socket.emit('game:start'),
  choose: (action: ActionType) => socket.emit('action:choose', { action }),
  contribute: (food: number, water: number) =>
    socket.emit('survival:contribute', { food, water }),
  vote: (targetId: string | null) => socket.emit('vote:cast', { targetId }),
  escapeVote: (leave: boolean) => socket.emit('escape:vote', { leave }),
  playItem: (itemId: string, targetId?: string | null) =>
    socket.emit('item:play', { itemId, targetId }),
  say: (text: string) => socket.emit('chat:say', { text }),
};

const SESSION_KEY = 'hellapagos.session';

export interface Session {
  roomId: string;
  playerId: string;
  name: string;
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
