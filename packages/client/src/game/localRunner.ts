// オフライン対戦のクライアント側ゲーム進行エンジン。
// サーバ rooms.ts の drive() をブラウザ向けに移植（LLMは使わず scriptedNegotiation にフォールバック）。
// 共有パッケージの純粋関数だけで完結するので、サーバ無しで CPU と1ゲーム遊べる。
import {
  BOT_PERSONAS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  Rng,
  addPlayer,
  aiAction,
  aiChatLine,
  aiBeforeAction,
  aiConchPlays,
  aiEscape,
  aiSurvivalPlays,
  aiVote,
  alivePlayers,
  awaiting,
  castVote,
  createGame,
  currentActorId,
  isEscapeReady,
  isSurvivalReady,
  isVoteReady,
  passSurvival,
  playCard,
  randomName,
  redactFor,
  removePlayer,
  resolveEscape,
  resolveSurvival,
  resolveVote,
  scriptedNegotiation,
  setConfig,
  setEscapeChoice,
  startGame,
  takeAction,
  thinkDelayRange,
  type ActionType,
  type BotPersona,
  type ChatMessage,
  type Difficulty,
  type GameState,
  type Player,
  type PublicGameState,
  type Speed,
} from '@hellapagos/shared';

const CHAT_HISTORY = 60;
const DRAMA_HOLD_MS = 2400;

function genId(len: number): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  let o = '';
  for (let i = 0; i < len; i++) o += a[b[i] % a.length];
  return o;
}
/** 毎ゲーム異なる展開（デッキ・天候・袋引き）にするためのランダムシード。 */
function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] | 0;
}
function rngFor(s: GameState, salt: number): Rng {
  return new Rng(s.rngState + s.round * 131 + salt * 17 + 1);
}
function latestDramaId(s: GameState): number {
  let id = -1;
  for (const e of s.log) {
    const d = e.kind === 'snake' || e.kind === 'death' || e.kind === 'escape' || e.text.includes('ハリケーン');
    if (d && e.id > id) id = e.id;
  }
  return id;
}
function clean(name: string): string {
  const t = (name ?? '').trim().slice(0, 16);
  return t.length ? t : '名無し';
}

export interface LocalConfigPatch {
  soleSurvivor?: boolean;
  difficulty?: Difficulty;
  speed?: Speed;
  timeLimit?: number;
}
export interface LocalCallbacks {
  onState: (s: PublicGameState) => void;
  onChat: (m: ChatMessage) => void;
}

/** サーバを介さず、ブラウザ内でゲームを進行させるローカル・ランナー（人間1＋CPU）。 */
export class LocalRunner {
  private state!: GameState;
  private hostId = '';
  private myId = '';
  private chat: ChatMessage[] = [];
  private chatSeq = 0;
  private botCounter = 0;
  private botTimer?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private deadlineAt?: number;
  private negTimer?: ReturnType<typeof setTimeout>;
  private holdTimer?: ReturnType<typeof setTimeout>;
  private survivalKey?: string;
  private voteKey?: string;
  private botVoteIntent = new Map<string, string | null>();
  private negotiateUntil = 0;
  private holdUntil?: number;
  private lastDramaId = -1;
  private disposed = false;

  constructor(private cb: LocalCallbacks) {}

  // ===== ロビー / 入力（api と同じ表面） =====
  createRoom(name: string): { ok: true; roomId: string; playerId: string } {
    this.myId = genId(8);
    this.hostId = this.myId;
    this.state = createGame([{ id: this.myId, name: clean(name), isBot: false }], { seed: randomSeed() });
    this.emit();
    return { ok: true, roomId: 'OFFLINE', playerId: this.myId };
  }
  addBot(): void {
    if (this.state.phase !== 'lobby' || this.state.players.length >= MAX_PLAYERS) return;
    const seed = new Uint32Array(1);
    crypto.getRandomValues(seed);
    const used = new Set(this.state.players.map((p) => p.name));
    const name = randomName(new Rng(seed[0] || 1), used);
    const persona = BOT_PERSONAS[this.botCounter % BOT_PERSONAS.length] as BotPersona;
    this.botCounter++;
    this.state = addPlayer(this.state, { id: 'bot_' + genId(6), name, isBot: true, botPersona: persona });
    this.emit();
  }
  removeBot(botId: string): void {
    if (this.state.players.find((p) => p.id === botId)?.isBot) {
      this.state = removePlayer(this.state, botId);
      this.emit();
    }
  }
  setConfig(p: LocalConfigPatch): void {
    this.state = setConfig(this.state, p);
    this.emit();
  }
  start(): void {
    if (this.state.phase !== 'lobby' || this.state.players.length < MIN_PLAYERS) return;
    this.state = startGame(this.state);
    this.drive();
  }
  choose(action: ActionType, woodPush = 0): void {
    if (currentActorId(this.state) !== this.myId) return;
    this.state = takeAction(this.state, this.myId, action, woodPush);
    this.drive();
  }
  playCard(cardId: string, targetId?: string | null): void {
    this.state = playCard(this.state, this.myId, cardId, targetId ?? undefined);
    this.drive();
  }
  survivalPass(): void {
    this.state = passSurvival(this.state, this.myId);
    this.drive();
  }
  vote(targetId: string | null): void {
    this.state = castVote(this.state, this.myId, targetId);
    this.drive();
  }
  escapeVote(leave: boolean): void {
    this.state = setEscapeChoice(this.state, this.myId, leave);
    this.drive();
  }
  say(text: string): void {
    const t = (text ?? '').trim().slice(0, 200);
    if (!t) return;
    const me = this.state.players.find((p) => p.id === this.myId);
    this.postChat(me?.name ?? '名無し', t, false);
  }
  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  // ===== 内部 =====
  private isAuto(p: Player): boolean {
    return p.isBot || !p.connected;
  }
  private live(id: string): Player | undefined {
    return this.state.players.find((p) => p.id === id);
  }
  private humanAlive(): boolean {
    return this.state.players.some((p) => !p.isBot && p.alive && !p.escaped);
  }
  private emit(): void {
    if (this.disposed) return;
    const view = redactFor(this.state, this.myId, this.hostId);
    view.deadlineAt = this.deadlineAt;
    this.cb.onState(view);
  }
  private postChat(name: string, text: string, isSpectator: boolean): void {
    const msg: ChatMessage = { id: this.chatSeq++, name, text, isSpectator, round: this.state.round };
    this.chat.push(msg);
    if (this.chat.length > CHAT_HISTORY) this.chat.splice(0, this.chat.length - CHAT_HISTORY);
    this.cb.onChat(msg);
  }

  private drive(): void {
    if (this.disposed) return;
    let guard = 0;
    while (guard++ < 4000) {
      const s = this.state;
      const aw = awaiting(s);
      if (aw === null) {
        this.clearTimers();
        this.emit();
        return;
      }

      const dId = latestDramaId(s);
      if (dId > this.lastDramaId) {
        this.lastDramaId = dId;
        this.holdUntil = Date.now() + DRAMA_HOLD_MS;
      }
      if (this.holdUntil && Date.now() < this.holdUntil) {
        this.emit();
        this.scheduleHold(this.holdUntil - Date.now());
        return;
      }

      if (aw === 'action') {
        const actorId = currentActorId(s);
        const actor = actorId ? s.players.find((p) => p.id === actorId) : undefined;
        if (!actor) return;
        if (this.isAuto(actor)) {
          if (this.botTimer) {
            this.emit();
            return;
          }
          this.scheduleBotAction(actor.id);
          this.emit();
          return;
        }
        this.ensureDeadline();
        this.emit();
        return;
      }

      if (aw === 'survival') {
        const key = `surv-${s.round}`;
        if (this.survivalKey !== key) {
          this.survivalKey = key;
          for (const p of alivePlayers(s).filter((x) => this.isAuto(x))) {
            for (const cardId of aiSurvivalPlays(this.state, this.live(p.id)!)) this.state = playCard(this.state, p.id, cardId);
            this.state = passSurvival(this.state, p.id);
          }
        }
        if (isSurvivalReady(this.state)) {
          this.state = resolveSurvival(this.state);
          continue;
        }
        this.ensureDeadline(() => {
          for (const p of alivePlayers(this.state)) this.state = passSurvival(this.state, p.id);
        });
        this.emit();
        return;
      }

      if (aw === 'vote') {
        const key = `vote-${s.round}-${s.voteReason}-${s.pendingEliminations}`;
        const useNeg = this.humanAlive();
        if (this.voteKey !== key) {
          this.voteKey = key;
          this.botVoteIntent.clear();
          // 狙撃手CPU：弾を持つなら裕福な相手を撃って人数を削る
          for (const p of alivePlayers(this.state).filter((x) => this.isAuto(x) && x.botPersona === 'sniper')) {
            if (awaiting(this.state) !== 'vote') break;
            const cur = this.live(p.id);
            const gun = cur?.hand.find((c) => c.kind === 'gun');
            const bullet = cur?.hand.find((c) => c.kind === 'bullet');
            const r = rngFor(this.state, p.id.charCodeAt(0) + 9);
            if (gun && bullet && r.chance(0.6)) {
              const rich = alivePlayers(this.state)
                .filter((t) => t.id !== p.id)
                .sort((a, b) => b.hand.length - a.hand.length)[0];
              if (rich) this.state = playCard(this.state, p.id, gun.id, rich.id);
            }
          }
          if (awaiting(this.state) !== 'vote') continue;
          this.negotiateUntil = useNeg ? Date.now() + this.negotiationMs() : 0;
          if (useNeg) this.startVoteNegotiation(key);
        }
        const past = !useNeg || Date.now() >= this.negotiateUntil;
        if (past) {
          for (const p of alivePlayers(this.state).filter((x) => this.isAuto(x) && !x.sick && x.vote === undefined)) {
            const intent = this.intentTarget(p.id);
            const r = rngFor(this.state, p.id.charCodeAt(p.id.length - 1));
            this.state = castVote(this.state, p.id, intent ?? aiVote(this.state, this.live(p.id)!, r));
          }
          // 不利な投票を受けるCPUはほら貝で無効化する
          const conchs = aiConchPlays(this.state);
          if (conchs.length) {
            for (const cp of conchs) this.state = playCard(this.state, cp.playerId, cp.cardId);
            continue;
          }
        }
        if (isVoteReady(this.state)) {
          this.state = resolveVote(this.state);
          continue;
        }
        if (useNeg && !past) this.scheduleRedrive(this.negotiateUntil - Date.now());
        else
          this.ensureDeadline(() => {
            for (const p of alivePlayers(this.state).filter((x) => !x.sick && x.vote === undefined)) this.state = castVote(this.state, p.id, null);
          });
        this.emit();
        return;
      }

      if (aw === 'escape') {
        for (const p of alivePlayers(s).filter((x) => this.isAuto(x) && x.escapeChoice === undefined)) {
          this.state = setEscapeChoice(this.state, p.id, aiEscape(this.state, this.live(p.id)!));
        }
        if (isEscapeReady(this.state)) {
          this.state = resolveEscape(this.state);
          continue;
        }
        this.ensureDeadline(() => {
          for (const p of alivePlayers(this.state).filter((x) => x.escapeChoice === undefined)) this.state = setEscapeChoice(this.state, p.id, false);
        });
        this.emit();
        return;
      }
      return;
    }
    this.emit();
  }

  private scheduleBotAction(botId: string): void {
    const [lo, hi] = thinkDelayRange(this.state.config.speed);
    const r = rngFor(this.state, botId.charCodeAt(botId.length - 1));
    const delay = lo + Math.floor(r.next() * (hi - lo));
    this.botTimer = setTimeout(() => {
      this.botTimer = undefined;
      if (this.disposed) return;
      let bot = this.live(botId);
      if (!bot || currentActorId(this.state) !== botId) {
        this.drive();
        return;
      }
      // 手番前に使うカード（永続の発動・人肉BBQ等）を先に処理する
      for (const id of aiBeforeAction(this.state, bot)) this.state = playCard(this.state, botId, id);
      bot = this.live(botId)!;
      const decision = aiAction(this.state, bot, rngFor(this.state, botId.length));
      if (bot.botPersona && r.chance(0.25)) {
        const line = aiChatLine(bot, r);
        if (line) this.postChat(bot.name, line, false);
      }
      this.state = takeAction(this.state, botId, decision.action, decision.woodPush);
      const after = this.live(botId);
      if (after?.sick) {
        const serum = after.hand.find((c) => c.kind === 'serum');
        if (serum) this.state = playCard(this.state, botId, serum.id);
      }
      this.drive();
    }, delay);
  }

  private negotiationMs(): number {
    return this.state.config.speed === 'fast' ? 5000 : this.state.config.speed === 'slow' ? 12000 : 8000;
  }
  private intentTarget(botId: string): string | null {
    const id = this.botVoteIntent.get(botId);
    if (!id) return null;
    const t = this.state.players.find((p) => p.id === id);
    return t && t.alive && !t.escaped && t.id !== botId ? id : null;
  }
  private scheduleRedrive(ms: number): void {
    if (this.negTimer) return;
    this.negTimer = setTimeout(() => {
      this.negTimer = undefined;
      if (!this.disposed) this.drive();
    }, Math.max(300, ms));
  }
  private scheduleHold(ms: number): void {
    if (this.holdTimer) return;
    this.holdTimer = setTimeout(() => {
      this.holdTimer = undefined;
      if (!this.disposed) this.drive();
    }, Math.max(200, ms));
  }
  private startVoteNegotiation(key: string): void {
    const bots = alivePlayers(this.state).filter((p) => p.isBot && !p.sick);
    bots.forEach((bot, i) => {
      const cur = this.live(bot.id);
      if (!cur) return;
      const r = rngFor(this.state, bot.id.charCodeAt(0) + 5 + i);
      const { say, voteId } = scriptedNegotiation(this.state, cur, r);
      if (voteId) this.botVoteIntent.set(bot.id, voteId);
      setTimeout(() => {
        if (!this.disposed && this.voteKey === key && say) this.postChat(bot.name, say, false);
      }, i * 700);
    });
  }

  private ensureDeadline(onFire?: () => void): void {
    if (this.deadline) return;
    const limit = this.state.config.timeLimit;
    if (!limit || limit <= 0) {
      this.deadlineAt = undefined;
      return;
    }
    const ms = limit * 1000;
    this.deadlineAt = Date.now() + ms;
    this.deadline = setTimeout(() => {
      this.deadline = undefined;
      this.deadlineAt = undefined;
      if (this.disposed) return;
      if (onFire) onFire();
      else if (this.state.phase === 'action') {
        const actorId = currentActorId(this.state);
        if (actorId) this.state = takeAction(this.state, actorId, 'fish', 0);
      }
      this.drive();
    }, ms);
  }
  private clearTimers(): void {
    [this.botTimer, this.deadline, this.negTimer, this.holdTimer].forEach((t) => t && clearTimeout(t));
    this.botTimer = this.deadline = this.negTimer = this.holdTimer = undefined;
    this.deadlineAt = undefined;
  }
}
