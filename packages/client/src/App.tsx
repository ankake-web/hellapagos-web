import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, PublicGameState } from '@hellapagos/shared';
import { api, clearSession, loadSession, saveSession, type Session } from './api.js';
import { socket } from './socket.js';
import { isMuted, playSound, toggleMute, startBgm, stopBgm, setBgmMood } from './sound.js';
import { loadStats, recordResult, type Stats } from './stats.js';
import { Backdrop } from './components/Backdrop.js';
import { Home } from './components/Home.js';
import { Lobby } from './components/Lobby.js';
import { Board } from './components/Board.js';
import { Menu } from './components/Menu.js';

export function App() {
  const [view, setView] = useState<PublicGameState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [recordedRoom, setRecordedRoom] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => isMuted());
  const [showConnBanner, setShowConnBanner] = useState(false);
  const sfx = useRef({ logId: -1, phase: '', weather: '', gameoverDone: false });
  const chatLen = useRef(0);

  // socket イベント購読 & 自動復帰
  useEffect(() => {
    const onState = (s: PublicGameState) => setView(s);
    const onError = (e: { message: string }) => {
      setError(e.message);
      window.setTimeout(() => setError(null), 4000);
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onChatMsg = (m: ChatMessage) => setChat((prev) => [...prev, m].slice(-80));
    const onChatHistory = (msgs: ChatMessage[]) => setChat(msgs);

    socket.on('game:state', onState);
    socket.on('error', onError);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('chat:msg', onChatMsg);
    socket.on('chat:history', onChatHistory);
    // リスナー登録前に接続が完了していた場合の取りこぼしを補正
    setConnected(socket.connected);

    const saved = loadSession();
    if (saved) {
      setSession(saved);
      const doRejoin = () =>
        api.rejoin(saved.roomId, saved.playerId).then((res) => {
          if (!res.ok) {
            clearSession();
            setSession(null);
            setView(null);
          }
        });
      if (socket.connected) doRejoin();
      else socket.once('connect', doRejoin);
    }

    return () => {
      socket.off('game:state', onState);
      socket.off('error', onError);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('chat:msg', onChatMsg);
      socket.off('chat:history', onChatHistory);
    };
  }, []);

  // 効果音：状態変化（重要イベント・フェイズ・天候・結末）に反応
  useEffect(() => {
    if (!view) return;
    const r = sfx.current;
    let sawDeath = false;
    let sawEscape = false;
    let sawSnake = false;
    const newest = view.log[view.log.length - 1];
    for (const e of view.log) {
      if (e.id <= r.logId) continue;
      if (e.kind === 'death') sawDeath = true;
      if (e.kind === 'escape') sawEscape = true;
      if (e.kind === 'snake') sawSnake = true;
    }
    if (newest) r.logId = newest.id;
    if (sawDeath) playSound('death');
    if (sawEscape) playSound('escape');
    if (sawSnake) playSound('snake');

    const w = view.hurricaneRevealed ? 'storm' : `p${view.currentPrecip}`;
    if (w !== r.weather) {
      if (view.hurricaneRevealed) playSound('storm');
      r.weather = w;
    }
    if (view.phase !== r.phase) {
      if (view.phase === 'vote') playSound('vote');
      r.phase = view.phase;
    }
    if (view.phase === 'gameover' && !r.gameoverDone) {
      r.gameoverDone = true;
      const me = view.players.find((p) => p.isYou);
      const totalEscaped = view.players.filter((p) => p.escaped).length;
      const won = view.config.soleSurvivor ? !!me?.escaped && totalEscaped === 1 : !!me?.escaped;
      if (!view.isSpectator) playSound(won ? 'win' : 'lose');
    }
  }, [view]);

  // 効果音：新着チャット
  useEffect(() => {
    if (chat.length > chatLen.current && chatLen.current > 0) playSound('chat');
    chatLen.current = chat.length;
  }, [chat.length]);

  // BGM：手続き生成のアンビエント。起動は初回タップ後（自動再生ポリシー対応）。
  useEffect(() => {
    startBgm();
    return () => stopBgm();
  }, []);
  // 嵐のラウンドは緊張モードへ切り替え
  useEffect(() => {
    setBgmMood(view?.hurricaneRevealed ? 'tense' : 'calm');
  }, [view?.hurricaneRevealed]);

  // 接続バナーは「一定時間つながらなかった場合だけ」表示（初回ロードの一瞬の点滅を防ぐ）
  useEffect(() => {
    if (connected) {
      setShowConnBanner(false);
      return;
    }
    const id = window.setTimeout(() => setShowConnBanner(true), 800);
    return () => window.clearTimeout(id);
  }, [connected]);

  // ゲーム終了時に通算戦績を記録（1ルームにつき1回・観戦者は除外）
  useEffect(() => {
    if (!view || !session) return;
    if (view.phase !== 'gameover' || view.isSpectator) return;
    if (recordedRoom === session.roomId) return;
    const me = view.players.find((p) => p.isYou);
    if (!me) return;
    const totalEscaped = view.players.filter((p) => p.escaped).length;
    const escaped = !!me.escaped;
    const won = view.config.soleSurvivor ? escaped && totalEscaped === 1 : escaped;
    setStats(recordResult({ escaped, won }));
    setRecordedRoom(session.roomId);
  }, [view, session, recordedRoom]);

  const handleCreate = async (name: string) => {
    const res = await api.createRoom(name);
    if (res.ok) {
      const s = { roomId: res.roomId, playerId: res.playerId, name };
      saveSession(s);
      setSession(s);
    } else {
      setError(res.error);
    }
  };

  const handleJoin = async (roomId: string, name: string) => {
    const res = await api.joinRoom(roomId, name);
    if (res.ok) {
      const s = { roomId: res.roomId, playerId: res.playerId, name };
      saveSession(s);
      setSession(s);
    } else {
      setError(res.error);
    }
  };

  const leave = () => {
    api.leaveRoom();
    clearSession();
    setSession(null);
    setView(null);
    setChat([]);
    setRecordedRoom(null);
    sfx.current = { logId: -1, phase: '', weather: '', gameoverDone: false };
    chatLen.current = 0;
    window.history.replaceState({}, '', window.location.pathname);
  };

  let screen;
  if (!session || !view) {
    screen = <Home onCreate={handleCreate} onJoin={handleJoin} stats={stats} />;
  } else if (view.phase === 'lobby') {
    screen = <Lobby view={view} onLeave={leave} />;
  } else {
    screen = <Board view={view} chat={chat} onSay={api.say} onLeave={leave} />;
  }

  return (
    <div className="app">
      <Backdrop />
      <button
        className="mute-btn"
        title={muted ? 'ミュート中（タップで音オン）' : 'BGM・効果音オン（タップでミュート）'}
        onClick={() => setMuted(toggleMute())}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      {session && view && <Menu midGame={view.phase !== 'lobby'} onLeave={leave} />}
      {showConnBanner && <div className="banner warn">サーバへ接続中…</div>}
      {error && <div className="toast">{error}</div>}
      {screen}
    </div>
  );
}
