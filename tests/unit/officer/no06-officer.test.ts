// No.6 アマツ重工 / 役員（人事・総務担当常務）ロールのデータ検査。
// 共有契約（src/engine/types.ts）と validate の約束を、担当ファイル単体で固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no06-amatsu/scenario.yaml?raw';
import roleYaml from '../../../scenarios/no06-amatsu/roles/officer.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import { CATEGORY_RANGE, MISLEADING_TYPES } from '../../../src/engine/types';
import type {
  Choice,
  DetailItem,
  Draft,
  Localized,
  Reference,
  RoleScript,
  Scenario,
  Voice,
} from '../../../src/engine/types';
import { simulatePaths } from '../../../tools/validate/paths';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const role = parse(roleYaml) as unknown as RoleScript;
const refs = parse(referencesYaml) as Reference[];
const scenario: Scenario = { ...base, roles: { officer: role } };

const refIds = new Set(refs.map((ref) => ref.id));

const choiceItems = role.points.flatMap((p) => p.choices.flatMap((c) => c.items ?? []));
const draftItems = Object.values(role.drafts ?? {}).flatMap((d: Draft) =>
  d.slots.flatMap((s) => [...(s.items ?? []), ...(s.options ?? [])]),
);
const detailItems: DetailItem[] = [...choiceItems, ...draftItems];
const voicesById = new Map(role.voices.map((v) => [v.id, v]));
const choiceById = new Map(role.points.flatMap((p) => p.choices.map((c) => [c.id, c] as const)));

function collectLocalized(node: unknown, out: Localized[] = []): Localized[] {
  if (Array.isArray(node)) {
    for (const v of node) collectLocalized(v, out);
    return out;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.ja === 'string' && typeof obj.en === 'string') {
      out.push(obj as unknown as Localized);
      return out;
    }
    for (const v of Object.values(obj)) collectLocalized(v, out);
  }
  return out;
}

function expectRefs(values: string[], where: string): void {
  expect(values.length, `${where} の refs が空`).toBeGreaterThan(0);
  for (const ref of values) expect(refIds.has(ref), `${where} の根拠 ${ref} が references にない`).toBe(true);
}

function expectChoice(choice: Choice): void {
  const where = choice.id;
  expect(choice.minutes).toBeGreaterThan(0);
  expect(choice.minutes % 15, `${where} の minutes が15の倍数でない`).toBe(0);
  const [min, max] = CATEGORY_RANGE[choice.category];
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeGreaterThanOrEqual(min);
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeLessThanOrEqual(max);
  expectRefs(choice.refs, where);
}

describe('no06-amatsu / officer', () => {
  it('ロールのメタ情報が契約どおり', () => {
    expect(role.estimateMinutes).toBeGreaterThan(0);
    expect(role.pressEnabled).toBe(true);
    expect(role.intro.ja.length).toBeGreaterThan(0);
    expect(role.points.length).toBeGreaterThanOrEqual(15);
    expect(role.points.length).toBeLessThanOrEqual(25);
  });

  it('判断ポイントの時刻が15分刻みで、先へ進む', () => {
    let previous = -1;
    for (const point of role.points) {
      if (!point.at) continue;
      expect(point.at.minutes % 15, `${point.id} の at が15分刻みでない`).toBe(0);
      expect(point.at.minutes).toBeGreaterThanOrEqual(0);
      expect(point.at.minutes).toBeLessThan(24 * 60);
      const clock = point.at.day * 1440 + point.at.minutes;
      expect(clock, `${point.id} の at が前の判断より前`).toBeGreaterThan(previous);
      previous = clock;
    }
  });

  it('選択肢が区分・時間・根拠の範囲に収まる', () => {
    const pointIds = new Set<string>();
    for (const point of role.points) {
      expect(pointIds.has(point.id), `判断ポイントIDの重複: ${point.id}`).toBe(false);
      pointIds.add(point.id);
      expect(point.text.ja.length).toBeGreaterThan(0);
      expect(point.choices.length).toBeGreaterThanOrEqual(2);
      for (const choice of point.choices) expectChoice(choice);
    }
  });

  it('細目は80以上、点数は±1〜20、IDは一意、根拠がある', () => {
    expect(detailItems.length).toBeGreaterThanOrEqual(80);
    const ids = new Set<string>();
    for (const item of detailItems) {
      expect(ids.has(item.id), `細目IDの重複: ${item.id}`).toBe(false);
      ids.add(item.id);
      expect(Number.isInteger(item.points), `${item.id} の点数が整数でない`).toBe(true);
      expect(Math.abs(item.points), `${item.id} の点数`).toBeGreaterThanOrEqual(1);
      expect(Math.abs(item.points), `${item.id} の点数`).toBeLessThanOrEqual(20);
      expect(['time', 'order', 'wording', 'content', 'record', 'care']).toContain(item.axis);
      expectRefs(item.refs, item.id);
    }
  });

  it('ミスリードは判断ポイントの半数以上、型は8種以上', () => {
    let withMisleading = 0;
    const usedTypes = new Set<string>();
    for (const point of role.points) {
      let has = false;
      for (const id of point.voices ?? []) {
        const voice = voicesById.get(id);
        expect(voice, `声 ${id} が見つからない`).toBeTruthy();
        if (voice?.misleading) {
          has = true;
          expect(voice.type, `${id} に type がない`).toBeTruthy();
          expect((MISLEADING_TYPES as readonly string[]).includes(voice.type as string)).toBe(true);
          usedTypes.add(voice.type as string);
        }
      }
      if (has) withMisleading += 1;
    }
    expect(withMisleading * 2).toBeGreaterThanOrEqual(role.points.length);
    expect(usedTypes.size).toBeGreaterThanOrEqual(8);
  });

  it('臆病ゲージと、正しい選択の直後の批判がある', () => {
    const cowardChoices = role.points.flatMap((p) => p.choices.filter((c) => c.coward));
    expect(cowardChoices.length).toBeGreaterThanOrEqual(1);
    for (const key of ['2', '3', '4'] as const) {
      const id = role.cowardVoices[key];
      expect(voicesById.get(id), `臆病ゲージ${key}の声 ${id}`).toBeTruthy();
      expect(voicesById.get(id)?.trigger).toEqual({ at: 'manual' });
    }
    const after = role.voices.filter((v) => 'at' in v.trigger && v.trigger.at === 'after');
    expect(after.length).toBeGreaterThanOrEqual(1);
    const criticisesGoodChoice = after.some((v: Voice) => {
      const trigger = v.trigger;
      if (!('at' in trigger) || trigger.at !== 'after' || !trigger.choice) return false;
      const choice = choiceById.get(trigger.choice);
      return !!choice && choice.points > 0 && ['maintain', 'recover', 'increase'].includes(choice.category);
    });
    expect(criticisesGoodChoice).toBe(true);
  });

  it('期限は速報の根拠を使い、選択肢で done になる', () => {
    const deadlines = role.deadlines ?? [];
    expect(deadlines.length).toBeGreaterThanOrEqual(1);
    for (const deadline of deadlines) {
      const ref = refs.find((r) => r.id === deadline.ref);
      expect(ref, `${deadline.ref} が references にない`).toBeTruthy();
      expect(ref?.deadlineHours, `${deadline.ref} に deadlineHours がない`).toBeTruthy();
      const setBy = role.points
        .flatMap((p) => p.choices)
        .filter((c) => c.setFlags?.[deadline.doneFlag]);
      expect(setBy.length, `${deadline.id} の doneFlag を立てる選択肢がない`).toBeGreaterThanOrEqual(1);
    }
  });

  it('文案作成が複数あり、スロットは items か options の片方だけを持つ', () => {
    const drafts = Object.values(role.drafts ?? {});
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    for (const draft of drafts) {
      expect(draft.slots.length).toBeGreaterThan(0);
      for (const slot of draft.slots) {
        const hasItems = Array.isArray(slot.items);
        const hasOptions = Array.isArray(slot.options);
        expect(hasItems !== hasOptions, `${slot.id} は items と options のどちらか一方`).toBe(true);
        if (slot.auto) expect(hasItems, `${slot.id} の自動スロットは items`).toBe(true);
      }
    }
  });

  it('社長への報告書の時刻スロットは、24時間を超えてからでも加点が残る', () => {
    const timing = role.drafts?.['board-report']?.slots.find((s) => s.id === 'timing');
    const hours = (timing?.items ?? []).map((item) => item.when?.withinHours);
    expect(hours).toContain(30);
    expect(hours).toContain(48);
    // 判断ポイント p04 は開始から24時間15分後に開く
    const p04 = role.points.find((p) => p.id === 'p04-board-report');
    expect(p04?.at).toEqual({ day: 1, minutes: 540 });
  });

  it('なりすましの発覚は Day 5、送付先の住所は Day 2 に揃えている', () => {
    const p07 = role.points.find((p) => p.id === 'p07-impersonated');
    expect(p07?.at).toEqual({ day: 5, minutes: 900 });
    const p06 = role.points.find((p) => p.id === 'p06-applicant-report');
    const notes = new Set((p06?.notable ?? []).map((n) => n.id));
    expect(notes.has('note-address')).toBe(true);
    const text = JSON.stringify(role);
    expect(text).not.toContain('某国内');
    expect(text).not.toContain('貸された');
    expect(text).not.toContain('面接四回');
    expect(text).not.toContain('四十名全員');
  });

  it('名簿を丸ごと渡す選択は致命的ではなく、国籍による選別は致命的のまま', () => {
    expect(choiceById.get('p13-all')?.category).toBe('hurt');
    expect(choiceById.get('p13-all')?.points).toBe(-60);
    expect(choiceById.get('p13-all')?.refs).toContain('no04-ppc-guideline-general');
    for (const id of ['p05-foreign', 'p10-list', 'p17-origin']) {
      const c = choiceById.get(id);
      expect(c?.category).toBe('fatal');
      expect(c?.refs).toContain('no06-equal-treatment');
    }
    const fatals = role.points.flatMap((p) => p.choices).filter((c) => c.category === 'fatal');
    expect(fatals.length).toBeLessThanOrEqual(10);
  });

  it('S・A・B・C・D のすべてに到達でき、致命的な失点では S にならない', () => {
    const simulation = simulatePaths(scenario, refs, 'officer', undefined, { randomRuns: 300 });
    expect(simulation.failures).toEqual([]);
    expect(simulation.runs.length).toBeGreaterThan(0);
    expect(simulation.runs.every((run) => run.finished)).toBe(true);
    const ranks = new Set(simulation.runs.map((run) => run.rank));
    for (const rank of ['S', 'A', 'B', 'C', 'D'] as const) {
      expect(ranks.has(rank), `${rank} に到達できない`).toBe(true);
    }
    expect(simulation.runs.filter((run) => run.fatal).every((run) => run.rank !== 'S')).toBe(true);
  });

  it('文言は日本語のみで、HTMLを含まない', () => {
    const localized = collectLocalized(scenario);
    expect(localized.length).toBeGreaterThan(50);
    for (const text of localized) {
      expect(text.ja.length, 'ja が空').toBeGreaterThan(0);
      expect(text.en, 'v1 は英語本文を持たない').toBe('');
      expect(text.ja).not.toMatch(/<[^>]+>|\{@html\}/);
    }
  });

  it('禁止リストの実在社名・サービス名・国名を含まない', () => {
    const deny = parse(denylistYaml) as Record<string, string[]>;
    const blob = JSON.stringify(role);
    for (const list of [deny.companies, deny.services, deny.people, deny.countries]) {
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word} が含まれる`).toBe(false);
    }
  });
});
