// Web Audio API でその場合成する効果音（音声ファイル不要）。ミュート状態は localStorage に保存。

export type SoundName =
  | 'click'
  | 'fish'
  | 'water'
  | 'wood'
  | 'search'
  | 'vote'
  | 'death'
  | 'escape'
  | 'storm'
  | 'chat'
  | 'win'
  | 'lose'
  | 'snake';

const MUTE_KEY = 'hellapagos.muted';
let muted = readMuted();
let ctx: AudioContext | null = null;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (muted) {
    // ミュート時はBGMを素早くフェードアウト
    if (bgmMaster && ctx) bgmMaster.gain.setTargetAtTime(0.00001, ctx.currentTime, 0.2);
  } else {
    ensureCtx(); // ミュート解除時にユーザー操作としてコンテキストを起こす（BGMはスケジューラが再開）
  }
  return muted;
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Tone {
  freq: number;
  to?: number; // 終了周波数（スイープ）
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone({ freq, to, dur, type = 'sine', gain = 0.15, delay = 0 }: Tone): void {
  const ac = ctx;
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.2, delay = 0): void {
  const ac = ctx;
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g).connect(ac.destination);
  src.start(t0);
}

export function playSound(name: SoundName): void {
  if (muted) return;
  const ac = ensureCtx();
  if (!ac) return;

  switch (name) {
    case 'click':
      tone({ freq: 420, dur: 0.06, type: 'triangle', gain: 0.08 });
      break;
    case 'fish':
      tone({ freq: 300, to: 520, dur: 0.18, type: 'sine' });
      break;
    case 'water':
      tone({ freq: 660, to: 880, dur: 0.16, type: 'sine', gain: 0.1 });
      break;
    case 'wood':
      tone({ freq: 200, dur: 0.1, type: 'square', gain: 0.1 });
      tone({ freq: 150, dur: 0.12, type: 'square', gain: 0.08, delay: 0.06 });
      break;
    case 'search':
      tone({ freq: 500, to: 700, dur: 0.12, type: 'triangle', gain: 0.08 });
      break;
    case 'vote':
      tone({ freq: 330, dur: 0.12, type: 'sawtooth', gain: 0.09 });
      tone({ freq: 247, dur: 0.16, type: 'sawtooth', gain: 0.09, delay: 0.1 });
      break;
    case 'death':
      tone({ freq: 380, to: 70, dur: 0.6, type: 'sawtooth', gain: 0.16 });
      noise(0.3, 0.12, 0.1);
      break;
    case 'escape':
      tone({ freq: 523, dur: 0.14, type: 'triangle', gain: 0.14 });
      tone({ freq: 659, dur: 0.14, type: 'triangle', gain: 0.14, delay: 0.13 });
      tone({ freq: 784, dur: 0.22, type: 'triangle', gain: 0.14, delay: 0.26 });
      break;
    case 'storm':
      noise(0.9, 0.22);
      tone({ freq: 90, to: 50, dur: 0.9, type: 'sawtooth', gain: 0.12 });
      break;
    case 'chat':
      tone({ freq: 880, dur: 0.05, type: 'sine', gain: 0.05 });
      break;
    case 'snake':
      noise(0.4, 0.16); // シューッ
      tone({ freq: 260, to: 120, dur: 0.4, type: 'sawtooth', gain: 0.12 });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) =>
        tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.14, delay: i * 0.12 }),
      );
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) =>
        tone({ freq: f, dur: 0.25, type: 'sawtooth', gain: 0.13, delay: i * 0.16 }),
      );
      break;
  }
}

// =====================================================================
// 手続き生成BGM（音源ファイル不要）
// ゆったりした和音パッド＋やさしいアルペジオ＋波のうねり。嵐時は低いドローン＋速めの緊張モード。
// 自動再生ポリシー対策：初回のユーザー操作で AudioContext を起こすまで音は鳴らない。
// =====================================================================
let bgmMaster: GainNode | null = null;
let bgmEnabled = false;
let bgmMood: 'calm' | 'tense' = 'calm';
let bgmTimer: number | null = null;
let bgmNextTime = 0;
let bgmStep = 0;
let bgmKicked = false;

// A マイナー系の落ち着いた進行（低めの三和音）
const PROG_CALM = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 246.94, 293.66], // G
  [261.63, 329.63, 392.0], // C
];
const PROG_TENSE = [
  [220.0, 261.63, 311.13], // Am(暗め)
  [207.65, 246.94, 311.13],
  [196.0, 233.08, 293.66],
  [174.61, 207.65, 277.18],
];

function bgmGain(): GainNode | null {
  if (!ctx) return null;
  if (!bgmMaster) {
    bgmMaster = ctx.createGain();
    bgmMaster.gain.value = 0.00001;
    bgmMaster.connect(ctx.destination);
  }
  return bgmMaster;
}

function bgmPad(freq: number, t0: number, dur: number, g: number): void {
  const ac = ctx;
  const out = bgmMaster;
  if (!ac || !out) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(g, t0 + 0.9);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function bgmPluck(freq: number, t0: number, g: number): void {
  const ac = ctx;
  const out = bgmMaster;
  if (!ac || !out) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(g, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.36);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + 0.4);
}

function bgmSwell(t0: number, g: number): void {
  const ac = ctx;
  const out = bgmMaster;
  if (!ac || !out) return;
  const dur = 2.4;
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 480;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(g, t0 + dur * 0.45);
  gain.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  src.connect(lp).connect(gain).connect(out);
  src.start(t0);
  src.stop(t0 + dur);
}

function scheduleBgm(): void {
  if (!bgmEnabled || muted) return;
  const ac = ctx; // ここでは生成しない（ジェスチャ前に suspended を作らない）
  if (!ac || ac.state !== 'running') return;
  const out = bgmGain();
  if (!out) return;
  // 目標音量へなめらかにフェードイン
  out.gain.setTargetAtTime(0.85, ac.currentTime, 1.6);

  const spb = bgmMood === 'tense' ? 0.34 : 0.46; // 1拍の長さ
  const prog = bgmMood === 'tense' ? PROG_TENSE : PROG_CALM;
  if (bgmNextTime < ac.currentTime) bgmNextTime = ac.currentTime + 0.08;
  while (bgmNextTime < ac.currentTime + 0.5) {
    const beat = bgmStep % 8;
    const chord = prog[Math.floor(bgmStep / 8) % prog.length];
    if (beat === 0) {
      chord.forEach((f) => bgmPad(f, bgmNextTime, spb * 8 * 1.05, 0.028));
      if (bgmMood === 'tense') bgmPad(chord[0] / 2, bgmNextTime, spb * 8, 0.03); // 低いドローン
    }
    const up = beat >= 4 ? 2 : 1;
    const note = chord[beat % chord.length] * up;
    if (beat % 2 === 0 || bgmMood === 'tense') bgmPluck(note, bgmNextTime, 0.02);
    if (bgmStep % 16 === 0) bgmSwell(bgmNextTime, bgmMood === 'tense' ? 0.03 : 0.016);
    bgmNextTime += spb;
    bgmStep++;
  }
}

/** BGMを有効化（実際の発音は初回ユーザー操作で AudioContext が起きてから）。 */
export function startBgm(mood: 'calm' | 'tense' = 'calm'): void {
  bgmEnabled = true;
  bgmMood = mood;
  if (bgmTimer == null) bgmTimer = window.setInterval(scheduleBgm, 120);
  // 初回のタップ/クリックで AudioContext を起こす（自動再生ポリシー対応）
  if (!bgmKicked && typeof document !== 'undefined') {
    bgmKicked = true;
    const kick = () => ensureCtx();
    document.addEventListener('pointerdown', kick, { once: true });
    document.addEventListener('keydown', kick, { once: true });
  }
}

export function setBgmMood(mood: 'calm' | 'tense'): void {
  bgmMood = mood;
}

export function stopBgm(): void {
  bgmEnabled = false;
  if (bgmMaster && ctx) bgmMaster.gain.setTargetAtTime(0.00001, ctx.currentTime, 0.4);
  if (bgmTimer != null) {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
}
