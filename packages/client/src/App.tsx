import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ChatMessage, PublicGameState } from '@hellapagos/shared';
import { drawTiming } from '@hellapagos/shared';
import { emptyPlayback, gatheringPlayback, visibleTable } from './game/gatheringPlayback.js';
import { api, clearSession, loadSession, saveSession, setLocalRunner, type Session } from './api.js';
import { socket, connectSocket } from './socket.js';
import { LocalRunner } from './game/localRunner.js';
import { isMuted, playSound, toggleMute, startBgm, stopBgm, setBgmMood } from './sound.js';
import { loadStats, recordResult, type Stats } from './stats.js';
import { UiIcon } from './assets/icons.js';
import { Backdrop } from './components/Backdrop.js';
import { Home } from './components/Home.js';
import { Lobby } from './components/Lobby.js';
import { Board } from './components/Board.js';
import { Menu } from './components/Menu.js';

export function App() {
  const [playback, dispatch] = useReducer(gatheringPlayback, emptyPlayback);
  const view = useMemo(() => visibleTable(playback), [playback]);
  const setView = (next: PublicGameState | null) => dispatch({ view: next });
  const gather = playback.gathering;
  const gatherSpeed = playback.live?.config.speed;
  const revealNext = () => {
    if (gather) dispatch({ reveal: gather.id, step: gather.revealed + 1 });
  };
  useEffect(() => {
    if (!gather || !gatherSpeed || gather.settled) return;
    const timing = drawTiming(gatherSpeed);
    const delay = gather.revealed === gather.steps ? 360 : gather.revealed === 0 ? timing.first : timing.next;
    const timer = window.setTimeout(revealNext, delay);
    return () => window.clearTimeout(timer);
  }, [gather, gatherSpeed]);
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
  const localRef = useRef<LocalRunner | null>(null);

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
    if (saved && saved.offline) {
      // オフライン対戦はブラウザ内のみ。リロードでは復帰できないので破棄して新規へ。
      clearSession();
    } else if (saved) {
      setSession(saved);
      connectSocket();
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
    if (sawSnake && !(view.tableMoment?.action === 'wood' && view.tableMoment.stage === 'result')) playSound('snake');

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

  // 接続バナーは「オンラインのセッション中に一定時間つながらなかった場合だけ」表示。
  // ホーム画面やオフライン対戦中は出さない。
  useEffect(() => {
    if (connected || !session || session.offline) {
      setShowConnBanner(false);
      return;
    }
    const id = window.setTimeout(() => setShowConnBanner(true), 800);
    return () => window.clearTimeout(id);
  }, [connected, session]);

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

  const handleCreate = async (name: string, offline: boolean) => {
    setError(null);
    setChat([]);
    sfx.current = { logId: -1, phase: '', weather: '', gameoverDone: false };
    if (offline) {
      // サーバを介さずブラウザ内で進行するローカル・ランナーを使う。
      const runner = new LocalRunner({
        onState: (s) => setView(s),
        onChat: (m) => setChat((prev) => [...prev, m].slice(-80)),
      });
      localRef.current = runner;
      setLocalRunner(runner);
      const res = runner.createRoom(name);
      // オフラインは最初からCPU3人（計4人）を既定にしておく（ロビーで増減可能）
      for (let i = 0; i < 3; i++) runner.addBot();
      const s = { roomId: res.roomId, playerId: res.playerId, name, offline: true };
      saveSession(s);
      setSession(s);
      setConnected(true);
      return;
    }
    setLocalRunner(null);
    localRef.current = null;
    connectSocket();
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
    setError(null);
    setLocalRunner(null);
    localRef.current = null;
    connectSocket();
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
    api.leaveRoom(); // オフラインならローカル・ランナーを破棄、オンラインなら退出を送信
    setLocalRunner(null);
    localRef.current = null;
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
    screen = <Home onCreate={handleCreate} onJoin={handleJoin} stats={stats} error={error} />;
  } else if (view.phase === 'lobby') {
    screen = <Lobby view={view} roomId={session.roomId} onLeave={leave} offline={!!session.offline} />;
  } else {
    screen = <Board view={view} gathering={gather} onReveal={revealNext} chat={chat} onSay={api.say} onLeave={leave} />;
  }

  return (
    <div className="app">
      <Backdrop />
      <button
        className="mute-btn"
        title={muted ? 'ミュート中（タップで音オン）' : 'BGM・効果音オン（タップでミュート）'}
        aria-label={muted ? 'ミュート中（タップで音オン）' : 'BGM・効果音オン（タップでミュート）'}
        onClick={() => setMuted(toggleMute())}
      >
        <UiIcon name={muted ? 'sound-off' : 'sound-on'} size={22} />
      </button>
      {session && view && <Menu midGame={view.phase !== 'lobby'} onLeave={leave} />}
      {showConnBanner && <div className="banner warn">サーバへ接続中…</div>}
      {error && session && view && <div className="toast" role="alert">{error}</div>}
      {screen}
    </div>
  );
}
