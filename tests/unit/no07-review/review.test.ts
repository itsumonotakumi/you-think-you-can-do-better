// No.7 コネクトコール / レビュー指摘（docs/reviews/no07-connectcall.md）の回帰検査。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no07-connectcall/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no07-connectcall/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no07-connectcall/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no07-connectcall/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no07-connectcall/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import { PHASES } from '../../../src/engine/types';
import type { Reference, RoleScript, Scenario } from '../../../src/engine/types';

const scenario = parse(scenarioYaml) as unknown as Scenario;
const refs = parse(referencesYaml) as Reference[];
const executive = parse(executiveYaml) as RoleScript;
const officer = parse(officerYaml) as RoleScript;
const lead = parse(leadYaml) as RoleScript;
const analyst = parse(analystYaml) as RoleScript;
const roleList: { name: string; role: RoleScript }[] = [
  { name: 'executive', role: executive },
  { name: 'officer', role: officer },
  { name: 'lead', role: lead },
  { name: 'analyst', role: analyst },
];

const point = (role: RoleScript, id: string) => {
  const found = role.points.find((p) => p.id === id);
  if (!found) throw new Error(`判断ポイントがない: ${id}`);
  return found;
};

describe('フェーズの後戻り', () => {
  for (const { name, role } of roleList) {
    it(`${name} は判断ポイントの順にフェーズが進む`, () => {
      let previous = -1;
      for (const p of role.points) {
        const index = PHASES.indexOf(p.phase);
        expect(index, `${p.id} の phase`).toBeGreaterThanOrEqual(0);
        expect(index, `${p.id} でフェーズが戻っている`).toBeGreaterThanOrEqual(previous);
        previous = index;
      }
    });
  }
});

describe('確報の期限', () => {
  it('確報の期限は不正の目的の60日を使う', () => {
    const finals = roleList.flatMap(({ name, role }) =>
      (role.deadlines ?? [])
        .filter((d) => d.ref.startsWith('ppc-report-final'))
        .map((d) => ({ name, deadline: d })),
    );
    expect(finals.length).toBeGreaterThanOrEqual(3);
    for (const { name, deadline } of finals) {
      expect(deadline.ref, name).toBe('ppc-report-final-malicious');
      expect(refs.find((r) => r.id === deadline.ref)?.deadlineHours, name).toBe(1440);
    }
  });
});

describe('委託先の報告義務', () => {
  const correctVoices: { role: RoleScript; id: string }[] = [
    { role: executive, id: 'v07-ok' },
    { role: officer, id: 'v07-ok' },
    { role: lead, id: 'v09-ok' },
    { role: analyst, id: 'v10-ok' },
  ];
  it('正解の声は委託元への通知による免除を伝える', () => {
    for (const { role, id } of correctVoices) {
      const voice = role.voices.find((v) => v.id === id);
      expect(voice, `${role.intro.ja.slice(0, 8)} の正解の声がない`).toBeTruthy();
      expect(voice?.misleading).toBe(false);
      expect(voice?.text.ja).toContain('施行規則第9条');
      expect(voice?.text.ja).toContain('通知');
    }
  });

  it('委託先なんだから何も出さないという声は誤りとして扱う', () => {
    for (const role of [executive, officer, analyst]) {
      const voice = role.voices.find((v) => v.id === 'v07-law' || v.id === 'v10-law');
      expect(voice?.misleading).toBe(true);
      expect(voice?.text.ja).toContain('何も出さなくていい');
    }
  });
});

describe('記者会見の回答条件', () => {
  const qa = scenario.press?.questions.find((q) => q.id === 'q-why');
  const victims = scenario.press?.questions.find((q) => q.id === 'q-victims');

  it('隠した経路では、検証して公表したという回答を選べない', () => {
    const answer = qa?.answers.find((a) => a.id === 'a-why-verify');
    expect(answer?.when).toEqual({ flags: { hidAudit: false } });
  });

  it('段階補償をしていない経路では、段階補償の回答を選べない', () => {
    const answer = victims?.answers.find((a) => a.id === 'a-victims-tier');
    expect(answer?.when).toEqual({ flags: { tieredCompensation: true } });
  });

  it('隠す選択は hidAudit を立てる', () => {
    const executiveHide = point(executive, 'p12-audit').choices.find((c) => c.id === 'p12-hide');
    const leadHide = point(lead, 'p11-auditlog').choices.find((c) => c.id === 'p11-omit');
    const officerHide = point(officer, 'p09-own-gap').choices.find((c) => c.id === 'p09-hide');
    expect(executiveHide?.setFlags?.hidAudit).toBe(true);
    expect(leadHide?.setFlags?.hidAudit).toBe(true);
    expect(officerHide?.setFlags?.hidAudit).toBe(true);
  });
});

describe('証拠を消す行動', () => {
  it('初期化は致命的で、証拠を消した記録が残る', () => {
    const choice = point(analyst, 'a03-endpoint').choices.find((c) => c.id === 'a03-poweron');
    expect(choice?.category).toBe('fatal');
    expect(choice?.points).toBe(-250);
    expect(choice?.setFlags?.destroyedEvidence).toBe(true);
  });

  it('初期化せず貸し出す行動は致命的ではない', () => {
    const choice = point(analyst, 'a03-endpoint').choices.find((c) => c.id === 'a03-return');
    expect(choice?.category).not.toBe('fatal');
    expect(choice?.setFlags?.destroyedEvidence).toBeUndefined();
  });
});

describe('犯罪の明示', () => {
  it('恐喝と脅迫の場面に犯罪だと書く', () => {
    expect(point(lead, 'p10-insider').text.ja).toContain('犯罪');
    expect(point(analyst, 'a12-threat').text.ja).toContain('犯罪');
  });
});

describe('発端と記録の整合', () => {
  it('役員ロールの発端は指摘の電話にとどめ、手口を確定しない', () => {
    const p = point(officer, 'p01-call');
    expect(p.text.ja).toContain('指摘された');
    expect(p.text.ja).not.toContain('書き出していた');
    expect((p.notable ?? []).some((n) => n.id === 'note-scale')).toBe(false);
  });

  it('影響範囲の記録は確認できる場面で取る', () => {
    const p = point(officer, 'p04-clients');
    expect((p.notable ?? []).some((n) => n.id === 'note-scale')).toBe(true);
  });

  it('ログの矛盾を残さない', () => {
    expect(point(analyst, 'a02-account').text.ja).toContain('10年前から同じ');
    expect(point(analyst, 'a04-logs').text.ja).toContain('直近の分しか');
  });
});

describe('断定しない', () => {
  it('調査中の呼称に犯人を使わない', () => {
    expect(JSON.stringify(roleList)).not.toContain('犯人');
    expect(JSON.stringify(scenario.press)).not.toContain('犯人');
  });
});

describe('再開の表現', () => {
  it('経営者ロールは停止ではなく縮小運用からの復帰として書く', () => {
    expect(point(executive, 'p14-resume').text.ja).toContain('縮小運用');
    expect(executive.voices.find((v) => v.id === 'v14-public')?.text.ja).toContain('縮小運用');
  });
});
