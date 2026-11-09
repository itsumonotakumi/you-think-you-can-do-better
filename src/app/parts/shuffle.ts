// 表示だけの決定的な並べ替え。エンジンの点数や選択の id には触れない。
// 同じプレイ（startedAt）と判断・部品なら、再表示しても順番は変わらない。
// 乱数は使わず、文字列ハッシュ（FNV-1a）から作った擬似乱数だけで並べる。

/** FNV-1a（32bit）。同じ文字列からは常に同じ値 */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32。種から 0〜1 の値を順に返す小さな擬似乱数 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 元の配列は変えず、種に応じた順番の新しい配列を返す */
export function orderBySeed<T extends { id: string }>(items: readonly T[], seedText: string): T[] {
  const out = items.slice();
  const random = mulberry32(hashSeed(seedText));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** 判断の選択肢。プレイID（開始時刻）と判断IDで並べる */
export function orderChoices<T extends { id: string }>(
  choices: readonly T[],
  playId: string,
  pointId: string,
): T[] {
  return orderBySeed(choices, `${playId}\u0000${pointId}`);
}

/** 文案作成の部品の選択肢。プレイIDとスロットIDで並べる */
export function orderOptions<T extends { id: string }>(
  options: readonly T[],
  playId: string,
  slotId: string,
): T[] {
  return orderBySeed(options, `${playId}\u0000${slotId}`);
}
