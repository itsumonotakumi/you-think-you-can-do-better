// 乱数走行の訪問回数表を走行ごとに分けていることの確認。
import { describe, it, expect } from 'vitest';
import { fixture, fixtureRefs } from '../../fixtures/scenario.ts';
import type { Scenario } from '../../../src/engine/types.ts';
import { simulatePaths } from '../../../tools/validate/paths.ts';

/** 2判断×30択。低得点を2回選ぶと D に届く */
function twoPointsByThirty(): Scenario {
  const scenario = structuredClone(fixture);
  const role = scenario.roles.executive!;
  role.pressEnabled = false;
  role.events = [];
  role.deadlines = [];
  delete role.drafts;
  role.points = [0, 1].map((i) => ({
    id: `p-${i}`,
    phase: i === 0 ? 'detect' : 'contain',
    text: { ja: `判断${i}`, en: '' },
    choices: Array.from({ length: 30 }, (_, j) => ({
      id: `c-${i}-${j}`,
      text: { ja: `選択${j}`, en: '' },
      minutes: 15,
      category: j < 10 ? 'hurt' : j < 20 ? 'maintain' : 'increase',
      points: j < 10 ? -150 : j < 20 ? 15 : 300,
      refs: ['ref-a'],
    })),
  }));
  return scenario;
}

describe('乱数走行の打ち切り', () => {
  const scenario = twoPointsByThirty();
  const simulation = simulatePaths(scenario, fixtureRefs, 'executive', undefined, {
    randomRuns: 2000,
    seed: 20261108,
  });

  it('2000本すべてが完走する（訪問回数表を走行間で共有しない）', () => {
    expect(simulation.failures).toEqual([]);
    const random = simulation.runs.filter((run) => run.label.startsWith('random/'));
    expect(random).toHaveLength(2000);
    expect(random.every((run) => run.finished)).toBe(true);
  });

  it('2判断×30択でも D に届く', () => {
    const ranks = new Set(simulation.runs.map((run) => run.rank));
    expect(ranks.has('D')).toBe(true);
  });
});
