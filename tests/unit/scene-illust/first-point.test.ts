import { describe, expect, it } from 'vitest';
import { isFirstPointInPhase } from '../../../src/app/illustrations';
import type { DecisionPoint, PhaseId } from '../../../src/engine/types';

function point(id: string, phase: PhaseId): DecisionPoint {
  return {
    id,
    phase,
    text: { ja: id, en: id },
    choices: [
      { id: `${id}-a`, text: { ja: 'a', en: 'a' }, minutes: 15, category: 'maintain', points: 10, refs: [] },
    ],
  };
}

const points = [
  point('p1', 'contain'),
  point('p2', 'contain'),
  point('p3', 'organize'),
  point('p4', 'organize'),
  point('p5', 'investigate'),
  point('p6', 'notify'),
  point('p7', 'recover'),
  point('p8', 'after'),
];

describe('段階の最初の point か', () => {
  it('その phase が最初に出てくる point だけ true', () => {
    expect(isFirstPointInPhase(points, 'p1')).toBe(true);
    expect(isFirstPointInPhase(points, 'p2')).toBe(false);
    expect(isFirstPointInPhase(points, 'p3')).toBe(true);
    expect(isFirstPointInPhase(points, 'p4')).toBe(false);
    for (const id of ['p5', 'p6', 'p7', 'p8']) {
      expect(isFirstPointInPhase(points, id), id).toBe(true);
    }
  });

  it('直前の phase が何であっても、配列の並びだけで決まる', () => {
    // 同じ配列を途中から見ても結果は変わらない（再読み込みしても同じ）
    expect(isFirstPointInPhase(points, 'p3')).toBe(true);
    expect(isFirstPointInPhase(points.slice(2), 'p3')).toBe(true);
    expect(isFirstPointInPhase(points.slice(0, 2), 'p3')).toBe(false);
  });

  it('同じ phase が離れて2回出てきたら、前の1つだけ true', () => {
    const twice = [point('a', 'contain'), point('b', 'organize'), point('c', 'contain')];
    expect(isFirstPointInPhase(twice, 'a')).toBe(true);
    expect(isFirstPointInPhase(twice, 'b')).toBe(true);
    expect(isFirstPointInPhase(twice, 'c')).toBe(false);
  });

  it('存在しない id・空の配列・空の id は false', () => {
    expect(isFirstPointInPhase(points, 'missing')).toBe(false);
    expect(isFirstPointInPhase(points, '')).toBe(false);
    expect(isFirstPointInPhase([], 'p1')).toBe(false);
  });
});
