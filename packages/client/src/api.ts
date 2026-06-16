import type { ActionType, Ack, Difficulty, LeaderboardEntry, Speed } from '@hellapagos/shared';
import { socket, SERVER_URL } from './socket.js';

export async function fetchLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${SERVER_URL}/leaderboard?limit=${limit}`);
  if (!res.ok) throw new Error('ランキング取得に失敗しました');
  return (await res.json()) as LeaderboardEntry[];
}

export const api = {
  createRoom: (name: string) => new Promise<Ack>((r) => socket.emit('room:create', { name }, r)),
  joinRoom: (roomId: string, name: string) => new Promise<Ack>((r) => socket.emit('room:join', { roomId, name }, r)),
  rejoin: (roomId: string, playerId: string) => new Promise<Ack>((r) => socket.emit('room:rejoin', { roomId, playerId }, r)),
  addBot: () => socket.emit('room:addBot'),
  removeBot: (botId: string) => socket.emit('room:removeBot', { botId }),
  setConfig: (p: { soleSurvivor?: boolean; difficulty?: Difficulty; speed?: Speed }) => socket.emit('game:setConfig', p),
  start: () => socket.emit('game:start'),
  choose: (action: ActionType, woodPush = 0) => socket.emit('action:choose', { action, woodPush }),
  playCard: (cardId: string, targetId?: string | null) => socket.emit('card:play', { cardId, targetId }),
  survivalPass: () => socket.emit('survival:pass'),
  vote: (targetId: string | null) => socket.emit('vote:cast', { targetId }),
  escapeVote: (leave: boolean) => socket.emit('escape:vote', { leave }),
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
