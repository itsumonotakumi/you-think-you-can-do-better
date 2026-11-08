// No.4 ゴーライド / レビュー指摘（docs/reviews/no04-goride.md）の再発防止テスト。
// 4ロールをまとめて読み、時刻・経緯・声の型の食い違いが戻らないようにする。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no04-goride/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no04-goride/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no04-goride/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no04-goride/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no04-goride/roles/analyst.yaml?raw';
import { MISLEADING_TYPES } from '../../../src/engine/types';
import type { RoleScript, Scenario } from '../../../src/engine/types';

const scenario = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const roles: Record<string, RoleScript> = {
  executive: parse(executiveYaml) as unknown as RoleScript,
  officer: parse(officerYaml) as unknown as RoleScript,
  lead: parse(leadYaml) as unknown as RoleScript,
  analyst: parse(analystYaml) as unknown as RoleScript,
};
const abs = (t: { day: number; minutes: number }): number => t.day * 1440 + t.minutes;
const allText = (): string => JSON.stringify({ scenario, roles });

function point(id: string): { at: { day: number; minutes: number }; text: { ja: string } } {
  for (const role of Object.values(roles)) {
    const found = role.points.find((p) => p.id === id);
    if (found) return found as never;
  }
  throw new Error(`point not found: ${id}`);
}

describe('no04-goride レビュー指摘の反映', () => {
  it('検知は夜（day0 21:30）にずれ、全ロールで同じ時刻から始まる', () => {
    expect(scenario.start).toEqual({ day: 0, minutes: 1290 });
    for (const [name, role] of Object.entries(roles)) {
      const first = role.points[0]!;
      expect(first.at, `${name} の最初の判断に at がない`).toBeTruthy();
      expect(abs(first.at as never), `${name} の検知時刻`).toBe(1290);
      expect(first.text.ja).toContain('午後9時30分');
    }
  });

  it('時期の明記がなく、元事件の数字を使っていない', () => {
    const period = scenario.sourcePeriod.ja;
    expect(period).not.toMatch(/20[0-9]{2}年/);
    expect(period).toContain('フィクション');
    expect(allText()).not.toMatch(/660万|160万/);
  });

  it('各ロールの判断ポイントは時刻順で、イベントと同時刻に置かない', () => {
    for (const [name, role] of Object.entries(roles)) {
      let last = -1;
      for (const p of role.points) {
        const t = abs(p.at as never);
        expect(t, `${name} ${p.id} が前の判断より前`).toBeGreaterThan(last);
        last = t;
      }
      const points = new Set(role.points.map((p) => abs(p.at as never)));
      for (const event of role.events ?? []) {
        expect(points.has(abs(event.at)), `${name} の ${event.id} が判断と同じ時刻`).toBe(false);
      }
    }
  });

  it('ダークウェブの情報は担当者 → 部門長 → 経営・役員の順に届く', () => {
    const analystAt = abs(point('a13-leak').at);
    const leadAt = abs(point('p15-leak').at);
    const execPoint = abs(point('p12-leak').at);
    const execEvent = abs(roles.executive!.events?.find((e) => e.id === 'ev-darkweb')?.at as never);
    const officerAt = abs(point('o11-darkweb').at);
    expect(analystAt).toBeLessThan(leadAt);
    expect(leadAt).toBeLessThan(execEvent);
    expect(execEvent).toBeLessThan(execPoint);
    expect(execPoint).toBeLessThanOrEqual(officerAt);
  });

  it('速報は検知から72時間以内に出せる位置にある', () => {
    const start = abs(scenario.start);
    const within = (id: string, minutes: number): void => {
      const p = point(id);
      expect(abs(p.at) + minutes - start, `${id} が72時間を超える`).toBeLessThanOrEqual(72 * 60);
    };
    within('p03-first-report', 120);
    within('p07-first-report', 90);
    within('a11-prelim', 120);
  });

  it('保存方針の経緯は2023年に統一されている', () => {
    for (const id of ['p04-retention', 'o05-retention-own', 'p06-retention']) {
      expect(point(id).text.ja, id).toContain('2023年');
    }
    expect(allText()).not.toContain('五年前');
    expect(allText()).toContain('三年前');
  });

  it('第1報・第3報までで、第5報以降は出てこない', () => {
    const text = allText();
    expect(text).toContain('第1報');
    expect(text).toContain('第3報');
    expect(text).not.toMatch(/第[5-9]報/);
  });

  it('調査中の「削除」を高得点にしていない', () => {
    const targets = ['画像', 'データ', 'フォルダ'];
    const afterInvestigation = ['調査完了後', '調査が終わってから', '削除せず', '削除の時期', '保全'];
    for (const [name, role] of Object.entries(roles)) {
      for (const p of role.points) {
        for (const c of p.choices) {
          if (!c.text.ja.includes('削除')) continue;
          if (!targets.some((word) => c.text.ja.includes(word))) continue;
          if (afterInvestigation.some((phrase) => c.text.ja.includes(phrase))) continue;
          expect(c.points, `${name} ${c.id} が調査中の削除を高く評価`).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('旧版の食い違い（VPN機器・十天・漏えたのは）が残っていない', () => {
    const text = allText();
    expect(text).not.toContain('VPN機器');
    expect(text).not.toContain('十天');
    expect(text).not.toContain('漏えたのは');
  });

  it('ミスリードの型と文が対応し、正しい行動を勧める声は misleading ではない', () => {
    const positives = [
      '先に個別に伝える', 'はがきと電話の窓口', '残って、自社の再発防止', '全面停止を推薦し',
      '段階的に再開', '事実と不明点を分けて説明',
    ];
    for (const [name, role] of Object.entries(roles)) {
      const ids = new Set(role.voices.map((v) => v.id));
      for (const v of role.voices) {
        if (!v.misleading) continue;
        expect((MISLEADING_TYPES as readonly string[]).includes(v.type as string), `${name} ${v.id}`).toBe(true);
      }
      for (const p of role.points) {
        for (const id of p.voices ?? []) expect(ids.has(id), `${name} ${id}`).toBe(true);
      }
      for (const v of role.voices) {
        if (v.misleading) continue;
        for (const phrase of positives) {
          expect(v.text.ja.includes(phrase), `${name} ${v.id} の正しい声に ${phrase}`).toBe(false);
        }
      }
    }
  });

  it('記者会見は、隠した展開では「認める」回答を出さない', () => {
    const press = scenario.press;
    expect(press).toBeTruthy();
    for (const q of press?.questions ?? []) {
      const unconditional = q.answers.filter((a) => !a.when);
      expect(unconditional.length, `${q.id} に条件なしの回答がない`).toBeGreaterThanOrEqual(1);
    }
    const own = press?.questions
      .find((q) => q.id === 'q-retention')
      ?.answers.find((a) => a.id === 'a-retention-own');
    expect(own?.when?.flags?.hidRetention).toBe(false);
    const delay = press?.questions.find((q) => q.id === 'q-delay');
    expect(delay?.text.ja).toContain('夜に検知');
  });
});
