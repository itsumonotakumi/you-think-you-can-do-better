import { describe, it, expect } from 'vitest';
import { fixture, fixtureRefs } from '../../fixtures/scenario.ts';
import type { Reference, Scenario } from '../../../src/engine/types.ts';
import { simulatePaths } from '../../../tools/validate/paths.ts';
import { checkC11, checkC12, checkC13 } from '../../../tools/validate/checks.ts';
import type { Project } from '../../../tools/validate/project.ts';

function projectFor(scenario: Scenario, refs: Reference[]): Project {
  const roleFile = `scenarios/${scenario.id}/roles/executive.yaml`;
  return {
    root: '',
    today: '2026-11-08',
    scenarios: [
      {
        id: scenario.id,
        dir: scenario.id,
        file: `scenarios/${scenario.id}/scenario.yaml`,
        sceneSource: {
          file: `scenarios/${scenario.id}/scenario.yaml`,
          data: scenario,
          errors: [],
        },
        roleSources: new Map([
          ['executive', { file: roleFile, data: scenario.roles.executive, errors: [] }],
        ]),
        scenario: scenario as unknown as Record<string, any>,
      },
    ],
    references: { file: 'references/references.yaml', data: refs, errors: [] },
    referencesById: new Map(refs.map((ref) => [ref.id, ref as unknown as Record<string, any>])),
    locales: {},
    audioManifest: null,
    audioFiles: [],
    denylist: { companies: [], services: [], people: [], countries: [], comparisons: [] },
    loadIssues: [],
  } as unknown as Project;
}

/** S に届くように点数を上げたフィクスチャ */
function boosted(): Scenario {
  const scenario = structuredClone(fixture);
  const points = scenario.roles.executive!.points;
  points[0]!.choices[0]!.points = 500; // isolate
  points[1]!.choices[1]!.points = 500; // escalate
  points[2]!.choices[0]!.points = 500; // publish
  points[3]!.choices[0]!.points = 500; // resume-safe
  return scenario;
}

function codes(issues: { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('simulatePaths', () => {
  it('方針と変種の走行がすべてエンディングに着く', () => {
    const simulation = simulatePaths(fixture, fixtureRefs, 'executive');
    expect(simulation.failures).toEqual([]);
    expect(simulation.runs.length).toBe(20);
    expect(simulation.runs.every((run) => run.finished)).toBe(true);
  });

  it('同じ入力なら同じ結果になる', () => {
    const first = simulatePaths(fixture, fixtureRefs, 'executive');
    const second = simulatePaths(fixture, fixtureRefs, 'executive');
    expect(second.runs).toEqual(first.runs);
  });

  it('最大点の方針は最小点の方針より高い', () => {
    const simulation = simulatePaths(fixture, fixtureRefs, 'executive');
    const max = simulation.runs.find((run) => run.label === 'max/best');
    const min = simulation.runs.find((run) => run.label === 'min/best');
    expect(max).toBeDefined();
    expect(min).toBeDefined();
    expect(max!.official).toBeGreaterThan(min!.official);
  });

  it('fatal を含む走行はあるが S には届かない', () => {
    const simulation = simulatePaths(fixture, fixtureRefs, 'executive');
    const fatalRuns = simulation.runs.filter((run) => run.fatal);
    expect(fatalRuns.length).toBeGreaterThan(0);
    expect(fatalRuns.every((run) => run.rank !== 'S')).toBe(true);
  });

  it('D には到達できる', () => {
    const simulation = simulatePaths(fixture, fixtureRefs, 'executive');
    expect(simulation.runs.some((run) => run.rank === 'D')).toBe(true);
  });

  it('ステップ上限を超えた走行は failures に入る', () => {
    const simulation = simulatePaths(fixture, fixtureRefs, 'executive', 1);
    expect(simulation.runs).toEqual([]);
    expect(simulation.failures.length).toBe(20);
  });
});

describe('checkC11〜C13', () => {
  it('C13 正常なシナリオではエラーなし', () => {
    expect(checkC13(projectFor(fixture, fixtureRefs))).toEqual([]);
  });

  it('C11 S と D に届けばエラーなし', () => {
    const scenario = boosted();
    expect(checkC11(projectFor(scenario, fixtureRefs))).toEqual([]);
    expect(checkC13(projectFor(scenario, fixtureRefs))).toEqual([]);
  });

  it('C11 S に届かないとエラー', () => {
    const issues = checkC11(projectFor(fixture, fixtureRefs));
    expect(codes(issues)).toContain('C11');
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true);
  });

  it('C12 fatal を含む走行があっても S にはならない', () => {
    const scenario = boosted();
    scenario.roles.executive!.points[1]!.choices[1]!.points = 1200;
    scenario.roles.executive!.points[2]!.choices[0]!.points = 800;
    const simulation = simulatePaths(scenario, fixtureRefs, 'executive');
    const fatalRuns = simulation.runs.filter((run) => run.fatal);
    expect(fatalRuns.length).toBeGreaterThan(0);
    expect(fatalRuns.every((run) => run.rank !== 'S')).toBe(true);
    expect(checkC12(projectFor(scenario, fixtureRefs))).toEqual([]);
  });

  it('C12 fatal を含まないシナリオではエラーなし', () => {
    const scenario = boosted();
    for (const point of scenario.roles.executive!.points) {
      for (const choice of point.choices) {
        if (choice.category === 'fatal') choice.category = 'hurt';
      }
    }
    expect(checkC12(projectFor(scenario, fixtureRefs))).toEqual([]);
  });
});
