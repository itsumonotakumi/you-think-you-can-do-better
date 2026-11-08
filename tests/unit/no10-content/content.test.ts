// No.10 ネクサス半導体 / シナリオ本文の整合（報告対象の説明、ログ保存期間、確報の期限）。
// 物語の筋と配点は変えず、本文の事実関係だけを固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import referencesYaml from '../../../references/references.yaml?raw';
import scenarioYaml from '../../../scenarios/no10-nexus/scenario.yaml?raw';
import leadYaml from '../../../scenarios/no10-nexus/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no10-nexus/roles/analyst.yaml?raw';
import executiveYaml from '../../../scenarios/no10-nexus/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no10-nexus/roles/officer.yaml?raw';
import type { RoleScript } from '../../../src/engine/types';

const lead = parse(leadYaml) as unknown as RoleScript;
const analyst = parse(analystYaml) as unknown as RoleScript;
const executive = parse(executiveYaml) as unknown as RoleScript;
const officer = parse(officerYaml) as unknown as RoleScript;
const scenarioRaw = parse(scenarioYaml) as unknown;

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
    { name: 'executive', role: executive, voiceId: 'v06-ok', pointId: 'p06-ppc' },
    { name: 'analyst', role: analyst, voiceId: 'va10-ok', pointId: 'an10-ppc' },
  ];

  for (const { name, role, voiceId, pointId } of cases) {
    it(`${name} は四つの条件と、千人超で該当する理由を示す`, () => {
      const voice = voiceOf(role, voiceId);
      expect(voice.misleading).toBe(false);
      for (const word of ['要配慮個人情報', '財産的被害', '不正の目的', '千人超']) {
        expect(voice.text.ja, `${voiceId} に ${word} がない`).toContain(word);
      }
      // 「財産的被害のおそれ」を氏名・連絡先で説明するとガイドラインの例に当たらない。
      expect(voice.text.ja, '財産的被害で報告義務を説明している').not.toContain('財産的被害のおそれがあるので');
      expect(voice.text.ja, '件数だけを理由にした断定が残っている').not.toContain('件数に関係なく');
      expect(voice.text.ja, '千人未満でも報告が必要という説明が残っている').not.toContain('千人未満でも');
      expect(voice.text.ja, '千人超を報告理由にしていない').toContain('千人を超える');
    });

    it(`${name} の本文に、千人を超える名簿の入力がある`, () => {
      const text = pointOf(role, pointId).text.ja;
      expect(text).toContain('名簿');
      expect(text).toContain('1,800');
    });
  }
});

describe('ログ保存期間と調査対象期間', () => {
  it('端末記録の保存期間は調査対象期間に届かず、共有アカウントと私物端末の記録も欠ける', () => {
    const text = pointOf(lead, 'p09-gap').text.ja;
    expect(text).toContain('二週間');
    expect(text, '私物端末という欠損の原因がない').toContain('私物端末');
    expect(text, '共有アカウントの区別ができない点がない').toContain('共有アカウント');
    expect(text, '管理画面に本文が残ることを書いていない').toContain('入力の本文は残っている');
    expect(text, '保存期間が調査対象期間を上回る説明が残っている').not.toContain('九十日分');
  });

  it('解禁からの期間は三週間ではない', () => {
    const all = [scenarioYaml, leadYaml, analystYaml, executiveYaml, officerYaml].join('\n');
    expect(all, '元事例と同じ「三週間」が残っている').not.toContain('三週間');
    expect(all).toContain('五週間');
  });
});

describe('確報の期限', () => {
  it('不正の目的のない事案なので、全ロールが30日期限を使う', () => {
    for (const [name, role] of [
      ['lead', lead],
      ['analyst', analyst],
      ['executive', executive],
      ['officer', officer],
    ] as const) {
      const deadline = (role.deadlines ?? []).find((d) => d.ref.startsWith('ppc-report-final'));
      expect(deadline, `${name} に確報の期限がない`).toBeTruthy();
      expect(deadline!.ref, `${name} の確報が30日期限でない`).toBe('ppc-report-final');
    }
    const hours = Number(
      referencesYaml.match(/- id: ppc-report-final\n[\s\S]*?deadlineHours: (\d+)/)?.[1],
    );
    expect(hours).toBe(30 * 24);
  });

  it('社員の過失事案で、不正の目的を前提にした根拠を引用しない', () => {
    const all = [scenarioYaml, leadYaml, analystYaml, executiveYaml, officerYaml].join('\n');
    expect(all).not.toContain('ppc-report-final-malicious');
  });
});

describe('実在企業を特定できる組み合わせを残さない', () => {
  it('時期を年・月・曜日で書いていない', () => {
    const all = JSON.stringify(scenarioRaw);
    expect(all).not.toMatch(/20\d\d年/);
    expect(all).not.toMatch(/\d+月\d+日/);
    expect(all).not.toMatch(/[月火水木金土日]曜/);
  });
});
