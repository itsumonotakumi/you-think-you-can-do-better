import { describe, it, expect } from 'vitest';
import { fixture } from '../../fixtures/scenario';
import { computeResult, multiplierFor, rankFor, salesForecast } from '../../../src/engine/scoring';
import { makeState } from './helpers';

describe('multiplierFor', () => {
  it('回数ごとの係数', () => {
    expect([1, 2, 3, 4, 5, 9].map(multiplierFor)).toEqual([1.2, 1.0, 0.8, 0.6, 0.6, 0.6]);
  });
  it('0以下は1回目と同じ', () => {
    expect(multiplierFor(0)).toBe(1.2);
    expect(multiplierFor(-3)).toBe(1.2);
  });
});

describe('rankFor', () => {
  it('しきい値', () => {
    expect(rankFor(1200, false)).toBe('S');
    expect(rankFor(1199, false)).toBe('A');
    expect(rankFor(600, false)).toBe('A');
    expect(rankFor(599, false)).toBe('B');
    expect(rankFor(200, false)).toBe('B');
    expect(rankFor(199, false)).toBe('C');
    expect(rankFor(0, false)).toBe('C');
    expect(rankFor(-1, false)).toBe('D');
  });
  it('致命的な失点があるとSにならない', () => {
    expect(rankFor(5000, true)).toBe('A');
  });
});

describe('computeResult', () => {
  it('素点が正なら係数を掛けて四捨五入する', () => {
    const state = makeState({ rawScore: 505, playCount: 1 });
    expect(computeResult(state, fixture)).toMatchObject({ raw: 505, multiplier: 1.2, official: 606, rank: 'A' });
    const rounded = makeState({ rawScore: 101, playCount: 2 });
    expect(computeResult(rounded, fixture).official).toBe(101);
    const odd = makeState({ rawScore: 101, playCount: 3 });
    expect(computeResult(odd, fixture).official).toBe(81); // 80.8 → 81
  });

  it('素点が0以下なら係数を掛けない', () => {
    const state = makeState({ rawScore: -335, playCount: 2 });
    const result = computeResult(state, fixture);
    expect(result).toMatchObject({ raw: -335, official: -335, rank: 'D' });
    expect(computeResult(makeState({ rawScore: 0 }), fixture).official).toBe(0);
  });

  it('致命的な失点を結果に含める', () => {
    const state = makeState({ rawScore: 2000, fatal: true });
    const result = computeResult(state, fixture);
    expect(result.fatal).toBe(true);
    expect(result.rank).toBe('A');
  });

  it('finished でなくても計算できる', () => {
    expect(computeResult(makeState({ finished: false }), fixture).official).toBe(0);
  });

  it('引数の状態を変更しない', () => {
    const state = makeState({ rawScore: 300 });
    const before = structuredClone(state);
    computeResult(state, fixture);
    expect(state).toEqual(before);
  });
});

describe('salesForecast', () => {
  it('最終の信頼から売上見通しを出す', () => {
    expect(salesForecast(makeState({ gauges: { damage: 0, flame: 0, trust: 75, stamina: 100 } }), fixture)).toBe(110);
    expect(salesForecast(makeState({ gauges: { damage: 0, flame: 0, trust: 50, stamina: 100 } }), fixture)).toBe(100);
  });

  it('致命的な失点で下がる', () => {
    const state = makeState({ fatal: true, gauges: { damage: 0, flame: 0, trust: 75, stamina: 100 } });
    expect(salesForecast(state, fixture)).toBe(100);
  });

  it('min・max に収める', () => {
    const low = makeState({ gauges: { damage: 0, flame: 0, trust: 0, stamina: 100 } });
    expect(salesForecast(low, fixture)).toBe(80); // 100 - 20
    const scenario = { ...fixture, salesModel: { base: 500, trustWeight: 1, fatalPenalty: 0, min: 40, max: 130 } };
    expect(salesForecast(makeState({ gauges: { damage: 0, flame: 0, trust: 100, stamina: 100 } }), scenario)).toBe(130);
    const floorScenario = { ...fixture, salesModel: { base: 0, trustWeight: 1, fatalPenalty: 0, min: 40, max: 130 } };
    expect(salesForecast(makeState({ gauges: { damage: 0, flame: 0, trust: 0, stamina: 100 } }), floorScenario)).toBe(40);
  });
});
