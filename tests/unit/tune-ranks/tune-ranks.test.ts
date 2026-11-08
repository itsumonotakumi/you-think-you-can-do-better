import { describe, it, expect } from 'vitest';
import process from 'node:process';
import { loadProject } from '../../../tools/validate/project.ts';
import { simulatePaths } from '../../../tools/validate/paths.ts';
import type { Reference, RoleId, Scenario } from '../../../src/engine/types.ts';

const project = loadProject({ root: process.cwd() });
const refs = (project.references?.data ?? []) as Reference[];

const targets: { scenario: string; role: RoleId }[] = [
  { scenario: 'no01-nebula', role: 'analyst' },
  { scenario: 'no02-paybridge', role: 'analyst' },
  { scenario: 'no06-amatsu', role: 'executive' },
  { scenario: 'no08-kaname', role: 'executive' },
];

const cache = new Map<string, ReturnType<typeof simulatePaths>>();

function simulate(scenarioId: string, role: RoleId) {
  const key = `${scenarioId}/${role}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const loaded = project.scenarios.find((item) => item.id === scenarioId);
  if (!loaded) throw new Error(`シナリオがない: ${scenarioId}`);
  const simulation = simulatePaths(loaded.scenario as unknown as Scenario, refs, role, undefined, {
    randomRuns: 2000,
  });
  cache.set(key, simulation);
  return simulation;
}

describe('ランク到達の調整', () => {
  for (const { scenario, role } of targets) {
    describe(`${scenario}/${role}`, () => {
      it(
        'S〜D のすべてのランクに到達できる',
        () => {
          const simulation = simulate(scenario, role);
          expect(simulation.failures).toEqual([]);
          const ranks = new Set(simulation.runs.map((run) => run.rank));
          for (const rank of ['S', 'A', 'B', 'C', 'D'] as const) {
            expect([...ranks], `${rank} に届く経路がない`).toContain(rank);
          }
        },
        60000,
      );

      it(
        '中間の点数帯（公式スコア 200〜1199）に届く経路がある',
        () => {
          const simulation = simulate(scenario, role);
          const middle = simulation.runs.filter(
            (run) => run.official >= 200 && run.official < 1200,
          );
          expect(middle.length).toBeGreaterThan(0);
        },
        60000,
      );

      it(
        'fatal を含む経路で S に届かない',
        () => {
          const simulation = simulate(scenario, role);
          const fatalRuns = simulation.runs.filter((run) => run.fatal);
          expect(fatalRuns.length).toBeGreaterThan(0);
          expect(fatalRuns.every((run) => run.rank !== 'S')).toBe(true);
        },
        60000,
      );
    });
  }
});
