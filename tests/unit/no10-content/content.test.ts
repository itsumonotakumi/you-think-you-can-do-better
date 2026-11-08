// No.10 ネクサス半導体 / シナリオ本文の整合（報告対象の説明、ログ保存期間、確報の期限）。
// 物語の筋と配点は変えず、本文の事実関係だけを固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import referencesYaml from '../../../references/references.yaml?raw';
import leadYaml from '../../../scenarios/no10-nexus/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no10-nexus/roles/analyst.yaml?raw';
import executiveYaml from '../../../scenarios/no10-nexus/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no10-nexus/roles/officer.yaml?raw';
import type { RoleScript } from '../../../src/engine/types';

const lead = parse(leadYaml) as unknown as RoleScript;
const analyst = parse(analystYaml) as unknown as RoleScript;
const executive = parse(executiveYaml) as unknown as RoleScript;
const officer = parse(officerYaml) as unknown as RoleScript;

function voiceOf(role: RoleScript, id: string) {
  const voice = role.voices.find((v) => v.id === id);
  expect(voice, `声 ${id} が見つからない`).toBeTruthy();
  return voice!;
}

function pointOf(role: RoleScript, id: string) {
  const point = role.points.find((p) => p.id === id);
  expect(point, `判断ポイント ${id} が見つからない`).toBeTruthy();
  return point!;
}

describe('漏えい等報告の対象の説明', () => {
  const cases = [
    { name: 'executive', role: executive, voiceId: 'v06-ok' },
    { name: 'analyst', role: analyst, voiceId: 'va10-ok' },
  ];

  for (const { name, role, voiceId } of cases) {
    it(`${name} は四つの条件と、この事件の該当理由を示す`, () => {
      const voice = voiceOf(role, voiceId);
      expect(voice.misleading).toBe(false);
      for (const word of ['要配慮個人情報', '財産的被害', '不正の目的', '千人超', '千人未満']) {
        expect(voice.text.ja, `${voiceId} に ${word} がない`).toContain(word);
      }
      expect(voice.text.ja, '件数だけを理由にした断定が残っている').not.toContain('件数に関係なく');
    });
  }
});

describe('ログ保存期間と調査対象期間', () => {
  it('端末記録の保存期間は三週間に届かず、私物端末の記録も欠ける', () => {
    const text = pointOf(lead, 'p09-gap').text.ja;
    // 調査対象は解禁からの三週間。保存期間がそれを上回ると欠損の説明が成り立たない。
    expect(text).toContain('三週間');
    expect(text).toContain('二週間');
    expect(text, '保存期間が三週間を上回る説明が残っている').not.toContain('三十日で消える');
    expect(text, '管理画面の保存期間だけで欠損を説明している').not.toContain('九十日分しか残らず');
    expect(text, '私物端末という欠損の原因がない').toContain('私物端末');
  });
});

describe('確報の期限', () => {
  it('全ロールが不正の目的のおそれがある場合の60日期限を使う', () => {
    for (const [name, role] of [
      ['lead', lead],
      ['analyst', analyst],
      ['executive', executive],
      ['officer', officer],
    ] as const) {
      const deadline = (role.deadlines ?? []).find((d) => d.ref.startsWith('ppc-report-final'));
      expect(deadline, `${name} に確報の期限がない`).toBeTruthy();
      expect(deadline!.ref, `${name} の確報が60日期限でない`).toBe('ppc-report-final-malicious');
    }
    const hours = Number(
      referencesYaml.match(/- id: ppc-report-final-malicious[\s\S]*?deadlineHours: (\d+)/)?.[1],
    );
    expect(hours).toBe(60 * 24);
  });
});
