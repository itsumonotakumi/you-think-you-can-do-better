// No.5 コガネ酒造HD / 役員・グループ会社社長ロールのデータ検査。
// 共有契約（src/engine/types.ts）と validate の約束を、担当ファイル単体で固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no05-kogane/scenario.yaml?raw';
import roleYaml from '../../../scenarios/no05-kogane/roles/officer.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import { CATEGORY_RANGE, MISLEADING_TYPES, PHASES } from '../../../src/engine/types';
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

function expectRefs(refsValue: string[], where: string): void {
  expect(refsValue.length, `${where} の refs が空`).toBeGreaterThan(0);
  for (const ref of refsValue) expect(refIds.has(ref), `${where} の根拠 ${ref} が references にない`).toBe(true);
}

function expectChoice(choice: Choice): void {
  const where = choice.id;
  expect(choice.minutes).toBeGreaterThan(0);
  expect(choice.minutes % 15, `${where} の minutes が15の倍数でない`).toBe(0);
  const [min, max] = CATEGORY_RANGE[choice.category];
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeGreaterThanOrEqual(min);
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeLessThanOrEqual(max);
  expectRefs(choice.refs, where);
  if (choice.category === 'fatal') expect(choice.points).toBeLessThanOrEqual(-200);
}

describe('no05-kogane / officer', () => {
  it('ロールのメタ情報とフェーズの並びが契約どおり', () => {
    expect(role.estimateMinutes).toBeGreaterThan(0);
    expect(role.pressEnabled).toBe(true);
    expect(role.intro.ja).toContain('グループ会社');
    expect(role.points.length).toBeGreaterThanOrEqual(15);
    expect(role.points.length).toBeLessThanOrEqual(25);
    let previous = -1;
    let previousClock = -1;
    for (const point of role.points) {
      const index = PHASES.indexOf(point.phase);
      expect(index, `${point.id} の phase`).toBeGreaterThanOrEqual(0);
      expect(index, `${point.id} でフェーズが戻っている`).toBeGreaterThanOrEqual(previous);
      previous = index;
      if (point.at) {
        expect(point.at.minutes % 15, `${point.id} の at が15分刻みでない`).toBe(0);
        expect(point.at.minutes).toBeGreaterThanOrEqual(0);
        expect(point.at.minutes).toBeLessThan(24 * 60);
        const clock = point.at.day * 1440 + point.at.minutes;
        expect(clock, `${point.id} の at が前の判断より前`).toBeGreaterThan(previousClock);
        previousClock = clock;
      }
    }
  });

  it('判断ポイントの選択肢が区分・時間・根拠の範囲に収まる', () => {
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

  it('期限は速報と確報の根拠を使い、選択肢で done になる', () => {
    const deadlines = role.deadlines ?? [];
    expect(deadlines.length).toBeGreaterThanOrEqual(2);
    const prelim = deadlines.find((d) => d.ref === 'ppc-report-prelim');
    const final = deadlines.find((d) => d.ref === 'ppc-report-final');
    expect(prelim, 'ppc-report-prelim の期限がない').toBeTruthy();
    expect(final, 'ppc-report-final の期限がない').toBeTruthy();
    const choices = role.points.flatMap((p) => p.choices);
    for (const deadline of deadlines) {
      const setBy = choices.filter((c) => deadline && c.setFlags?.[deadline.doneFlag]);
      expect(setBy.length, `${deadline.id} の doneFlag を立てる選択肢がない`).toBeGreaterThanOrEqual(1);
    }
  });

  it('文案作成が2種類あり、スロットは items か options の片方だけを持つ', () => {
    const drafts = Object.values(role.drafts ?? {});
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    for (const draft of drafts) {
      expect(draft.slots.length).toBeGreaterThan(0);
      for (const slot of draft.slots) {
        const hasItems = Array.isArray(slot.items);
        const hasOptions = Array.isArray(slot.options);
        expect(hasItems !== hasOptions, `${slot.id} は items と options のどちらか一方`).toBe(true);
      }
    }
  });

  it('S・A・B・C・D のすべてに到達でき、致命的な失点では S にならない', () => {
    // 中くらいの選択の組み合わせが B〜C に届くことを、シード固定の乱数走行で確かめる。
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

  it('禁止リストの実在社名・サービス名を含まない', () => {
    const deny = parse(denylistYaml) as Record<string, string[]>;
    const blob = JSON.stringify(scenario);
    for (const list of [deny.companies, deny.services, deny.people, deny.countries]) {
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word} が含まれる`).toBe(false);
    }
  });
});
