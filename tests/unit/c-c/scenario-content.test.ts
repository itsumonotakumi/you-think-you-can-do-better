// no05-kogane / no09-hamakaze の内容修正（法定期限・時系列）を固定する検査。
// 参照資料の期限（60日）と、本文の日数表現・ロール間の整合だけを見る。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import referencesYaml from '../../../references/references.yaml?raw';
import lead05Yaml from '../../../scenarios/no05-kogane/roles/lead.yaml?raw';
import analyst05Yaml from '../../../scenarios/no05-kogane/roles/analyst.yaml?raw';
import officer05Yaml from '../../../scenarios/no05-kogane/roles/officer.yaml?raw';
import lead09Yaml from '../../../scenarios/no09-hamakaze/roles/lead.yaml?raw';
import analyst09Yaml from '../../../scenarios/no09-hamakaze/roles/analyst.yaml?raw';
import officer09Yaml from '../../../scenarios/no09-hamakaze/roles/officer.yaml?raw';
import type { Reference, RoleScript } from '../../../src/engine/types';

const refs = parse(referencesYaml) as Reference[];
const refById = new Map(refs.map((ref) => [ref.id, ref]));

const role05 = {
  lead: parse(lead05Yaml) as RoleScript,
  analyst: parse(analyst05Yaml) as RoleScript,
  officer: parse(officer05Yaml) as RoleScript,
};
const role09 = {
  lead: parse(lead09Yaml) as RoleScript,
  analyst: parse(analyst09Yaml) as RoleScript,
  officer: parse(officer09Yaml) as RoleScript,
};

function finalDeadline(role: RoleScript) {
  const deadlines = role.deadlines ?? [];
  const finals = deadlines.filter((d) => d.ref.startsWith('ppc-report-final'));
  expect(finals.length, '確報の期限が1件だけ').toBe(1);
  return finals[0]!;
}

function allRefs(role: RoleScript): string[] {
  const choiceRefs = role.points.flatMap((p) => p.choices.flatMap((c) => [...(c.refs ?? []), ...(c.items ?? []).flatMap((i) => i.refs)]));
  const draftRefs = Object.values(role.drafts ?? {}).flatMap((d) =>
    d.slots.flatMap((s) => [...(s.items ?? []), ...(s.options ?? [])].flatMap((i) => i.refs)),
  );
  return [...choiceRefs, ...draftRefs];
}

describe('不正要因のある事件の確報期限', () => {
  it('参照資料の不正要因版は60日', () => {
    const ref = refById.get('ppc-report-final-malicious');
    expect(ref, 'ppc-report-final-malicious がない').toBeTruthy();
    expect(ref!.deadlineHours).toBe(60 * 24);
    const normal = refById.get('ppc-report-final');
    expect(normal!.deadlineHours).toBe(30 * 24);
  });

  it('no05 の3ロールは60日の期限を使う', () => {
    for (const [name, role] of Object.entries(role05)) {
      const final = finalDeadline(role);
      expect(final.ref, `${name} の確報期限`).toBe('ppc-report-final-malicious');
      expect(final.doneFlag.length, `${name} の doneFlag`).toBeGreaterThan(0);
      const setBy = role.points.flatMap((p) => p.choices).filter((c) => c.setFlags?.[final.doneFlag]);
      expect(setBy.length, `${name} の確報を完了にする選択肢`).toBeGreaterThanOrEqual(1);
      expect(allRefs(role), `${name} に30日版の参照が残っている`).not.toContain('ppc-report-final');
    }
  });

  it('no09 の役員は60日の期限を使う', () => {
    const final = finalDeadline(role09.officer);
    expect(final.ref).toBe('ppc-report-final-malicious');
    const setBy = role09.officer.points
      .flatMap((p) => p.choices)
      .filter((c) => c.setFlags?.[final.doneFlag]);
    expect(setBy.length, '確報を完了にする選択肢がない').toBeGreaterThanOrEqual(1);
    expect(allRefs(role09.officer)).not.toContain('ppc-report-final');
  });

  it('no05 の確報の場面は60日以内の残り日数として説明する', () => {
    const point = role05.lead.points.find((p) => p.id === 'p21-final');
    expect(point, 'p21-final がない').toBeTruthy();
    expect(point!.text.ja).toContain('60日');
    expect(point!.text.ja).not.toContain('期限が近い');
    // 場面の日付と残り日数の表現が矛盾しないこと（day 27 → 残り30日超）
    const day = point!.at?.day ?? 0;
    expect(60 - day).toBeGreaterThan(30);
  });

  it('no09 の監視の場面は復旧からの日数と一致する', () => {
    const restore = role09.analyst.points.find((p) => p.id === 'p16-restore');
    const monitor = role09.analyst.points.find((p) => p.id === 'p18-monitor');
    expect(restore && monitor, 'p16-restore / p18-monitor がない').toBeTruthy();
    expect(monitor!.text.ja).toContain('復旧から一週間');
    expect(monitor!.text.ja).not.toContain('二週間');
    const gap = (monitor!.at?.day ?? 0) - (restore!.at?.day ?? 0);
    expect(gap).toBe(7);
  });
});
