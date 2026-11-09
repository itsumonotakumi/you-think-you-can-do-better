import { describe, expect, it } from 'vitest';
import {
  hashSeed, mulberry32, orderBySeed, orderChoices, orderOptions,
} from '../../../src/app/parts/shuffle';

const items = [
  { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' },
];

function ids(list: { id: string }[]): string[] {
  return list.map((item) => item.id);
}

describe('表示だけの決定的な並べ替え', () => {
  it('同じ種なら何度並べても同じ順番になる', () => {
    const first = ids(orderBySeed(items, 'play-1\u0000point-1'));
    const second = ids(orderBySeed(items, 'play-1\u0000point-1'));
    expect(second).toEqual(first);
  });

  it('すべての id が1回ずつ残る（欠けない・重複しない）', () => {
    for (const seed of ['x', 'play-1\u0000point-1', '別のプレイ\u0000point-9', '']) {
      const shuffled = orderBySeed(items, seed);
      expect(shuffled).toHaveLength(items.length);
      expect(new Set(ids(shuffled))).toEqual(new Set(ids(items)));
    }
  });

  it('元の配列を書き換えない', () => {
    const original = ids(items);
    orderBySeed(items, 'seed');
    expect(ids(items)).toEqual(original);
  });

  it('判断IDまたはプレイIDが変われば、少なくとも1つは並びが変わる', () => {
    const base = ids(orderChoices(items, 'play-1', 'point-1'));
    const variants = ['point-2', 'point-3', 'point-4', 'point-5', 'point-6', 'point-7', 'point-8'];
    const changed = variants.map((pointId) => ids(orderChoices(items, 'play-1', pointId)))
      .some((order) => order.join(',') !== base.join(','));
    expect(changed).toBe(true);

    const otherPlay = ids(orderChoices(items, 'play-2', 'point-1'));
    expect(otherPlay).not.toEqual(base);
  });

  it('スロットの選択肢も同じ規則で決まる', () => {
    const first = ids(orderOptions(items, 'play-1', 'slot-a'));
    const again = ids(orderOptions(items, 'play-1', 'slot-a'));
    expect(again).toEqual(first);
    expect(new Set(again)).toEqual(new Set(ids(items)));
  });

  it('ハッシュと擬似乱数は同じ入力から同じ値を返す', () => {
    expect(hashSeed('same')).toBe(hashSeed('same'));
    expect(hashSeed('same')).not.toBe(hashSeed('other'));

    const a = mulberry32(hashSeed('seed'));
    const b = mulberry32(hashSeed('seed'));
    for (let i = 0; i < 5; i += 1) expect(b()).toBe(a());
  });
});
