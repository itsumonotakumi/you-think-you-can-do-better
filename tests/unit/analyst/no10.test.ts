// No.10 ネクサス半導体 / セキュリティ担当者ロールのデータ検査。
// 検査ツール（tools/validate）とは別に、担当ロールの約束をここで固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no10-nexus/scenario.yaml?raw';
import roleYaml from '../../../scenarios/no10-nexus/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import {
  CATEGORY_RANGE,
  MISLEADING_TYPES,
  PHASES,
} from '../../../src/engine/types';
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
const scenario: Scenario = { ...base, roles: { analyst: role } };

// references.yaml は共有ファイルで、素朴な YAML パーサが読み違える行があるため id だけを拾う。
const refBlocks = referencesYaml.split(/\n(?=- id: )/);
const refIds = new Set(
  refBlocks.map((block) => block.match(/^- id: (\S+)/m)?.[1]).filter((id): id is string => !!id),
);
const deadlineRefs = new Set(
  refBlocks
    .filter((block) => block.includes('deadlineHours:'))
    .map((block) => block.match(/^- id: (\S+)/m)?.[1])
    .filter((id): id is string => !!id),
);

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

function expectRefs(refs: string[], where: string): void {
  expect(refs.length, `${where} の refs が空`).toBeGreaterThan(0);
  for (const ref of refs) expect(refIds.has(ref), `${where} の根拠 ${ref} が references にない`).toBe(true);
}

function expectChoice(choice: Choice): void {
  const where = `${choice.id}`;
  expect(choice.minutes).toBeGreaterThan(0);
  expect(choice.minutes % 15, `${where} の minutes が15の倍数でない`).toBe(0);
  const [min, max] = CATEGORY_RANGE[choice.category];
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeGreaterThanOrEqual(min);
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeLessThanOrEqual(max);
  expectRefs(choice.refs, where);
  if (choice.category === 'fatal') expect(choice.points).toBeLessThanOrEqual(-200);
  if (choice.category === 'increase') expect(typeof choice.fatalAlternate).toBe('number');
}

describe('scenario no10-nexus / analyst', () => {
  it('ロールの基本設定が契約どおり', () => {
    expect(scenario.id).toBe('no10-nexus');
    expect(scenario.languages).toEqual(['ja']);
    expect(role.estimateMinutes).toBeGreaterThan(0);
    expect(role.pressEnabled).toBe(true);
    expect(role.intro.ja.length).toBeGreaterThan(0);
    expect(role.intro.en).toBe('');
    expect(role.points.length).toBeGreaterThanOrEqual(15);
    expect(role.points.length).toBeLessThanOrEqual(25);
  });

  it('判断ポイントと選択肢の形式が正しい', () => {
    const pointIds = new Set<string>();
    const choiceIds = new Set<string>();
    let previous = -1;
    for (const point of role.points) {
      expect(pointIds.has(point.id), `判断ポイントIDの重複: ${point.id}`).toBe(false);
      pointIds.add(point.id);
      expect((PHASES as readonly string[]).includes(point.phase), `${point.id} の phase`).toBe(true);
      expect(point.choices.length).toBeGreaterThanOrEqual(2);
      if (point.at) {
        expect(point.at.minutes % 15).toBe(0);
        const absolute = point.at.day * 1440 + point.at.minutes;
        expect(absolute, `${point.id} の時刻が前の判断より前`).toBeGreaterThanOrEqual(previous);
        previous = absolute;
      }
      for (const choice of point.choices) {
        expect(choiceIds.has(choice.id), `選択肢IDの重複: ${choice.id}`).toBe(false);
        choiceIds.add(choice.id);
        expectChoice(choice);
      }
      for (const id of point.voices ?? []) {
        expect(voicesById.get(id), `声 ${id} が見つからない`).toBeTruthy();
      }
    }
  });

  it('細目は80以上、点数は±1〜20、IDは一意、根拠がある', () => {
    expect(detailItems.length).toBeGreaterThanOrEqual(80);
    const ids = new Set<string>();
    for (const item of detailItems) {
      expect(ids.has(item.id), `細目IDの重複: ${item.id}`).toBe(false);
      ids.add(item.id);
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
      const voice = voicesById.get(id);
      expect(voice, `臆病ゲージ${key}の声 ${id}`).toBeTruthy();
      expect(voice?.trigger).toEqual({ at: 'manual' });
    }
    const after = role.voices.filter((v) => 'at' in v.trigger && v.trigger.at === 'after');
    expect(after.length).toBeGreaterThanOrEqual(1);
    const criticisesGoodChoice = after.some((v: Voice) => {
      const trigger = v.trigger;
      if (!('at' in trigger) || trigger.at !== 'after' || !trigger.choice) return false;
      const c = choiceById.get(trigger.choice);
      return !!c && c.points > 0 && (c.category === 'maintain' || c.category === 'recover' || c.category === 'increase');
    });
    expect(criticisesGoodChoice).toBe(true);
  });

  it('deadline は references の期限付き根拠を使い、doneFlag を立てる選択肢がある', () => {
    const deadlines = role.deadlines ?? [];
    expect(deadlines.length).toBeGreaterThanOrEqual(1);
    for (const deadline of deadlines) {
      expect(refIds.has(deadline.ref), `期限の根拠 ${deadline.ref} が references にない`).toBe(true);
      expect(deadlineRefs.has(deadline.ref), `期限の根拠 ${deadline.ref} に deadlineHours がない`).toBe(true);
      const setBy = role.points
        .flatMap((p) => p.choices)
        .filter((c) => c.setFlags?.[deadline.doneFlag]);
      expect(setBy.length, `${deadline.id} の doneFlag を立てる選択肢がない`).toBeGreaterThanOrEqual(1);
    }
    const prelim = deadlines.find((d) => d.ref === 'ppc-report-prelim');
    expect(prelim, 'ppc-report-prelim の期限がない').toBeTruthy();
  });

  it('記録に残せる事実と、記者会見の回答に必要な注記がある', () => {
    const noteIds = new Set(role.points.flatMap((p) => (p.notable ?? []).map((n) => n.id)));
    expect(noteIds.has('note-ai-log')).toBe(true);
    expect(noteIds.has('note-employee-intent')).toBe(true);
    expect(noteIds.has('note-customer-process')).toBe(true);
    expect(noteIds.has('note-scope')).toBe(true);
  });

  it('popular と detail の参照先が正しい', () => {
    const draftKeys = new Set(Object.keys(role.drafts ?? {}));
    for (const point of role.points) {
      if (point.popular) {
        expect(choiceById.has(point.popular.choiceId), `${point.id} の popular.choiceId`).toBe(true);
      }
      for (const choice of point.choices) {
        if (choice.detail) expect(draftKeys.has(choice.detail), `${choice.id} の detail`).toBe(true);
      }
    }
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

  it('禁止リストの実在社名・サービス名を含まない', () => {
    const deny = parse(denylistYaml) as Record<string, string[]>;
    const blob = JSON.stringify(scenario);
    for (const list of [deny.companies, deny.services, deny.people, deny.countries]) {
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word} が含まれる`).toBe(false);
    }
  });

  it('S/A/B/C/D のすべてに到達でき、致命的な失点では S にならない', () => {
    const refs = parse(referencesYaml) as Reference[];
    const simulation = simulatePaths(scenario, refs, 'analyst', undefined, { randomRuns: 500 });
    expect(simulation.failures).toEqual([]);
    expect(simulation.runs.every((run) => run.finished)).toBe(true);
    const ranks = new Set(simulation.runs.map((run) => run.rank));
    expect([...ranks].sort()).toEqual(['A', 'B', 'C', 'D', 'S']);
    expect(simulation.runs.some((run) => run.fatal && run.rank === 'S')).toBe(false);
  });
});
