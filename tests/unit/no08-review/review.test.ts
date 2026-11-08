// No.8 カナメ精工 / 内容レビュー（docs/reviews/no08-kaname.md）の指摘を固定する検査。
// 4ロールのデータを横断して、事実の食い違い・配点の逆転・期限の根拠を確認する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no08-kaname/scenario.yaml?raw';
import analystYaml from '../../../scenarios/no08-kaname/roles/analyst.yaml?raw';
import leadYaml from '../../../scenarios/no08-kaname/roles/lead.yaml?raw';
import executiveYaml from '../../../scenarios/no08-kaname/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no08-kaname/roles/officer.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import { CATEGORY_RANGE, PHASES } from '../../../src/engine/types';
import type {
  Choice,
  DetailItem,
  Draft,
  PressAnswer,
  PressQuestion,
  Reference,
  RoleId,
  RoleScript,
  Scenario,
} from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const roles = {
  analyst: parse(analystYaml) as RoleScript,
  lead: parse(leadYaml) as RoleScript,
  executive: parse(executiveYaml) as RoleScript,
  officer: parse(officerYaml) as RoleScript,
} satisfies Record<RoleId, RoleScript>;
const scenario: Scenario = { ...base, roles };
const refs = parse(referencesYaml) as Reference[];
const refIds = new Set(refs.map((ref) => ref.id));
const roleList = Object.entries(roles) as [RoleId, RoleScript][];

const choicesOf = (script: RoleScript): Choice[] => script.points.flatMap((p) => p.choices);
const itemsOf = (script: RoleScript): DetailItem[] => [
  ...choicesOf(script).flatMap((c) => c.items ?? []),
  ...Object.values(script.drafts ?? {}).flatMap((d: Draft) =>
    d.slots.flatMap((s) => [...(s.items ?? []), ...(s.options ?? [])]),
  ),
];
const findChoice = (script: RoleScript, id: string): Choice => {
  const choice = choicesOf(script).find((c) => c.id === id);
  if (!choice) throw new Error(`選択肢がない: ${id}`);
  return choice;
};
const question = (id: string): PressQuestion => {
  const q = scenario.press?.questions.find((item) => item.id === id);
  if (!q) throw new Error(`質問がない: ${id}`);
  return q;
};
const answer = (questionId: string, answerId: string): PressAnswer => {
  const a = question(questionId).answers.find((item) => item.id === answerId);
  if (!a) throw new Error(`回答がない: ${answerId}`);
  return a;
};

describe('no08-kaname レビュー修正', () => {
  it('記者会見は、事実と違う回答が高得点にならない条件付きで出る', () => {
    // 払っていないのに「支払った」、払ったのに「支払っていない」で点を取れない。
    expect(answer('q-ransom', 'a-ransom-paid').when).toEqual({ flags: { paidRansom: true } });
    expect(answer('q-ransom', 'a-ransom-refuse').when).toEqual({ flags: { paidRansom: false } });
    // 遮断していないのに「広げないための判断」で点を取れない。
    expect(answer('q-link', 'a-link-explain').when).toEqual({ flags: { linkCut: true } });
    expect(answer('q-link', 'a-link-own').when).toEqual({ flags: { linkCut: true } });

    // どの質問にも、条件なしで選べる回答が1つ以上残っている。
    for (const q of scenario.press?.questions ?? []) {
      const always = q.answers.filter(
        (a) => a.when === undefined && (a.requiresNote === undefined || a.requiresNote === false),
      );
      expect(always.length, `${q.id} に条件なしの回答がない`).toBeGreaterThanOrEqual(1);
    }
  });

  it('チェックシートの記入者は4ロールで一致する', () => {
    for (const [role, script] of roleList) {
      const point = script.points.find(
        (p) => p.text.ja.includes('セキュリティチェックシート') && p.text.ja.includes('丸が付いている'),
      );
      expect(point, `${role} にチェックシートの場面がない`).toBeTruthy();
      expect(point?.text.ja, `${role} の記入者が揺れている`).toContain('育休中の担当者');
      expect(point?.text.ja, `${role} に確認印の経緯がない`).toContain('確認印');
      expect(point?.text.ja, `${role} に課として提出した記述がない`).toContain('課として提出');
    }
  });

  it('ライン停止の連絡日は日曜で、曜日の食い違いがない', () => {
    for (const role of ['lead', 'executive', 'officer'] as const) {
      const note = roles[role].points.flatMap((p) => p.notable ?? []).find((n) => n.id === 'note-line');
      expect(note, `${role} に note-line がない`).toBeTruthy();
      expect(note?.text.ja, `${role} の note-line`).toContain('日曜');
      expect(note?.text.ja, `${role} の note-line`).not.toContain('月曜');
    }
    const blob = JSON.stringify(roles);
    expect(blob).not.toContain('月曜の朝から');
    expect(blob).not.toContain('月曜からライン');
  });

  it('確報の期限は60日の根拠を使う', () => {
    const analyst = roles.analyst.deadlines ?? [];
    const officer = roles.officer.deadlines ?? [];
    for (const [role, deadlines] of [['analyst', analyst], ['officer', officer]] as const) {
      const final = deadlines.find((d) => d.doneFlag.endsWith('inalMaterialsSent') || d.id === 'dl-ppc-final');
      expect(final, `${role} に確報の期限がない`).toBeTruthy();
      expect(final?.ref, `${role} の確報が不正の目的の根拠でない`).toBe('ppc-report-final-malicious');
      expect(refs.find((r) => r.id === final?.ref)?.deadlineHours).toBe(60 * 24);
    }
  });

  it('判断ポイントは時間順・フェーズ順で、配点は区分の範囲に収まる', () => {
    for (const [role, script] of roleList) {
      expect(script.points.length, role).toBeGreaterThanOrEqual(15);
      expect(script.points.length, role).toBeLessThanOrEqual(25);
      let previousAt = -1;
      let previousPhase = -1;
      for (const point of script.points) {
        const phase = PHASES.indexOf(point.phase);
        expect(phase, `${role}/${point.id} でフェーズが戻っている`).toBeGreaterThanOrEqual(previousPhase);
        previousPhase = phase;
        if (!point.at) continue;
        const at = point.at.day * 1440 + point.at.minutes;
        expect(at, `${role}/${point.id} の at が前より前`).toBeGreaterThan(previousAt);
        previousAt = at;
      }
      for (const choice of choicesOf(script)) {
        const [min, max] = CATEGORY_RANGE[choice.category];
        expect(choice.points, `${choice.id} の点が区分の外`).toBeGreaterThanOrEqual(min);
        expect(choice.points, `${choice.id} の点が区分の外`).toBeLessThanOrEqual(max);
        if (choice.category === 'fatal') expect(choice.points, choice.id).toBeLessThanOrEqual(-200);
      }
      expect(itemsOf(script).length, `${role} の細目`).toBeGreaterThanOrEqual(80);
      for (const ref of choicesOf(script).flatMap((c) => c.refs)) expect(refIds.has(ref), ref).toBe(true);
    }
  });

  it('analyst の証拠隠滅と同僚への責任転嫁は fatal', () => {
    const usb = findChoice(roles.analyst, 'a03-usb');
    expect(usb.category).toBe('fatal');
    expect(usb.setFlags?.destroyedEvidence).toBe(true);
    const leave = findChoice(roles.analyst, 'a08-leave');
    expect(leave.category).toBe('fatal');
    expect(leave.setFlags?.hidCheck).toBe(true);
    // 横並びだった誤答は、様子見より重い。
    for (const id of ['a01-off', 'a02-reply', 'a02-post', 'a06-share', 'a14-password']) {
      expect(findChoice(roles.analyst, id).points, id).toBeLessThan(-30);
    }
  });

  it('lead の復旧約束と便乗商法は、様子見より重い', () => {
    expect(findChoice(roles.lead, 'p12-promise').points).toBeLessThan(findChoice(roles.lead, 'p12-vague').points);
    expect(findChoice(roles.lead, 'p18-sell').points).toBeLessThan(findChoice(roles.lead, 'p18-refuse').points);
    expect(findChoice(roles.lead, 'p09-blame').points).toBeLessThanOrEqual(-90);
    expect(findChoice(roles.lead, 'p20-numbers').category).toBe('fatal');
  });

  it('lead に大臣会見の場面、officer に確報の判断ポイントがある', () => {
    const naming = roles.lead.points.find((p) => p.id === 'p09b-naming');
    expect(naming, 'lead に社名が出た場面がない').toBeTruthy();
    expect(naming?.text.ja).toContain('担当大臣');
    const finalReport = roles.officer.points.find((p) => p.id === 'p17b-final-report');
    expect(finalReport, 'officer に確報の判断がない').toBeTruthy();
    expect(finalReport?.phase).toBe('after');
    // 公開範囲の選択とは別に、確報を出せる選択肢がある。
    for (const id of ['p17b-file', 'p17b-file-plan']) {
      expect(findChoice(roles.officer, id).setFlags?.ppcFinalFiled).toBe(true);
    }
  });

  it('臆病批判の型は、慎重策を勧める声に付けない', () => {
    const voices = Object.fromEntries(
      roleList.map(([role, script]) => [role, script.voices]),
    ) as Record<RoleId, RoleScript['voices']>;
    const flagged: [RoleId, string][] = [
      ['executive', 'v08-coward'],
      ['executive', 'v16-coward'],
      ['executive', 'v17-coward'],
      ['officer', 'v11-coward'],
      ['officer', 'v18-coward'],
      ['officer', 'v19-coward'],
      ['analyst', 'v08-coward'],
      ['analyst', 'v16-coward'],
    ];
    for (const [role, id] of flagged) {
      const voice = voices[role].find((v) => v.id === id);
      expect(voice, `${role}/${id}`).toBeTruthy();
      expect(voice?.type, `${role}/${id} の型`).not.toBe('coward-critique');
    }
  });

  it('業種は元事件の企業を連想させない表記にする', () => {
    expect(scenario.company.industry.ja).not.toContain('プレス');
    expect(scenario.company.industry.ja).not.toContain('樹脂成形');
    expect(scenario.sourcePeriod.ja).not.toMatch(/19|20\d\d/);
  });
});
