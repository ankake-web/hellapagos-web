import type { PublicGameState } from '@hellapagos/shared';

export type GatheringAction = 'fish' | 'water' | 'wood';
export type DrawBalls = NonNullable<PublicGameState['lastDraw']>['balls'];

export interface Gathering {
  id: number;
  action: GatheringAction;
  playerId: string;
  balls: DrawBalls;
  steps: number;
  revealed: number;
  settled: boolean;
}

interface Playback {
  live: PublicGameState | null;
  before: PublicGameState | null;
  gathering: Gathering | null;
}
export const emptyPlayback: Playback = { live: null, before: null, gathering: null };

type Input = { view: PublicGameState | null } | { reveal: number; step: number };

/** Both the local runner and socket submit complete state snapshots. Keep the table,
 * log and event sounds on the preceding snapshot until the last piece is revealed. */
export function gatheringPlayback(state: Playback, input: Input): Playback {
  if ('reveal' in input) {
    const g = state.gathering;
    if (!g || g.settled || g.id !== input.reveal || input.step !== g.revealed + 1) return state;
    // The last ball is visible in flight before it lands. A cup or timber has
    // already finished moving when its single reveal timer fires.
    const settled = g.revealed === g.steps || !g.balls.length;
    return { ...state, gathering: { ...g, revealed: Math.min(input.step, g.steps), settled } };
  }
  const live = input.view;
  const m = live?.tableMoment;
  if (!live || m?.stage !== 'result' || !m.action || m.action === 'search')
    return { live, before: null, gathering: null };
  if (
    state.gathering?.id === m.id &&
    state.gathering.playerId === m.playerId &&
    state.gathering.action === m.action &&
    state.live?.hostId === live.hostId &&
    state.live?.youId === live.youId
  )
    return { ...state, live };

  const draw = live.lastDraw;
  const balls = draw?.action === m.action && draw.playerId === m.playerId ? draw.balls : [];
  const steps = Math.max(1, balls.length);
  const before =
    state.live?.hostId === live.hostId && state.live.youId === live.youId && state.live.round === live.round
      ? state.live
      : null;
  return {
    live,
    before,
    gathering: {
      id: m.id,
      playerId: m.playerId,
      action: m.action,
      balls,
      steps,
      revealed: before ? 0 : steps,
      settled: !before,
    },
  };
}

export function visibleTable({ live, before, gathering }: Playback): PublicGameState | null {
  if (!live || !before || !gathering || gathering.settled) return live;
  return {
    ...before,
    tableMoment: { ...live.tableMoment!, title: '', detail: '' },
    isYourTurn: false,
    deadlineAt: undefined,
  };
}
