import { describe, it, expect } from 'vitest';
import { fixture } from '../../fixtures/scenario';
import { endingFor, salesForecast } from '../../../src/engine/ending';
import { computeResult } from '../../../src/engine/scoring';
import { makeState } from './helpers';

describe('endingFor', () => {
  it('ランクに応じた文章とBGMを返す', () => {
    const view = endingFor(makeState({ rawScore: 1200, playCount: 1 }), fixture);
    expect(view.result.rank).toBe('S');
    expect(view.text.ja).toBe('S');
    expect(view.bgm).toBe('ending_s');
  });

  it('結果は computeResult と同じ', () => {
    const state = makeState({ rawScore: 600, playCount: 2, gauges: { damage: 10, flame: 0, trust: 60, stamina: 80 } });
    expect(endingFor(state, fixture).result).toEqual(computeResult(state, fixture));
  });

  it('致命的な失点があればSの文章を返さない', () => {
    const view = endingFor(makeState({ rawScore: 2000, fatal: true }), fixture);
    expect(view.result.rank).toBe('A');
    expect(view.bgm).toBe('ending_a');
  });

  it('売上見通しを再エクスポートする', () => {
    expect(salesForecast(makeState(), fixture)).toBe(108); // 100 + (70-50)*0.4
  });
});
