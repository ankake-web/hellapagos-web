/**
 * 決定論的な疑似乱数生成器（mulberry32）。
 * state を GameState に保存し、各状態遷移の冒頭で復元・末尾で書き戻すことで、
 * 同じシードからは常に同じ展開を再現できる（テスト・リプレイに有用）。
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** [0, 1) の乱数 */
  next(): number {
    let a = this.state | 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this.state = a;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [minInclusive, maxInclusive] の整数 */
  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  /** 確率 p で true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Fisher–Yates シャッフル（新しい配列を返す） */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
