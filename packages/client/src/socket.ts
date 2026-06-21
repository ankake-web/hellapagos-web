import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@hellapagos/shared';

// 本番（サーバが同一オリジンでクライアントを配信）では同一オリジンへ接続。
// ローカル開発（client:5174 / server:8787）は .env.development の VITE_SERVER_URL で上書き。
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787');

// 自動接続しない：オフライン対戦ではサーバへ一切繋がない（無料プランのスリープを起こさない）。
// オンライン対戦を選んだ時だけ connectSocket() で接続する。
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: false,
});

/** オンライン対戦に入るときに呼ぶ（多重呼び出しは無害）。 */
export function connectSocket(): void {
  if (!socket.connected) socket.connect();
}
