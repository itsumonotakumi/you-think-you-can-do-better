// 経路シミュレーションの修正（シード付きランダム走行・終了前処理）の確認。
import { describe, it, expect } from 'vitest';
import { fixture, fixtureRefs } from '../../fixtures/scenario.ts';
import type { Scenario } from '../../../src/engine/types.ts';
import {
  simulatePaths,
  mulberry32,
  seedFor,
  pathStateKey,
} from '../../../tools/validate/paths.ts';
import { startPlay, choose } from '../../../src/engine/index.ts';

function randomRuns(count = 2000) {
  return simulatePaths(fixture, fixtureRefs, 'executive', undefined, {
    randomRuns: count,
    seed: 20261108,
  });
}

describe('シード付き疑似乱数', () => {
  it('同じ種なら同じ並びになる', () => {
    const first = mulberry32(seedFor('fixture/executive'));
    const second = mulberry32(seedFor('fixture/executive'));
    const a = Array.from({ length: 5 }, () => first());
    const b = Array.from({ length: 5 }, () => second());
    expect(b).toEqual(a);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('状態の目印は旗・fatal・ゲージの帯を含む', () => {
    const started = startPlay(fixture, 'executive', 1, { comment: '', predictedHours: null }, '2026-11-08T00:00:00.000Z', fixtureRefs);
    const before = pathStateKey(started.state);
    const step = choose(started.state, fixture, 'wipe');
    expect(pathStateKey(step.state)).not.toBe(before);
  });
});

describe('ランダム走行', () => {
  it('方針別の20本に加えてランダム走行を追加する', () => {
    const simulation = randomRuns();
    const random = simulation.runs.filter((run) => run.label.startsWith('random/'));
    expect(simulation.failures).toEqual([]);
    expect(random.length).toBeGreaterThan(0);
    // 同じ状態に何度も入る走行は打ち切るので上限より少ない
    expect(simulation.runs.length).toBeLessThan(2020);
    expect(simulation.runs.every((run) => run.finished)).toBe(true);
  });

  it('方針別では通らない選択の組み合わせを通る', () => {
    const simulation = randomRuns();
    const policyPicks = new Set(
      simulation.runs
        .filter((run) => !run.label.startsWith('random/'))
        .map((run) => run.picks.join('>')),
    );
    const random = simulation.runs.filter((run) => run.label.startsWith('random/'));
    expect(random.some((run) => !policyPicks.has(run.picks.join('>')))).toBe(true);
  });

  it('同じシードなら同じ走行になる', () => {
    const first = randomRuns(200);
    const second = randomRuns(200);
    expect(second.runs).toEqual(first.runs);
  });

  it('ランダム走行を0本にすると方針別の20本だけ', () => {
    const simulation = simulatePaths(fixture, fixtureRefs, 'executive');
    expect(simulation.runs).toHaveLength(20);
  });
});

describe('エンディング前の終了処理', () => {
  function withoutPress(mutate: (scenario: Scenario) => void): Scenario {
    const scenario = structuredClone(fixture);
    scenario.roles.executive!.pressEnabled = false;
    mutate(scenario);
    return scenario;
  }

  function maxRun(scenario: Scenario) {
    const simulation = simulatePaths(scenario, fixtureRefs, 'executive');
    expect(simulation.failures).toEqual([]);
    const run = simulation.runs.find((entry) => entry.label === 'max/best');
    expect(run).toBeDefined();
    return run!;
  }

  it('記者会見なしでも遅延効果と未完了の期限を反映して採点する', () => {
    const base = withoutPress(() => {});
    const withEffects = withoutPress((scenario) => {
      const role = scenario.roles.executive!;
      role.deadlines = [
        { id: 'dl-never', ref: 'ref-prelim', label: { ja: '期限', en: 'Deadline' }, points: -50, doneFlag: 'never' },
      ];
      role.points[0]!.choices[0]!.delayed = [
        { afterPhases: 50, points: -100, reason: { ja: '後で響く', en: 'later' } },
      ];
    });

    const before = maxRun(base);
    const after = maxRun(withEffects);
    expect(after.official).toBeLessThan(before.official);
    expect(before.official - after.official).toBeGreaterThanOrEqual(100);
  });
});
