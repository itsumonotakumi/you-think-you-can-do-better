// No.1 ネビュラクラウド / 内容レビュー（docs/reviews/no01-nebula.md）の指摘に対する回帰検査。
// 記者会見の虚偽回答、確報の期限、フェーズの逆行、誘導の声の型、数字と時期のぼかしを固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no01-nebula/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no01-nebula/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no01-nebula/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no01-nebula/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no01-nebula/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import { PHASES } from '../../../src/engine/types';
import type { Press, Reference, RoleScript, Scenario } from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const executive = parse(executiveYaml) as RoleScript;
const officer = parse(officerYaml) as RoleScript;
const lead = parse(leadYaml) as RoleScript;
const analyst = parse(analystYaml) as RoleScript;
const roles = { executive, officer, lead, analyst };
function roleOf(name: string): RoleScript {
  const role = (roles as Record<string, RoleScript>)[name];
  if (!role) throw new Error(`ロールがない: ${name}`);
  return role;
}
const scenario: Scenario = { ...base, roles };
const press = base.press as Press;
const references = parse(referencesYaml) as Reference[];

const rawFiles: Record<string, string> = {
  'scenario.yaml': scenarioYaml,
  'executive.yaml': executiveYaml,
  'officer.yaml': officerYaml,
  'lead.yaml': leadYaml,
  'analyst.yaml': analystYaml,
};

function allQuestions(): { question: Press['questions'][number]; conditional: boolean }[] {
  const main = press.questions.map((question) => ({ question, conditional: false }));
  const extra = (press.extraQuestions ?? []).map((entry) => ({ question: entry.question, conditional: true }));
  return [...main, ...extra];
}

function question(id: string) {
  const found = allQuestions().find((entry) => entry.question.id === id);
  if (!found) throw new Error(`質問がない: ${id}`);
  return found.question;
}

function answer(questionId: string, answerId: string) {
  const found = question(questionId).answers.find((a) => a.id === answerId);
  if (!found) throw new Error(`回答がない: ${questionId}/${answerId}`);
  return found;
}

function choiceIdsWithFlag(role: RoleScript, flag: string): string[] {
  return role.points.flatMap((p) => p.choices.filter((c) => c.setFlags?.[flag]).map((c) => c.id));
}

describe('記者会見: 虚偽の回答が高得点にならない', () => {
  it('身代金を支払った場合だけ「支払った」と認める回答が出る', () => {
    const paid = answer('q-ransom', 'a-ransom-paid');
    expect(paid.when).toEqual({ flags: { paidRansom: true } });
    expect(paid.points).toBeGreaterThan(0);
  });

  it('支払ったのに「支払っていません」と答えると致命的になる', () => {
    const deny = answer('q-ransom', 'a-ransom-deny');
    expect(deny.when).toEqual({ flags: { paidRansom: true } });
    expect(deny.points).toBeLessThanOrEqual(-200);
    expect(deny.points).toBeLessThan(answer('q-ransom', 'a-ransom-paid').points);
  });

  it('支払っていない場合の「支払っていません」は、支払いの旗が無いときだけ出る', () => {
    const refuse = answer('q-ransom', 'a-ransom-refuse');
    expect(refuse.when).toEqual({ flags: { paidRansom: false } });
    expect(refuse.points).toBeGreaterThan(0);
  });

  it('どの質問にも、条件なしで選べる回答が1つ以上ある', () => {
    for (const { question: q } of allQuestions()) {
      const always = q.answers.filter((a) => a.when === undefined && (a.requiresNote === undefined || a.requiresNote === false));
      expect(always.length, `${q.id} に条件なしの回答がない`).toBeGreaterThanOrEqual(1);
    }
  });

  it('事前の指摘は、隠していない場合だけ聞かれる', () => {
    const extra = (press.extraQuestions ?? []).find((entry) => entry.question.id === 'q-warning');
    expect(extra?.when).toEqual({ flags: { hidWarning: false } });
  });

  it('見舞金の根拠は、補償を決めた場合だけ聞かれる', () => {
    const extra = (press.extraQuestions ?? []).find((entry) => entry.question.id === 'q-money');
    expect(extra?.when).toEqual({ flags: { compensation: true } });
  });

  it('身代金の支払いを選べるロールは、支払いの旗を立てる', () => {
    for (const role of [executive]) {
      const pay = role.points.flatMap((p) => p.choices).find((c) => c.id === 'p03-pay');
      expect(pay?.setFlags?.paidRansom).toBe(true);
      const refuse = role.points.flatMap((p) => p.choices).filter((c) => c.points > 0 && /ransom/.test(c.id));
      for (const c of refuse) expect(c.setFlags?.refusedRansom).toBe(true);
    }
  });
});

describe('確報の期限は不正の目的のおそれがある事件の60日', () => {
  const deadlineHours = new Map(
    references.filter((r) => r.deadlineHours !== undefined).map((r) => [r.id, r.deadlineHours as number]),
  );

  for (const [name, role] of Object.entries(roles)) {
    it(`${name} の確報は ppc-report-final-malicious（60日）`, () => {
      const final = (role.deadlines ?? []).find((d) => d.ref === 'ppc-report-final-malicious');
      expect(final, '確報の期限がない').toBeTruthy();
      expect(final?.label.ja).toContain('確報');
      expect(deadlineHours.get('ppc-report-final-malicious')).toBe(1440);
      expect(choiceIdsWithFlag(role, final?.doneFlag as string).length).toBeGreaterThanOrEqual(1);
    });
  }

  it('経営者は報告書の公開と確報の提出を同じ判断で扱う', () => {
    const p15 = executive.points.find((p) => p.id === 'p15-report');
    expect(p15?.text.ja).toContain('確報');
    for (const id of ['p15-publish', 'p15-publish-share']) {
      const choice = p15?.choices.find((c) => c.id === id);
      expect(choice?.setFlags?.ppcFinalFiled, id).toBe(true);
    }
    expect(p15?.choices.find((c) => c.id === 'p15-hide')?.text.ja).toContain('確報');
  });
});

describe('フェーズは戻らない', () => {
  for (const [name, role] of Object.entries(roles)) {
    it(`${name} の判断ポイントは detect → after の順に進む`, () => {
      let previous = -1;
      for (const point of role.points) {
        const index = PHASES.indexOf(point.phase);
        expect(index, `${point.id} の phase`).toBeGreaterThanOrEqual(0);
        expect(index, `${point.id} でフェーズが戻っている`).toBeGreaterThanOrEqual(previous);
        previous = index;
      }
    });
  }

  it('経営者・部門長・担当者の主な場面が時系列どおりのフェーズになる', () => {
    const phaseOf = (role: RoleScript, id: string) => role.points.find((p) => p.id === id)?.phase;
    expect(phaseOf(executive, 'p06-ad')).toBe('notify');
    // 速報を出した後は investigate に戻さない（notify を維持する）。
    expect(phaseOf(executive, 'p08-warning')).toBe('notify');
    expect(phaseOf(executive, 'p10-stamina')).toBe('notify');
    expect(phaseOf(executive, 'p14-blog')).toBe('recover');
    expect(phaseOf(lead, 'p05-stop-rec')).toBe('organize');
    expect(phaseOf(lead, 'p08-ransom')).toBe('investigate');
    expect(phaseOf(lead, 'p17-internal-comm')).toBe('recover');
    expect(phaseOf(lead, 'p18-final')).toBe('recover');
    expect(phaseOf(analyst, 'a04-first-report')).toBe('contain');
    expect(phaseOf(analyst, 'a07-ransom')).toBe('investigate');
    expect(phaseOf(analyst, 'a08-my-warning')).toBe('investigate');
    expect(phaseOf(analyst, 'a11-fatigue')).toBe('investigate');
  });
});

describe('誘導の声の型は、内容と合っている', () => {
  it('保留を勧める声に臆病批判の型を付けない', () => {
    const holdBack = [
      ['executive', 'v05-coward'],
      ['executive', 'v08-coward'],
      ['executive', 'v11-coward'],
      ['executive', 'v16-coward'],
      ['lead', 'v14-coward'],
      ['analyst', 'v08-coward'],
      ['analyst', 'v14-coward'],
      ['officer', 'v04-coward'],
      ['officer', 'v05-coward'],
      ['officer', 'v09-coward'],
      ['officer', 'v10-coward'],
      ['officer', 'v16-coward'],
    ] as const;
    for (const [roleName, id] of holdBack) {
      const voice = roleOf(roleName).voices.find((v) => v.id === id);
      expect(voice, `${roleName}/${id}`).toBeTruthy();
      expect(voice?.type, `${roleName}/${id}`).not.toBe('coward-critique');
    }
  });

  it('臆病批判は「遅い・臆病だ」と急かす声だけに残る', () => {
    const keepers = [
      ['executive', 'v02-coward'],
      ['executive', 'v13-coward'],
      ['lead', 'v05-coward'],
      ['lead', 'v16-coward'],
      ['analyst', 'v15-coward'],
    ] as const;
    for (const [roleName, id] of keepers) {
      expect(roleOf(roleName).voices.find((v) => v.id === id)?.type, `${roleName}/${id}`).toBe('coward-critique');
    }
    for (const [roleName, role] of Object.entries(roles)) {
      for (const voice of role.voices.filter((v) => v.type === 'coward-critique')) {
        expect(voice.text.ja, `${roleName}/${voice.id}`).toMatch(/早く|臆病|遅|止めている|戻せ/);
      }
    }
    const total = Object.values(roles).flatMap((role) => role.voices.filter((v) => v.type === 'coward-critique'));
    expect(total.length).toBeGreaterThanOrEqual(5);
  });

  it('自称専門家は、証拠隠滅を自分から宣言しない', () => {
    for (const [roleName, role] of Object.entries(roles)) {
      for (const voice of role.voices.filter((v) => v.type === 'fake-expert')) {
        expect(voice.text.ja, `${roleName}/${voice.id}`).not.toContain('証拠も残りません');
        expect(voice.text.ja, `${roleName}/${voice.id}`).not.toContain('ログは要りません');
      }
    }
  });

  it('経営者の自称専門家は、初期化の選択肢がある場面に置く', () => {
    const point = executive.points.find((p) => (p.voices ?? []).includes('v13-expert'));
    expect(point, 'v13-expert の置き場所がない').toBeTruthy();
    expect(point?.id).toBe('p13-resume');
    expect(executive.points.find((p) => p.id === 'p05-first-report')?.voices ?? []).not.toContain('v05-expert');
  });
});

describe('権利への配慮: 時期と数字を特定できる書き方をしない', () => {
  it('元事件の時期を年・季節で書かない', () => {
    expect(base.sourcePeriod.ja).not.toMatch(/20\d\d年(?!代)|秋|春|夏|冬/);
    for (const [name, text] of Object.entries(rawFiles)) {
      expect(text, name).not.toMatch(/二か月半|五百台|2026年秋/);
    }
  });

  it('会社の規模と業種は、特定できる組み合わせにしない', () => {
    expect(base.company.industry.ja).not.toContain('ホスティング');
    expect(base.company.size.ja).not.toMatch(/\d{3}名/);
  });
});

describe('ロール間の事実のずれを残さない', () => {
  it('検知した台数は三台で揃っている', () => {
    expect(analyst.points.find((p) => p.id === 'a01-first-alert')?.text.ja).toContain('三台');
    expect(analyst.points.find((p) => p.id === 'a02-same-credential')?.text.ja).toContain('三台');
    expect(lead.points.find((p) => p.id === 'p01-alert')?.text.ja).toContain('三台');
  });

  it('侵入時期は担当者が断定せず、経営者と部門長が確定させる', () => {
    const a06 = analyst.points.find((p) => p.id === 'a06-logs');
    expect(a06?.text.ja).toContain('数週間前');
    expect(a06?.text.ja).not.toContain('二か月半');
    const note = (a06?.notable ?? []).find((n) => n.id === 'note-scope');
    expect(note?.text.ja).toContain('数週間以上前');
    expect(executive.points.find((p) => p.id === 'p07-scope')?.text.ja).toContain('数か月前');
    expect(lead.points.find((p) => p.id === 'p13-retention')?.text.ja).toContain('数か月前');
  });

  it('担当者は事業判断を自分で決めず、CSIRTリーダーに進言する', () => {
    const point = analyst.points.find((p) => p.id === 'a02-same-credential');
    const all = point?.choices.find((c) => c.id === 'a02-all');
    expect(all?.text.ja).toContain('進言');
    expect(all?.setFlags?.containmentProposed).toBe(true);
    const one = point?.choices.find((c) => c.id === 'a02-one');
    expect(one?.text.ja).toContain('進言しない');
  });

  it('攻撃者の期限は24時間で揃っている', () => {
    const texts = [
      executive.points.find((p) => p.id === 'p03-ransom')?.text.ja,
      lead.points.find((p) => p.id === 'p08-ransom')?.text.ja,
      analyst.points.find((p) => p.id === 'a07-ransom')?.text.ja,
    ];
    for (const text of texts) expect(text).toContain('24時間以内');
  });
});

describe('役員ロールに事前指摘の場面がある', () => {
  it('p01 で事前の指摘を記録できる', () => {
    const p01 = officer.points.find((p) => p.id === 'p01-parent-call');
    expect((p01?.notable ?? []).some((n) => n.id === 'note-warning')).toBe(true);
  });

  it('p05 と p06 の間に、指摘を調査に含めるかの判断がある', () => {
    const ids = officer.points.map((p) => p.id);
    const index = ids.indexOf('p05b-warning');
    expect(index).toBeGreaterThan(ids.indexOf('p05-parent-report'));
    expect(index).toBeLessThan(ids.indexOf('p06-entry'));
    const point = officer.points[index];
    expect(point?.phase).toBe('organize');
    expect(point?.choices.some((c) => c.setFlags?.hidWarning)).toBe(true);
    expect(point?.choices.some((c) => c.category === 'recover' && (c.setFlags?.protectedReporter ?? false))).toBe(true);
  });

  it('親会社への報告が済んでいれば、未提出の知らせは出ない', () => {
    const board = officer.events?.find((e) => e.id === 'ev-parent-board');
    expect(board?.when).toEqual({ flags: { parentReportFiled: false } });
    const ok = officer.events?.find((e) => e.id === 'ev-parent-board-ok');
    expect(ok?.when).toEqual({ flags: { parentReportFiled: true } });
    expect(ok?.gauges).toBeUndefined();
  });

  it('記者会見の事前指摘の質問に、役員でも答えられる', () => {
    const noteIds = new Set(
      Object.values(roles).flatMap((role) => role.points.flatMap((p) => (p.notable ?? []).map((n) => n.id))),
    );
    const own = answer('q-warning', 'a-warning-own');
    expect(own.requiresNote).toBe('note-warning');
    expect(noteIds.has('note-warning')).toBe(true);
  });
});

describe('傷つける選択肢に段階がある', () => {
  it('公表前のSNS発信と原因の断定は大きく減点する', () => {
    const points = new Map(
      analyst.points.flatMap((p) => p.choices.map((c) => [c.id, c.points] as const)),
    );
    expect(points.get('a06-fake')).toBe(-120);
    expect(points.get('a07-post')).toBe(-100);
    expect(points.get('a10-blame')).toBe(-120);
    expect(points.get('a13-post')).toBe(-100);
    expect(points.get('a01-observe')).toBeLessThanOrEqual(-60);
  });

  it('傷つける選択肢が一律の点数になっていない', () => {
    const hurt = analyst.points.flatMap((p) => p.choices.filter((c) => c.category === 'hurt'));
    const distinct = new Set(hurt.map((c) => c.points));
    expect(distinct.size).toBeGreaterThanOrEqual(4);
    for (const c of hurt) {
      expect(c.points).toBeGreaterThanOrEqual(-150);
      expect(c.points).toBeLessThanOrEqual(-30);
    }
  });
});

describe('本文の言い回し', () => {
  it('経過日数と声が合っている', () => {
    expect(executive.voices.find((v) => v.id === 'v13-coward')?.text.ja).toContain('二週間近く');
    expect(lead.voices.find((v) => v.id === 'v16-coward')?.text.ja).toContain('二週間近く');
    expect(analyst.voices.find((v) => v.id === 'v15-coward')?.text.ja).toContain('十日近く');
    expect(lead.voices.find((v) => v.id === 'v15-public')?.text.ja).toContain('十日');
  });

  it('部長の徹夜の日数は、開始からの経過と合っている', () => {
    const p10 = executive.points.find((p) => p.id === 'p10-stamina');
    expect(p10?.text.ja).toContain('五日目');
    expect(p10?.text.ja).not.toContain('三日連続');
  });

  it('事後批判と誘導の声が同じ文にならない', () => {
    const before = executive.voices.find((v) => v.id === 'v08-coward')?.text.ja;
    const after = executive.voices.find((v) => v.id === 'v08-after')?.text.ja;
    expect(after).not.toBe(before);
  });

  it('第1報の根拠は公表ガイダンスを引く', () => {
    const choice = executive.points
      .find((p) => p.id === 'p05-first-report')
      ?.choices.find((c) => c.id === 'p05-tonight');
    expect(choice?.refs).toEqual(['meti-disclosure-guidance']);
  });

  it('広報の想定質問数は、条件付きの質問で増えることを許す', () => {
    const p16 = executive.points.find((p) => p.id === 'p16-press');
    expect(p16?.text.ja).toContain('五問');
    expect(p16?.text.ja).toContain('六問');
  });

  it('加盟店データにカード情報が含まれる前提を、役員ロールの本文で示す', () => {
    const p03 = officer.points.find((p) => p.id === 'p03-scope');
    expect(p03?.text.ja).toContain('カード情報');
  });

  it('担当者が窓口の一本化を自分で決めない', () => {
    const choice = analyst.points
      .flatMap((p) => p.choices)
      .find((c) => c.id === 'a13-ad-flag');
    expect(choice?.text.ja).toContain('進言');
  });
});
