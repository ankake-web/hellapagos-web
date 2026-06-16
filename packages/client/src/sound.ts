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
  if (!muted) ensureCtx(); // ミュート解除時にユーザー操作としてコンテキストを起こす
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
