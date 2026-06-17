import { PERMANENT_KINDS, RESOURCE_CAP } from './content.js';
import { aliveCount, canEscapeAll, currentActorId } from './engine.js';
import type { CardKind, GameState, PublicGameState, PublicPlayer } from './types.js';

export function redactFor(s: GameState, viewerId: string, hostId: string): PublicGameState {
  const over = s.phase === 'gameover';
  const actorId = currentActorId(s);
  const players: PublicPlayer[] = s.players.map((p) => {
    const isYou = p.id === viewerId;
    // 永続カードは「使うまで」他者に伏せる。本人は自分の所持を常に見える。
    const heldPerms = p.hand.filter((c) => PERMANENT_KINDS.has(c.kind)).map((c) => c.kind as CardKind);
    const revealed = p.revealed ?? [];
    const permanents = isYou ? heldPerms : heldPerms.filter((k) => revealed.includes(k));
    return {
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.connected,
      alive: p.alive,
      escaped: p.escaped,
      sick: p.sick,
      resting: p.resting,
      acted: p.acted,
      handCount: p.hand.length,
      permanents,
      votesReceived: p.votesReceived,
      isYou,
      hand: isYou ? p.hand : undefined,
      vote: isYou ? p.vote : undefined,
      persona: over && p.isBot ? p.botPersona : undefined,
    };
  });

  return {
    phase: s.phase,
    round: s.round,
    players,
    food: s.food,
    water: s.water,
    foodCap: RESOURCE_CAP,
    waterCap: RESOURCE_CAP,
    raftSeats: s.raftSeats,
    raftProgress: s.raftProgress,
    seatsNeeded: aliveCount(s),
    currentPrecip: s.currentPrecip,
    hurricaneRevealed: s.hurricaneRevealed,
    weatherRemaining: s.weatherDeck.length,
    firstPlayerIndex: s.firstPlayerIndex,
    currentActorId: actorId,
    voteReason: s.voteReason,
    pendingEliminations: s.pendingEliminations,
    canEscape: canEscapeAll(s),
    isYourTurn: actorId === viewerId,
    youId: viewerId,
    hostId,
    isSpectator: !s.players.some((p) => p.id === viewerId),
    log: s.log,
    winners: s.winners,
    config: s.config,
    lastDraw: s.lastDraw,
    lastGain: s.lastGain,
  };
}
