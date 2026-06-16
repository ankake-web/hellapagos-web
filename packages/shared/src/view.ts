import { aliveCount, getCapacity, isFinalDay } from './engine.js';
import type { GameState, PublicGameState, PublicPlayer } from './types.js';

/**
 * サーバ権威の GameState を、特定の閲覧者向けの公開状態へ変換する。
 * - 他人の隠し財産（hand）は枚数のみ
 * - 未解決の選択（行動・投票）は本人以外には真偽のみ
 * - 供出量は投票フェイズ以降に全員へ公開（議論の判断材料）
 */
export function redactFor(state: GameState, viewerId: string, hostId: string): PublicGameState {
  const revealContribution =
    state.phase === 'vote' || state.phase === 'escape' || state.phase === 'gameover';

  const players: PublicPlayer[] = state.players.map((p) => {
    const isYou = p.id === viewerId;
    const showContribution = isYou || revealContribution;
    return {
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.connected,
      alive: p.alive,
      escaped: p.escaped,
      sick: p.sick,
      handCount: p.hand.food + p.hand.water,
      itemCount: p.items.length,
      voteImmune: p.voteImmune,
      hasActed: p.pendingAction !== undefined,
      hasContributed: p.contribute !== undefined,
      hasVoted: p.vote !== undefined,
      hasEscapeVoted: p.escapeVote !== undefined,
      votesReceived: p.votesReceived,
      // 性格はゲーム終了時にのみ「答え合わせ」として公開
      persona: state.phase === 'gameover' && p.isBot ? p.botPersona : undefined,
      contributedFood: showContribution ? p.contribute?.food : undefined,
      contributedWater: showContribution ? p.contribute?.water : undefined,
      isYou,
      hand: isYou ? p.hand : undefined,
      items: isYou ? p.items : undefined,
      pendingAction: isYou ? p.pendingAction : undefined,
      vote: isYou ? p.vote : undefined,
      escapeVote: isYou ? p.escapeVote : undefined,
    };
  });

  return {
    phase: state.phase,
    day: state.day,
    players,
    food: state.food,
    water: state.water,
    wood: state.wood,
    raftCapacity: getCapacity(state),
    stormIn: state.stormIn,
    isFinalDay: isFinalDay(state),
    weather: state.weather,
    firstPlayerIndex: state.firstPlayerIndex,
    shortage: state.shortage,
    need: aliveCount(state),
    log: state.log,
    winners: state.winners,
    config: state.config,
    youId: viewerId,
    hostId,
    isSpectator: !state.players.some((p) => p.id === viewerId),
  };
}
