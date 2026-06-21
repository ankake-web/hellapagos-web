import { RESOURCE_CAP } from './content.js';
import { aliveCount, canEscapeAll, currentActorId } from './engine.js';
import type { GameState, PublicGameState, PublicPlayer } from './types.js';

export function redactFor(s: GameState, viewerId: string, hostId: string): PublicGameState {
  const over = s.phase === 'gameover';
  const actorId = currentActorId(s);
  const players: PublicPlayer[] = s.players.map((p) => {
    const isYou = p.id === viewerId;
    // 永続カードは「使って（発動して）初めて」場に公開される。未使用の永続は本人の手札にあるだけ。
    const permanents = [...(p.revealed ?? [])];
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
    bodiesAvailable: s.bodiesAvailable ?? 0,
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
    // 望遠鏡でのぞいた手札は、のぞいた本人にだけ届ける
    peek: s.lastPeek && s.lastPeek.byId === viewerId ? { targetName: s.lastPeek.targetName, hand: s.lastPeek.hand } : undefined,
  };
}
