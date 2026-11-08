// レビュー指摘（docs/reviews/no09-hamakaze.md）の修正を固定する検査。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no09-hamakaze/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no09-hamakaze/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no09-hamakaze/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no09-hamakaze/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no09-hamakaze/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import { choose, currentPoint, startPlay, startPress } from '../../../src/engine/index';
import { PHASES } from '../../../src/engine/types';
import type {
  Choice,
  DecisionPoint,
  Reference,
  RoleId,
  RoleScript,
  Scenario,
} from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const refs = parse(referencesYaml) as Reference[];
const roles: Record<RoleId, RoleScript> = {
  executive: parse(executiveYaml) as RoleScript,
  officer: parse(officerYaml) as RoleScript,
  lead: parse(leadYaml) as RoleScript,
  analyst: parse(analystYaml) as RoleScript,
};
const scenario: Scenario = { ...base, roles };

function point(role: RoleId, id: string): DecisionPoint {
  const found = roles[role].points.find((p) => p.id === id);
  expect(found, `${role} の ${id} がない`).toBeTruthy();
  return found!;
}

function choice(role: RoleId, id: string): Choice {
  const found = roles[role].points.flatMap((p) => p.choices).find((c) => c.id === id);
  expect(found, `${role} の ${id} がない`).toBeTruthy();
  return found!;
}

function clockOf(role: RoleId, id: string): number {
  const at = point(role, id).at;
  expect(at, `${id} の at がない`).toBeTruthy();
  return at!.day * 1440 + at!.minutes;
}

/** 全会見の質問を、旗を立てた状態で列挙する */
function pressQuestionIds(role: RoleId, flags: Record<string, boolean>): string[] {
  const started = startPlay(
    scenario,
    role,
    1,
    { comment: '', predictedHours: null },
    '2026-11-08T00:00:00.000Z',
    refs,
  );
  const opened = startPress({ ...started.state, flags: { ...started.state.flags, ...flags } }, scenario);
  return opened.state.press?.questionIds ?? [];
}

describe('no09 レビュー修正', () => {
  it('元事件の時期を明記せず、給食委託先の組み合わせも残らない', () => {
    expect(scenario.sourcePeriod.ja).toContain('2020年代前半');
    expect(scenario.sourcePeriod.ja).not.toMatch(/20\d\d年の/);
    const blob = JSON.stringify(scenario);
    expect(blob).not.toContain('給食');
    expect(scenario.company.people.find((p) => p.id === 'vendor')?.title.ja).toContain('設備保守');
  });

  it('記者会見の身代金質問は、支払いの旗で出し分ける', () => {
    expect(base.press?.questions.map((q) => q.id)).not.toContain('q-ransom');
    const paid = pressQuestionIds('executive', { paidRansom: true });
    expect(paid).toContain('q-ransom-paid');
    expect(paid).not.toContain('q-ransom');
    const unpaid = pressQuestionIds('executive', {});
    expect(unpaid).toContain('q-ransom');
    expect(unpaid).not.toContain('q-ransom-paid');

    for (const extra of base.press?.extraQuestions ?? []) {
      const unconditional = extra.question.answers.filter((a) => !a.when && !a.requiresNote);
      expect(unconditional.length, `${extra.question.id} に条件なしの回答がない`).toBeGreaterThan(0);
    }
  });

  it('身代金を払った経路では、支払いを認める回答だけが高得点になる', () => {
    expect(choice('lead', 'p05-a-pay').setFlags).toMatchObject({ paidRansom: true });
    const started = startPlay(
      scenario,
      'lead',
      1,
      { comment: '', predictedHours: null },
      '2026-11-08T00:00:00.000Z',
      refs,
    );
    let state = started.state;
    let next = started.next;
    let guard = 0;
    while (next !== 'press' && guard < 400) {
      guard += 1;
      if (next === 'point') {
        const current = currentPoint(state, scenario);
        if (!current) throw new Error('判断ポイントがない');
        const picked = current.id === 'p05-ransom' ? 'p05-a-pay' : current.choices[0]!.id;
        const step = choose(state, scenario, picked);
        state = step.state;
        next = step.next;
      } else {
        throw new Error(`想定外の遷移: ${next}`);
      }
    }
    expect(next).toBe('press');
    const opened = startPress(state, scenario);
    expect(opened.state.press?.questionIds).toContain('q-ransom-paid');
    const paidQuestion = base.press?.extraQuestions?.find((e) => e.question.id === 'q-ransom-paid')?.question;
    expect(paidQuestion).toBeTruthy();
    const best = [...paidQuestion!.answers].sort((a, b) => b.points - a.points)[0]!;
    expect(best.text.ja).toContain('支払いました');
  });

  it('情報公開・調査報告・速報・復旧の日時がロール間で揃う', () => {
    for (const [role, id] of [
      ['executive', 'p14-leak'],
      ['officer', 'p15-leak'],
      ['lead', 'p17-leak'],
      ['analyst', 'p12-leak'],
    ] as const) {
      expect(clockOf(role, id), `${role} ${id} の情報公開`).toBe(8 * 1440 + 600);
    }
    for (const [role, id] of [
      ['executive', 'p09-investigate'],
      ['lead', 'p12-scope'],
      ['analyst', 'p10-entry'],
    ] as const) {
      expect(clockOf(role, id), `${role} ${id} の調査報告`).toBe(2 * 1440 + 600);
    }
    for (const [role, id] of [
      ['executive', 'p07-report'],
      ['officer', 'p09-ppc'],
      ['lead', 'p10-report'],
      ['analyst', 'p13-ppc'],
    ] as const) {
      const at = point(role, id).at!;
      expect(at.day, `${role} ${id} の速報`).toBe(1);
      expect(at.minutes).toBeGreaterThanOrEqual(540);
      expect(at.minutes).toBeLessThanOrEqual(600);
    }
    for (const [role, id] of [
      ['executive', 'p13-resume'],
      ['lead', 'p16-resume'],
      ['analyst', 'p16-restore'],
    ] as const) {
      expect(point(role, id).at?.day, `${role} ${id} の復旧`).toBe(8);
    }
    // 事務局長だけは「戻り始めた」を Day5 のままにする（レビューの許容）
    expect(point('officer', 'p14-billing').at?.day).toBe(5);
    expect(point('officer', 'p14-billing').text.ja).toContain('一部が戻り始めた');
    expect(clockOf('executive', 'p05-command')).toBe(780);
    expect(clockOf('officer', 'p05-hq')).toBe(780);
    for (const role of ['executive', 'officer', 'lead'] as const) {
      const news = roles[role].events?.find((e) => e.id === 'ev-news' || e.id === 'ev-officer-news');
      expect(news?.at.minutes, `${role} の地域紙速報`).toBe(1260);
    }
    const ambulance = roles.executive.events?.find((e) => e.id === 'ev-ambulance');
    expect(ambulance?.at.day).toBe(0);
    expect(ambulance?.at.minutes).toBe(405);
    expect(point('analyst', 'p18-monitor').at!.day - point('analyst', 'p16-restore').at!.day).toBe(7);
  });

  it('攻撃者の場面と全エンディングに、責任は攻撃者にあると書く', () => {
    for (const rank of ['S', 'A', 'B', 'C', 'D'] as const) {
      expect(scenario.endings[rank].text.ja).toContain('被害の責任は攻撃者にある');
    }
    expect(point('executive', 'p03-ransom').text.ja).toContain('これは犯罪です');
    expect(point('lead', 'p05-ransom').text.ja).toContain('これは犯罪です');
    for (const [role, id] of [
      ['executive', 'p14-leak'],
      ['officer', 'p15-leak'],
      ['lead', 'p17-leak'],
      ['analyst', 'p12-leak'],
    ] as const) {
      expect(point(role, id).text.ja, `${role} ${id}`).toContain('攻撃者であり、これは犯罪だ');
    }
  });

  it('フェーズと時刻が戻らず、臆病批判の型が実態と合う', () => {
    for (const role of Object.keys(roles) as RoleId[]) {
      let phase = -1;
      let clock = -1;
      for (const p of roles[role].points) {
        const index = PHASES.indexOf(p.phase);
        expect(index, `${role} ${p.id} のフェーズ`).toBeGreaterThanOrEqual(phase);
        phase = index;
        if (!p.at) continue;
        const at = p.at.day * 1440 + p.at.minutes;
        expect(at, `${role} ${p.id} の時刻`).toBeGreaterThan(clock);
        clock = at;
      }
    }
    // 慎重論に coward-critique を付けない（残すのは「止めすぎだ」系だけ）
    for (const role of Object.keys(roles) as RoleId[]) {
      for (const voice of roles[role].voices) {
        if (voice.type !== 'coward-critique') continue;
        expect(voice.text.ja, `${role} ${voice.id}`).toMatch(/臆病|止め|断る|遅い|走れ|続けろ|続ける|戻せ|終わ/);
      }
    }
  });

  it('報告を怠る選択と、SNSの独断の重さが区分に収まる', () => {
    const hide = choice('officer', 'p16-hide');
    expect(hide.category).toBe('fatal');
    expect(hide.points).toBe(-250);
    expect(hide.setFlags).toMatchObject({ skippedFinal: true });
    const finalDeadline = roles.officer.deadlines?.find((d) => d.ref === 'ppc-report-final-malicious');
    expect(finalDeadline?.points).toBe(-100);

    const sns = choice('analyst', 'p05-d-sns');
    expect(sns.category).toBe('hurt');
    expect(sns.points).toBe(-150);
    expect(choice('analyst', 'p11-c-post').points).toBe(-120);
    expect(choice('analyst', 'p19-c-own').points).toBe(220);
  });

  it('専門家の到着を待つ判断は維持に寄せ、中位の b 案を残す', () => {
    const wait = choice('lead', 'p06-b-wait');
    expect(wait.category).toBe('maintain');
    expect(wait.points).toBe(10);
    expect(wait.coward).toBeUndefined();
    for (const [role, id] of [
      ['executive', 'p08-b-window'],
      ['executive', 'p14-b-notice'],
      ['officer', 'p10-window'],
      ['officer', 'p15-notice'],
    ] as const) {
      const c = choice(role, id);
      expect(c.category, `${role} ${id}`).toBe('maintain');
      expect(c.points, `${role} ${id}`).toBe(30);
    }
    expect(point('executive', 'p07-report').popular).toEqual({ choiceId: 'p07-a-wait', percent: 61 });
    expect(point('executive', 'p13-resume').popular).toEqual({ choiceId: 'p13-a-rush', percent: 52 });
  });

  it('バックアップの説明と、担当者の立ち位置がそろう', () => {
    const leadBackup = point('lead', 'p11-backup').text.ja;
    const analystBackup = point('analyst', 'p03-backup').text.ja;
    for (const text of [leadBackup, analystBackup]) {
      expect(text).toContain('別館の保管庫');
      expect(text).toContain('三世代');
    }
    expect(roles.analyst.intro.ja).toContain('医療情報部は六人');
    expect(roles.lead.intro.ja).toContain('医療情報部の六人');
    expect(point('analyst', 'p05-first-report').text.ja).toContain('別館のサーバー室');
    expect(point('officer', 'p08-statement').text.ja).not.toContain('持ち出された可能性が出てきた');
  });
});
