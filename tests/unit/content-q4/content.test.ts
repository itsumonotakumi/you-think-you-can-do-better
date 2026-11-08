// シナリオ内容の修正（no01, no06, no07）の回帰検査。
// 法定期限の参照、本文の時刻・日数、証拠とログの説明が、参照資料と食い違わないことを確かめる。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import referencesYaml from '../../../references/references.yaml?raw';
import no01LeadYaml from '../../../scenarios/no01-nebula/roles/lead.yaml?raw';
import no01OfficerYaml from '../../../scenarios/no01-nebula/roles/officer.yaml?raw';
import no06LeadYaml from '../../../scenarios/no06-amatsu/roles/lead.yaml?raw';
import no07LeadYaml from '../../../scenarios/no07-connectcall/roles/lead.yaml?raw';
import type { Reference, RoleScript } from '../../../src/engine/types';

const references = parse(referencesYaml) as Reference[];
const deadlineHours = new Map(
  references.filter((r) => r.deadlineHours !== undefined).map((r) => [r.id, r.deadlineHours as number]),
);

const no01Lead = parse(no01LeadYaml) as RoleScript;
const no01Officer = parse(no01OfficerYaml) as RoleScript;
const no06Lead = parse(no06LeadYaml) as RoleScript;
const no07Lead = parse(no07LeadYaml) as RoleScript;

const files: { name: string; role: RoleScript }[] = [
  { name: 'no01-nebula/roles/lead', role: no01Lead },
  { name: 'no01-nebula/roles/officer', role: no01Officer },
  { name: 'no06-amatsu/roles/lead', role: no06Lead },
  { name: 'no07-connectcall/roles/lead', role: no07Lead },
];

function finalDeadline(role: RoleScript) {
  return (role.deadlines ?? []).find((d) => d.id === 'dl-ppc-final');
}

function point(role: RoleScript, id: string) {
  const found = role.points.find((p) => p.id === id);
  if (!found) throw new Error(`判断ポイントがない: ${id}`);
  return found;
}

describe('確報の法定期限', () => {
  // 不正アクセス・内部不正など、不正の目的のおそれがある事件は60日。
  for (const { name, role } of files) {
    it(`${name} の確報は60日の根拠を引く`, () => {
      const deadline = finalDeadline(role);
      expect(deadline, 'dl-ppc-final がない').toBeDefined();
      expect(deadline?.ref).toBe('ppc-report-final-malicious');
      expect(deadlineHours.get(deadline?.ref as string)).toBe(1440);
    });
  }

  it('no07 lead の確報の細目も60日の根拠を引く', () => {
    for (const choice of point(no07Lead, 'p17-final').choices) {
      expect(choice.refs).toContain('ppc-report-final-malicious');
      for (const item of choice.items ?? []) {
        const legal = item.refs.filter((ref) => ref.startsWith('ppc-report'));
        if (legal.length > 0) expect(legal).toContain('ppc-report-final-malicious');
      }
    }
  });

  it('no07 lead の60日を伝える声は正確', () => {
    const voice = no07Lead.voices.find((v) => v.id === 'v17-ok');
    expect(voice?.text.ja).toContain('60日');
    expect(voice?.misleading).toBe(false);
  });
});

describe('本文の時刻と設定値', () => {
  it('no06 lead の13時の場面は780分', () => {
    const p = point(no06Lead, 'p07-scope');
    expect(p.text.ja).toContain('13時');
    expect(p.at?.minutes).toBe(780);
  });

  it('no01 lead の確報の場面は期限が先だと書く', () => {
    const p = point(no01Lead, 'p18-final');
    expect(p.text.ja).toContain('期限はまだ先');
    expect(p.text.ja).not.toContain('期限が近づいている');
  });

  it('no07 lead の確報の場面も期限が先だと書く', () => {
    const p = point(no07Lead, 'p17-final');
    expect(p.text.ja).toContain('期限はまだ先');
    expect(p.text.ja).not.toContain('期限が近づいている');
  });
});

describe('ログの保存期間と侵入時期', () => {
  // 侵入は数か月前。保存期間（30日）はそれを下回り、当時の記録が残らない。
  it('no01 lead の保存期間は侵入時期より短い', () => {
    const p = point(no01Lead, 'p13-retention');
    expect(p.text.ja).toContain('数か月前');
    expect(p.text.ja).toContain('30日');
    expect(p.text.ja).not.toContain('九十日');
    const note = (p.notable ?? []).find((n) => n.id === 'note-scope');
    expect(note?.text.ja).toContain('30日');
  });
});
