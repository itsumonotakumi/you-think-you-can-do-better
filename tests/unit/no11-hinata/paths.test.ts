// No.11 ヒナタマート / 経路と法定期限の検査。
// 物流委託先のランサムウェア被害で通販が止まる話を、4ロールすべてで最後まで通せるかを見る。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no11-hinata/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no11-hinata/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no11-hinata/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no11-hinata/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no11-hinata/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import { simulatePaths } from '../../../tools/validate/paths.ts';
import { startPlay, startPress } from '../../../src/engine/index';
import { ROLES } from '../../../src/engine/types';
import type { Choice, Reference, RoleId, RoleScript, Scenario } from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const refs = parse(referencesYaml) as Reference[];
const roles: Record<RoleId, RoleScript> = {
  executive: parse(executiveYaml) as RoleScript,
  officer: parse(officerYaml) as RoleScript,
  lead: parse(leadYaml) as RoleScript,
  analyst: parse(analystYaml) as RoleScript,
};
const scenario: Scenario = { ...base, roles };

const startedAt = '2026-11-13T00:00:00.000Z';

function script(role: RoleId): RoleScript {
  return roles[role];
}

function choicesOf(role: RoleId): Choice[] {
  return script(role).points.flatMap((point) => point.choices);
}

function pointsOf(role: RoleId, choiceId: string): number {
  const choice = choicesOf(role).find((c) => c.id === choiceId);
  expect(choice, `${role} の ${choiceId} がない`).toBeTruthy();
  return choice!.points;
}

function pressQuestionIds(flags: Record<string, boolean>): string[] {
  const started = startPlay(
    scenario,
    'executive',
    1,
    { comment: '', predictedHours: null },
    startedAt,
    refs,
  );
  const opened = startPress({ ...started.state, flags: { ...started.state.flags, ...flags } }, scenario);
  return opened.state.press?.questionIds ?? [];
}

describe('経路（C11〜C13）', () => {
  for (const role of ROLES) {
    it(`${role} は全ランクに到達でき、どの選び方でもエンディングに着く`, () => {
      const simulation = simulatePaths(scenario, refs, role, undefined, { randomRuns: 400 });
      expect(simulation.failures).toEqual([]);
      expect(simulation.runs.length).toBeGreaterThan(0);
      expect(simulation.runs.every((run) => run.finished)).toBe(true);
      const ranks = new Set(simulation.runs.map((run) => run.rank));
      for (const rank of ['S', 'A', 'B', 'C', 'D'] as const) {
        expect(ranks.has(rank), `${role} は ${rank} に届かない`).toBe(true);
      }
    });

    it(`${role} は致命的な失点を含む経路で S に届かない`, () => {
      const simulation = simulatePaths(scenario, refs, role, undefined, { randomRuns: 200 });
      const fatalS = simulation.runs.filter((run) => run.fatal && run.rank === 'S');
      expect(fatalS).toEqual([]);
    });
  }
});

describe('法定期限', () => {
  it('速報は72時間、確報は不正の目的のおそれがある前提で60日', () => {
    const prelim = refs.find((ref) => ref.id === 'ppc-report-prelim');
    const final = refs.find((ref) => ref.id === 'ppc-report-final-malicious');
    expect(prelim?.deadlineHours).toBe(72);
    expect(final?.deadlineHours).toBe(60 * 24);
  });

  it('全ロールが速報と確報の期限を持ち、期日までに済ませる選択肢がある', () => {
    for (const role of ROLES) {
      const deadlines = script(role).deadlines ?? [];
      const prelim = deadlines.find((d) => d.ref === 'ppc-report-prelim');
      const final = deadlines.find((d) => d.ref === 'ppc-report-final-malicious');
      expect(prelim, `${role} に速報の期限がない`).toBeTruthy();
      expect(final, `${role} に確報の期限がない`).toBeTruthy();
      const doneFlags = new Set(
        choicesOf(role).flatMap((choice) => Object.entries(choice.setFlags ?? {}))
          .filter(([, value]) => value === true)
          .map(([key]) => key),
      );
      expect(doneFlags.has(prelim!.doneFlag), `${role} に速報を済ませる選択肢がない`).toBe(true);
      expect(doneFlags.has(final!.doneFlag), `${role} に確報を済ませる選択肢がない`).toBe(true);
    }
  });

  it('速報の判断は、期限の72時間より前に置かれている', () => {
    const prelimPoint = {
      executive: 'p07-ppc',
      officer: 'o05-ppc',
      lead: 'l06-ppc',
      analyst: 'a06-ppc',
    } as const;
    for (const role of ROLES) {
      const point = script(role).points.find((p) => p.id === prelimPoint[role]);
      expect(point, `${role} の速報の判断がない`).toBeTruthy();
      const due = 3 * 24 * 60;
      const at = (point!.at!.day * 24 * 60) + point!.at!.minutes - (base.start.day * 24 * 60 + base.start.minutes);
      expect(at, `${role} の速報の判断が期限を過ぎている`).toBeLessThan(due);
    }
  });
});

describe('記者会見の出し分け', () => {
  it('身代金を払っていなければ、支払いを問う質問が出る', () => {
    const ids = pressQuestionIds({});
    expect(ids).toContain('q-ransom');
    expect(ids).not.toContain('q-ransom-paid');
    const question = scenario.press!.extraQuestions!.find((e) => e.question.id === 'q-ransom')!.question;
    expect(question.answers.some((answer) => answer.id === 'a-ransom-paid')).toBe(true);
    expect(question.answers.some((answer) => answer.id === 'a-ransom-refuse')).toBe(true);
  });

  it('身代金を払った場合だけ、支払いを認める回答が出る', () => {
    const ids = pressQuestionIds({ paidRansom: true });
    expect(ids).toContain('q-ransom-paid');
    expect(ids).not.toContain('q-ransom');
    const question = scenario.press!.extraQuestions!.find((e) => e.question.id === 'q-ransom-paid')!.question;
    expect(question.answers.some((answer) => answer.text.ja.includes('支払いました'))).toBe(true);
    expect(question.answers.some((answer) => answer.id === 'a-ransom-paid-deny')).toBe(true);
  });

  it('隠した場合と受注を続けた場合に、追及の質問が増える', () => {
    expect(pressQuestionIds({ hidAttack: true })).toContain('q-hidden');
    expect(pressQuestionIds({ continuedSales: true })).toContain('q-orders');
    expect(pressQuestionIds({})).not.toContain('q-hidden');
    expect(pressQuestionIds({})).not.toContain('q-orders');
  });

  it('記録が要る回答は、どのロールでも記録を取れる', () => {
    const questions = [
      ...scenario.press!.questions,
      ...(scenario.press!.extraQuestions ?? []).map((extra) => extra.question),
    ];
    const required = new Set(
      questions.flatMap((question) =>
        question.answers.flatMap((answer) =>
          typeof answer.requiresNote === 'string' ? [answer.requiresNote] : [],
        ),
      ),
    );
    expect(required.size).toBeGreaterThan(0);
    for (const role of ROLES) {
      const notes = new Set(
        script(role).points.flatMap((point) => (point.notable ?? []).map((note) => note.id)),
      );
      for (const id of required) {
        expect(notes.has(id), `${role} は ${id} を記録できない`).toBe(true);
      }
    }
  });
});

describe('物語の筋', () => {
  it('自社は感染していないまま、委託先の被害として扱う', () => {
    const text = JSON.stringify({ scenario: base, roles });
    expect(text).toContain('自社');
    expect(text, '自社が感染した話になっている').not.toContain('自社の端末が暗号化');
    expect(text).toContain('ハコブ物流');
  });

  it('段階再開と全面再開の判断が、4ロールすべてにある', () => {
    const phased = { executive: 'p14-b-phased', officer: 'o14-b-phased', lead: 'l11-c-numbers', analyst: 'a15-c-ledger' } as const;
    for (const role of ROLES) {
      expect(pointsOf(role, phased[role]), `${role} の段階再開が加点でない`).toBeGreaterThan(0);
    }
  });

  it('同じ委託先を使う他社との横並びを、待たずに自社の事実で説明する選択肢が加点', () => {
    expect(pointsOf('executive', 'p09-b-own')).toBeGreaterThan(0);
    expect(pointsOf('officer', 'o08-c-own')).toBeGreaterThan(0);
    expect(pointsOf('executive', 'p09-a-wait-peers')).toBeLessThan(0);
  });

  it('委託先の監督責任を、契約の有無にかかわらず自社の問題として扱う', () => {
    expect(pointsOf('executive', 'p10-b-joint')).toBeGreaterThan(0);
    expect(pointsOf('lead', 'l07-c-inventory')).toBeGreaterThan(0);
    expect(pointsOf('analyst', 'a14-b-detail')).toBeGreaterThan(0);
    expect(pointsOf('executive', 'p10-a-blame')).toBeLessThan(0);
  });
});
