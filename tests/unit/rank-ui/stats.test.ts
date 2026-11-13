import { describe, expect, it } from 'vitest';
import type { ChoiceStatsResponse } from '../../../src/engine/types';
import { choicePercent } from '../../../src/app/ranking/stats';

function stats(points: Record<string, Record<string, number>>): ChoiceStatsResponse {
  return { scenarioId: 'sc-1', role: 'executive', points, total: 40 };
}

describe('「全国の◯%がこれを選んだ」', () => {
  it('判断と選択肢の選択率を返す', () => {
    expect(choicePercent(stats({ p1: { c1: 42, c2: 58 } }), 'p1', 'c1')).toBe(42);
  });

  it('小数は四捨五入し、100% で止める', () => {
    expect(choicePercent(stats({ p1: { c1: 42.6 } }), 'p1', 'c1')).toBe(43);
    expect(choicePercent(stats({ p1: { c1: 100 } }), 'p1', 'c1')).toBe(100);
    expect(choicePercent(stats({ p1: { c1: 150 } }), 'p1', 'c1')).toBe(100);
  });

  it('データが無い・壊れているときは出さない', () => {
    expect(choicePercent(null, 'p1', 'c1')).toBeNull();
    expect(choicePercent(stats({}), 'p1', 'c1')).toBeNull();
    expect(choicePercent(stats({ p1: {} }), 'p1', 'c1')).toBeNull();
    expect(choicePercent(stats({ p1: { c1: -1 } }), 'p1', 'c1')).toBeNull();
    expect(choicePercent(stats({ p1: { c1: Number.NaN } }), 'p1', 'c1')).toBeNull();
  });

  it('プロトタイプのキーを読まない', () => {
    expect(choicePercent(stats({}), 'toString', 'c1')).toBeNull();
    expect(choicePercent(stats({ p1: { c1: 10 } }), '__proto__', 'c1')).toBeNull();
  });
});
