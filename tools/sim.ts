/**
 * 資源バランスのモンテカルロ計測。全員CPUの卓をシード固定で多数回まわし、
 * 「序盤の事故死スパイラル」「緊張ピークの位置」「平均終了ラウンド」を可視化する。
 *
 *   node --import tsx tools/sim.ts            # 既定: 各人数 400 卓
 *   node --import tsx tools/sim.ts 1000 6     # 1000卓・6人固定
 */
import {
  Rng,
  aiAction,
  aiEscape,
  aiSurvivalPlays,
  aiVote,
  alivePlayers,
  aliveCount,
  awaiting,
  castVote,
  createGame,
  currentActorId,
  isEscapeReady,
  isSurvivalReady,
  isVoteReady,
  passSurvival,
  playCard,
  resolveEscape,
  resolveSurvival,
  resolveVote,
  setEscapeChoice,
  startGame,
  takeAction,
  type BotPersona,
  type GameState,
} from '@hellapagos/shared';

const PERSONAS: BotPersona[] = ['cooperative', 'hoarder', 'sniper', 'coward'];

interface Outcome {
  endRound: number;
  escaped: number;
  total: number;
  firstVoteRound: number | null; // 最初に追放投票が発生したラウンド
  voteDeaths: number;
  starveDeaths: number; // 資源0での「カードかダイ」死
  hurricaneRound: number | null;
}

function rngFor(seed: number, salt: number): Rng {
  return new Rng((seed * 2654435761 + salt * 40503 + 1) >>> 0);
}

function simulate(n: number, seed: number): Outcome {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    name: `B${i}`,
    isBot: true,
    botPersona: PERSONAS[i % PERSONAS.length],
  }));
  let s: GameState = startGame(createGame(players, { seed, difficulty: 'normal' }));
  let firstVoteRound: number | null = null;
  let voteDeaths = 0;
  let starveDeaths = 0;
  let hurricaneRound: number | null = null;
  let prevAlive = aliveCount(s);
  let salt = 0;
  let guard = 0;

  const note = (before: GameState) => {
    // 死因のざっくり分類（投票 vs 資源0枯渇）。
    const after = aliveCount(s);
    if (after < prevAlive) {
      const lastTexts = s.log.slice(-6).map((l) => l.text).join(' ');
      const dead = prevAlive - after;
      if (s.hurricaneRevealed && hurricaneRound == null) hurricaneRound = s.round;
      if (/渇き|飢え/.test(lastTexts)) starveDeaths += dead;
      else voteDeaths += dead;
      prevAlive = after;
    }
    void before;
  };

  while (awaiting(s) !== null && guard++ < 100000) {
    const aw = awaiting(s);
    if (aw === 'action') {
      const id = currentActorId(s);
      if (!id) break;
      const bot = s.players.find((p) => p.id === id)!;
      const d = aiAction(s, bot, rngFor(seed, salt++));
      s = takeAction(s, id, d.action, d.woodPush);
      const after = s.players.find((p) => p.id === id);
      if (after?.sick) {
        const serum = after.hand.find((c) => c.kind === 'serum');
        if (serum) s = playCard(s, id, serum.id);
      }
    } else if (aw === 'survival') {
      for (const p of alivePlayers(s)) {
        for (const cid of aiSurvivalPlays(s, p)) s = playCard(s, p.id, cid);
        s = passSurvival(s, p.id);
      }
      if (isSurvivalReady(s)) {
        const before = s;
        s = resolveSurvival(s);
        note(before);
      }
    } else if (aw === 'vote') {
      if (firstVoteRound == null) firstVoteRound = s.round;
      for (const p of alivePlayers(s)) {
        if (p.sick) continue;
        s = castVote(s, p.id, aiVote(s, p, rngFor(seed, salt++)));
      }
      if (isVoteReady(s)) {
        const before = s;
        s = resolveVote(s);
        note(before);
      }
    } else if (aw === 'escape') {
      for (const p of alivePlayers(s)) s = setEscapeChoice(s, p.id, aiEscape(s, p));
      if (isEscapeReady(s)) s = resolveEscape(s);
    }
  }

  return {
    endRound: s.round,
    escaped: s.players.filter((p) => p.escaped).length,
    total: n,
    firstVoteRound,
    voteDeaths,
    starveDeaths,
    hurricaneRound,
  };
}

function pct(x: number, d: number): string {
  return `${((x / Math.max(1, d)) * 100).toFixed(1)}%`;
}

const RUNS = Number(process.argv[2] || 400);
const FIXED = process.argv[3] ? Number(process.argv[3]) : null;
const counts = FIXED ? [FIXED] : [3, 4, 6, 8, 12];

console.log(`# モンテカルロ balance（各 ${RUNS} 卓・全員CPU normal）\n`);
console.log('人数 | 平均終了R | 早期投票(R≤4) | 脱出率(≥1) | 全滅率 | 平均脱出人数 | 投票死/卓 | 枯渇死/卓 | ハリケーン平均R');
console.log('---- | --------- | ------------- | ---------- | ------ | ------------ | -------- | -------- | ---------------');
for (const n of counts) {
  let endSum = 0;
  let earlyVote = 0;
  let anyEscape = 0;
  let allDead = 0;
  let escSum = 0;
  let voteSum = 0;
  let starveSum = 0;
  let hurrSum = 0;
  let hurrCount = 0;
  for (let i = 0; i < RUNS; i++) {
    const o = simulate(n, 1000 + i);
    endSum += o.endRound;
    if (o.firstVoteRound != null && o.firstVoteRound <= 4) earlyVote++;
    if (o.escaped > 0) anyEscape++;
    if (o.escaped === 0) allDead++;
    escSum += o.escaped;
    voteSum += o.voteDeaths;
    starveSum += o.starveDeaths;
    if (o.hurricaneRound != null) {
      hurrSum += o.hurricaneRound;
      hurrCount++;
    }
  }
  console.log(
    `${String(n).padStart(2)}   | ${(endSum / RUNS).toFixed(2).padStart(7)}   | ${pct(earlyVote, RUNS).padStart(11)} | ${pct(anyEscape, RUNS).padStart(8)} | ${pct(allDead, RUNS).padStart(5)} | ${(escSum / RUNS).toFixed(2).padStart(10)}   | ${(voteSum / RUNS).toFixed(2).padStart(7)}  | ${(starveSum / RUNS).toFixed(2).padStart(7)}  | ${hurrCount ? (hurrSum / hurrCount).toFixed(2) : '—'}`,
  );
}
