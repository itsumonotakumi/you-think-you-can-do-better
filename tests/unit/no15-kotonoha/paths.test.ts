// No.15 コトノハ / 4ロールの経路テスト。
// 最高点を選び続けた経路が S、最低点を選び続けた経路が D に着くことを確かめる。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no15-kotonoha/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no15-kotonoha/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no15-kotonoha/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no15-kotonoha/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no15-kotonoha/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import {
  answerPress,
  availableAnswers,
  choose,
  computeResult,
  currentPoint,
  startPlay,
  startPress,
  submitDraft,
} from '../../../src/engine';
import type { Choice, EndingResult, PlayState, Reference, RoleId, RoleScript, Scenario } from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const roles: Record<RoleId, RoleScript> = {
  executive: parse(executiveYaml) as RoleScript,
  officer: parse(officerYaml) as RoleScript,
  lead: parse(leadYaml) as RoleScript,
  analyst: parse(analystYaml) as RoleScript,
};
const scenario: Scenario = { ...base, roles };
const refs = parse(referencesYaml) as Reference[];

const STARTED_AT = '2026-11-08T00:00:00.000Z';

/** 各判断で最大（または最小）の点数を選び、文案と会見も同じ方針で答える */
function play(role: RoleId, pickMax: boolean): EndingResult {
  const script = roles[role];
  let step = startPlay(scenario, role, 1, { comment: '', predictedHours: null }, STARTED_AT, refs);
  let state: PlayState = step.state;
  let next = step.next;
  let guard = 0;

  while (next !== 'ending') {
    guard += 1;
    if (guard > 100) throw new Error('エンディングに着かない');

    if (next === 'point') {
      const point = currentPoint(state, scenario);
      if (!point) throw new Error('判断ポイントがない');
      const ordered = [...point.choices].sort((a, b) => (pickMax ? b.points - a.points : a.points - b.points));
      step = choose(state, scenario, (ordered[0] as Choice).id);
    } else if (next === 'draft') {
      const draft = script.drafts?.[state.pendingDraft ?? ''];
      if (!draft) throw new Error(`文案がない: ${state.pendingDraft ?? ''}`);
      const selections: Record<string, string> = {};
      for (const slot of draft.slots) {
        if (slot.auto) continue;
        const candidates = [...(slot.options ?? slot.items ?? [])].sort((a, b) =>
          pickMax ? b.points - a.points : a.points - b.points,
        );
        if (candidates[0]) selections[slot.id] = candidates[0].id;
      }
      step = submitDraft(state, scenario, selections);
    } else if (next === 'press') {
      step = startPress(state, scenario);
      while (step.next === 'press') {
        const answers = [...availableAnswers(step.state, scenario)].sort((a, b) =>
          pickMax ? b.points - a.points : a.points - b.points,
        );
        step = answerPress(step.state, scenario, answers[0]?.id ?? null);
      }
    } else {
      throw new Error(`未知の遷移 ${String(next)}`);
    }

    state = step.state;
    next = step.next;
  }

  expect(next, `${role}: エンディングに着く`).toBe('ending');
  return computeResult(state, scenario);
}

describe('no15-kotonoha の経路', () => {
  for (const role of ['executive', 'officer', 'lead', 'analyst'] as const) {
    it(`${role}: 最善の経路は S、最悪の経路は D`, () => {
      const best = play(role, true);
      expect(best.fatal, `${role}: 最善の経路で致命的な失点`).toBe(false);
      expect(best.official, `${role}: 最善の公式スコア ${best.official}`).toBeGreaterThanOrEqual(1200);
      expect(best.rank, `${role}: 最善のランク`).toBe('S');

      const worst = play(role, false);
      expect(worst.official, `${role}: 最悪の公式スコア ${worst.official}`).toBeLessThan(0);
      expect(worst.rank, `${role}: 最悪のランク`).toBe('D');
    });
  }

  it('同じ選択なら同じ結果になる（乱数を使わない）', () => {
    const first = play('executive', true);
    const second = play('executive', true);
    expect(second).toEqual(first);
  });
});
