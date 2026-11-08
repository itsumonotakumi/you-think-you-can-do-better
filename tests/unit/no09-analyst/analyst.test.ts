// No.9 ハマカゼ総合医療センター / セキュリティ担当者ロールのデータ検査。
// 検査ツール（tools/validate）とは別に、担当ロールの約束をここで固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no09-hamakaze/scenario.yaml?raw';
import roleYaml from '../../../scenarios/no09-hamakaze/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import { simulatePaths } from '../../../tools/validate/paths.ts';
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

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const role = parse(roleYaml) as unknown as RoleScript;
const scenario: Scenario = { ...base, roles: { analyst: role } };
const refs = parse(referencesYaml) as Reference[];

// references.yaml は共有ファイルで、素朴な YAML パーサが読み違える行があるため id だけを拾う。
const refIds = new Set(
  [...referencesYaml.matchAll(/^\s*- id: (\S+)/gm)].map((m) => m[1] as string),
);
const deadlineRefs = new Set(
  [...referencesYaml.matchAll(/^\s*- id: (\S+)[\s\S]*?deadlineHours:/gm)].map((m) => m[1] as string),
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

function expectRefs(ids: string[], where: string): void {
  expect(ids.length, `${where} の refs が空`).toBeGreaterThan(0);
  for (const ref of ids) expect(refIds.has(ref), `${where} の根拠 ${ref} が references にない`).toBe(true);
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

describe('scenario no09-hamakaze / analyst', () => {
  it('ロールの基本設定が契約どおり', () => {
    expect(scenario.id).toBe('no09-hamakaze');
    expect(scenario.languages).toEqual(['ja']);
    expect(role.estimateMinutes).toBeGreaterThanOrEqual(30);
    expect(role.estimateMinutes).toBeLessThanOrEqual(60);
    expect(role.pressEnabled).toBe(true);
    expect(role.intro.ja.length).toBeGreaterThan(40);
    expect(role.intro.en).toBe('');
    expect(role.intro.ja).toContain('専任のセキュリティ部署');
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
        const at = point.at.day * 1440 + point.at.minutes;
        expect(at, `${point.id} の at が前の判断より前`).toBeGreaterThan(previous);
        previous = at;
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

  it('細目の軸が6種類そろっている', () => {
    const axes = new Set(detailItems.map((item) => item.axis));
    expect(axes.size).toBe(6);
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

  it('臆病な選択肢と、臆病ゲージの声がある', () => {
    const cowardChoices = role.points.flatMap((p) => p.choices.filter((c) => c.coward));
    expect(cowardChoices.length).toBeGreaterThanOrEqual(2);
    for (const key of ['2', '3', '4'] as const) {
      const id = role.cowardVoices[key];
      const voice = voicesById.get(id);
      expect(voice, `臆病ゲージ${key}の声 ${id}`).toBeTruthy();
      expect(voice?.trigger).toEqual({ at: 'manual' });
    }
  });

  it('正しい選択の直後に批判の声がある', () => {
    const after = role.voices.filter((v) => 'at' in v.trigger && v.trigger.at === 'after');
    expect(after.length).toBeGreaterThanOrEqual(3);
    const criticisesGoodChoice = after.some((v: Voice) => {
      const trigger = v.trigger;
      if (!('at' in trigger) || trigger.at !== 'after' || !trigger.choice) return false;
      const c = choiceById.get(trigger.choice);
      return !!c && c.points > 0 && (c.category === 'maintain' || c.category === 'recover' || c.category === 'increase');
    });
    expect(criticisesGoodChoice).toBe(true);
    for (const v of after) {
      const trigger = v.trigger;
      if ('at' in trigger && trigger.at === 'after' && trigger.choice) {
        expect(choiceById.has(trigger.choice), `${v.id} の choice が見つからない`).toBe(true);
      }
    }
  });

  it('法定期限は references の期限付き根拠を使い、doneFlag を立てる選択肢がある', () => {
    const deadlines = role.deadlines ?? [];
    expect(deadlines.length).toBeGreaterThanOrEqual(2);
    for (const deadline of deadlines) {
      expect(refIds.has(deadline.ref), `期限の根拠 ${deadline.ref} が references にない`).toBe(true);
      expect(deadlineRefs.has(deadline.ref), `期限の根拠 ${deadline.ref} に deadlineHours がない`).toBe(true);
      const setBy = role.points.flatMap((p) => p.choices).filter((c) => c.setFlags?.[deadline.doneFlag]);
      expect(setBy.length, `${deadline.id} の doneFlag を立てる選択肢がない`).toBeGreaterThanOrEqual(1);
    }
  });

  it('記録に残せる事実と、自分の上申の注記がある', () => {
    const noteIds = new Set(role.points.flatMap((p) => (p.notable ?? []).map((n) => n.id)));
    for (const id of ['note-outage', 'note-entry', 'note-leak', 'note-report', 'note-warning']) {
      expect(noteIds.has(id), `${id} がない`).toBe(true);
    }
  });

  it('文言は日本語のみで、HTMLや禁止された実行時APIを含まない', () => {
    const localized = collectLocalized(scenario);
    expect(localized.length).toBeGreaterThan(50);
    for (const text of localized) {
      expect(text.ja.length, 'ja が空').toBeGreaterThan(0);
      expect(text.en, 'v1 は英語本文を持たない').toBe('');
      expect(text.ja).not.toMatch(/<[^>]+>|\{@html\}/);
    }
    for (const banned of ['Math.random', 'Date.now', '{@html}', 'eval(', 'new Function']) {
      expect(roleYaml.includes(banned), `${banned} を使わない`).toBe(false);
    }
  });

  it('禁止リストの実在社名・サービス名・人物名・国名を含まない', () => {
    const deny = parse(denylistYaml) as Record<string, string[]>;
    const blob = JSON.stringify(scenario);
    for (const list of [deny.companies, deny.services, deny.people, deny.countries]) {
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word} が含まれる`).toBe(false);
    }
  });

  it(
    'S〜D のすべてのランクに届き、fatal の経路は S にならない',
    () => {
      const simulation = simulatePaths(scenario, refs, 'analyst', undefined, { randomRuns: 2000 });
      expect(simulation.failures).toEqual([]);
      const ranks = new Set(simulation.runs.map((run) => run.rank));
      for (const rank of ['S', 'A', 'B', 'C', 'D'] as const) {
        expect([...ranks], `${rank} に届く経路がない`).toContain(rank);
      }
      const fatalRuns = simulation.runs.filter((run) => run.fatal);
      expect(fatalRuns.length).toBeGreaterThan(0);
      expect(fatalRuns.every((run) => run.rank !== 'S')).toBe(true);
      expect(
        simulation.runs.some((run) => !run.fatal && run.rank === 'A'),
        '致命的な失点なしで A に届く経路がない',
      ).toBe(true);
      expect(
        simulation.runs.some((run) => run.official >= 200 && run.official < 1200),
        '中くらいの点数帯（公式スコア 200〜1199）に届く経路がない',
      ).toBe(true);
    },
    60000,
  );
});
