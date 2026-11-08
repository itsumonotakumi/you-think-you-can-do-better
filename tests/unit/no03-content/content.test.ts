// No.3 やまびこ商店 / シナリオ内容の整合（法定期限・会見日・報告対象の説明）を固定する。
// 対象は roles/*.yaml の4ファイル。判断ポイント数・配点・細目数は変えていない前提で検査する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no03-yamabiko/scenario.yaml?raw';
import leadYaml from '../../../scenarios/no03-yamabiko/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no03-yamabiko/roles/analyst.yaml?raw';
import officerYaml from '../../../scenarios/no03-yamabiko/roles/officer.yaml?raw';
import executiveYaml from '../../../scenarios/no03-yamabiko/roles/executive.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import type { Reference, RoleScript, Scenario } from '../../../src/engine/types';

const sources: Record<string, string> = {
  lead: leadYaml,
  analyst: analystYaml,
  officer: officerYaml,
  executive: executiveYaml,
};
const roles = Object.fromEntries(
  Object.entries(sources).map(([name, text]) => [name, parse(text) as RoleScript]),
) as Record<string, RoleScript>;
const references = parse(referencesYaml) as Reference[];
const referencesById = new Map(references.map((ref) => [ref.id, ref]));
const scenario = { ...(parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>), roles } as Scenario;

/** ja の文章をすべて集める */
function collectJa(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const value of node) collectJa(value, out);
    return out;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.ja === 'string' && typeof obj.en === 'string') {
      out.push(obj.ja);
      return out;
    }
    for (const value of Object.values(obj)) collectJa(value, out);
  }
  return out;
}

/** オブジェクト内の refs 配列と deadlines の ref を集める */
function collectRefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const value of node) collectRefs(value, out);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'refs' && Array.isArray(value)) {
        for (const ref of value) if (typeof ref === 'string') out.push(ref);
      } else if (key === 'ref' && typeof value === 'string') {
        out.push(value);
      } else {
        collectRefs(value, out);
      }
    }
  }
  return out;
}

const finalDeadlines = Object.entries(roles).flatMap(([name, role]) =>
  (role.deadlines ?? []).filter((d) => d.id === 'dl-ppc-final').map((d) => ({ name, deadline: d })),
);

describe('no03-yamabiko / シナリオ内容の整合', () => {
  it('確報の期限は、不正の目的のおそれがある事件の60日を使う', () => {
    expect(finalDeadlines.length).toBeGreaterThanOrEqual(3);
    for (const { name, deadline } of finalDeadlines) {
      expect(deadline.ref, `${name} の確報が30日期限を参照している`).toBe('ppc-report-final-malicious');
      const ref = referencesById.get(deadline.ref);
      expect(ref, `${name} の根拠 ${deadline.ref} が references にない`).toBeTruthy();
      expect(ref?.deadlineHours, `${name} の確報が60日でない`).toBe(1440);
    }
  });

  it('30日期限の確報を参照する記述が残っていない', () => {
    for (const [name, text] of Object.entries(sources)) {
      expect(/ppc-report-final(?!-malicious)/.test(text), `${name} に ppc-report-final が残る`).toBe(false);
    }
  });

  it('本文に「確報が今日・近日で締め切り」という記述が残っていない', () => {
    const outdated = ['確報の期限も今日まで', '確報の期限も近い', '確報の材料も、今日が締め切りだ'];
    for (const [name, role] of Object.entries(roles)) {
      for (const ja of collectJa(role)) {
        for (const phrase of outdated) {
          expect(ja.includes(phrase), `${name} に古い期限表現「${phrase}」が残る`).toBe(false);
        }
      }
    }
  });

  it('確認済みの選択肢で確報の期限を完了できる', () => {
    for (const { name, deadline } of finalDeadlines) {
      const choices = roles[name]!.points.flatMap((point) => point.choices);
      const sets = choices.filter((choice) => choice.setFlags?.[deadline.doneFlag]);
      expect(sets.length, `${name} の ${deadline.doneFlag} を立てる選択肢がない`).toBeGreaterThanOrEqual(1);
    }
  });

  it('記者会見の日が全ロールで揃っている（31日目の朝に翌日の会見を控える）', () => {
    for (const [name, role] of Object.entries(roles)) {
      const pressPoints = role.points.filter((point) => point.text.ja.includes('会見'));
      expect(pressPoints.length, `${name} に会見の場面がない`).toBeGreaterThanOrEqual(1);
      for (const point of pressPoints) {
        expect(point.text.ja.includes('会見の1時間前'), `${name} の ${point.id} が当日直前になっている`).toBe(false);
        if (point.text.ja.includes('明日')) {
          expect(point.at?.day, `${name} の ${point.id} が前日でない`).toBe(31);
        }
      }
    }
    const analyst = roles.analyst!;
    const prep = analyst.points.find((point) => point.id === 'a18-press-prep');
    expect(prep, '会見準備の場面がない').toBeTruthy();
    expect(prep?.at).toEqual({ day: 31, minutes: 540 });
    expect(prep?.text.ja.startsWith('31日目の朝')).toBe(true);
    expect(prep?.text.ja.includes('明日')).toBe(true);
  });

  it('報告対象の説明は ppc-report-scope の条件（不正の目的・財産的被害）に沿う', () => {
    const scope = referencesById.get('ppc-report-scope');
    expect(scope, 'ppc-report-scope がない').toBeTruthy();
    for (const [name, role] of Object.entries(roles)) {
      for (const voice of role.voices) {
        if (voice.misleading) continue;
        const ja = voice.text.ja;
        if (!ja.includes('件数に関係なく')) continue;
        expect(
          ja.includes('不正の目的') || ja.includes('財産的被害'),
          `${name} の ${voice.id} が報告対象の条件を示していない`,
        ).toBe(true);
      }
    }
  });

  it('参照する根拠IDがすべて references にある', () => {
    for (const [name, role] of Object.entries(roles)) {
      for (const ref of new Set(collectRefs(role))) {
        expect(referencesById.has(ref), `${name} の根拠 ${ref} が references にない`).toBe(true);
      }
    }
  });

  it('法定期限の本数は、全ロールが速報と確報の2本を持つ', () => {
    expect(roles.lead?.deadlines?.length).toBe(2);
    expect(roles.analyst?.deadlines?.length).toBe(2);
    expect(roles.officer?.deadlines?.length).toBe(2);
    expect(roles.executive?.deadlines?.length).toBe(2);
  });

  it('判断ポイント数と細目数は従来どおり', () => {
    expect(roles.lead?.points.length).toBe(20);
    expect(roles.analyst?.points.length).toBe(18);
    expect(roles.officer?.points.length).toBe(18);
    expect(roles.executive?.points.length).toBe(16);
  });

  it('証拠を消す選択が加点されない', () => {
    const evidenceLoss = [
      ['lead', 'p02-remove'],
      ['officer', 'p02-erase'],
      ['executive', 'p05-cheap'],
      ['analyst', 'a03-delete'],
    ] as const;
    for (const [name, choiceId] of evidenceLoss) {
      const choice = roles[name]?.points.flatMap((point) => point.choices).find((c) => c.id === choiceId);
      expect(choice, `${name} に ${choiceId} がない`).toBeTruthy();
      expect(choice?.points, `${name} の ${choiceId} が加点されている`).toBeLessThan(0);
    }
  });

  it('スナップショット後の復旧手段の誤りは致命ではなく減点に収める', () => {
    for (const [name, role] of Object.entries(roles)) {
      for (const choice of role.points.flatMap((point) => point.choices)) {
        if (!choice.text.ja.includes('バックアップから戻す')) continue;
        expect(choice.category, `${name} の ${choice.id} が致命扱い`).toBe('hurt');
      }
    }
  });

  it('記者会見の回答は、旗が立たないと選べないものがあっても条件なしの回答を残す', () => {
    for (const question of scenario.press?.questions ?? []) {
      expect(
        question.answers.some((answer) => !answer.when && !answer.requiresNote),
        `${question.id} に条件なしで選べる回答がない`,
      ).toBe(true);
    }
    const oldQuestion = scenario.press?.questions.find((question) => question.id === 'q-old');
    const oldRecord = oldQuestion?.answers.find((answer) => answer.id === 'a-old-record');
    expect(oldRecord?.when, 'a-old-record が古い複製の削除を確認していなくても選べる').toEqual({
      flags: { oldCopyRemoved: true },
    });
  });

  it('会見の時系列がゲーム内の公表日と合っている', () => {
    for (const question of scenario.press?.questions ?? []) {
      for (const answer of question.answers) {
        expect(answer.text.ja.includes('3日前'), `${answer.id} が検知日を3日前としている`).toBe(false);
      }
    }
  });
});
