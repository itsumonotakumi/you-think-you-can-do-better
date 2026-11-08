// No.7 コネクトコール / セキュリティ担当者（兼任）ロールのデータ検査。
// 専任のセキュリティ部署がない会社で、情報システム部の主任が兼ねている立場を固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no07-connectcall/scenario.yaml?raw';
import roleYaml from '../../../scenarios/no07-connectcall/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import { simulatePaths } from '../../../tools/validate/paths';
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
const refIds = new Set(refs.map((r) => r.id));
const deadlineRefs = new Set(
  refs.filter((r) => typeof r.deadlineHours === 'number').map((r) => r.id),
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

function expectRefs(refsOf: string[], where: string): void {
  expect(refsOf.length, `${where} の refs が空`).toBeGreaterThan(0);
  for (const ref of refsOf) expect(refIds.has(ref), `${where} の根拠 ${ref} が references にない`).toBe(true);
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

describe('scenario no07-connectcall / analyst', () => {
  it('ロールの基本設定が契約どおり', () => {
    expect(scenario.id).toBe('no07-connectcall');
    expect(scenario.languages).toEqual(['ja']);
    expect(role.estimateMinutes).toBeGreaterThanOrEqual(30);
    expect(role.estimateMinutes).toBeLessThanOrEqual(60);
    expect(role.pressEnabled).toBe(true);
    expect(role.intro.en).toBe('');
    expect(role.intro.ja).toContain('兼任');
    expect(role.intro.ja).toContain('専任のセキュリティ部署はない');
    expect(role.points.length).toBeGreaterThanOrEqual(15);
    expect(role.points.length).toBeLessThanOrEqual(25);
  });

  it('判断ポイントは時間順で、選択肢の形式が正しい', () => {
    const pointIds = new Set<string>();
    const choiceIds = new Set<string>();
    let previous = -1;
    for (const point of role.points) {
      expect(pointIds.has(point.id), `判断ポイントIDの重複: ${point.id}`).toBe(false);
      pointIds.add(point.id);
      expect((PHASES as readonly string[]).includes(point.phase), `${point.id} の phase`).toBe(true);
      expect(point.choices.length).toBeGreaterThanOrEqual(2);
      expect(point.at, `${point.id} の at がない`).toBeTruthy();
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

  it('臆病な選択肢と、臆病ゲージの声がある', () => {
    const cowardChoices = role.points.flatMap((p) => p.choices.filter((c) => c.coward));
    expect(cowardChoices.length).toBeGreaterThanOrEqual(3);
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

  it('法定期限は根拠を使い、期限前に完了できる選択肢がある', () => {
    const deadlines = role.deadlines ?? [];
    expect(deadlines.length).toBeGreaterThanOrEqual(2);
    for (const d of deadlines) {
      expect(refIds.has(d.ref), `${d.id} の根拠 ${d.ref}`).toBe(true);
      expect(deadlineRefs.has(d.ref), `${d.id} の根拠に deadlineHours がない`).toBe(true);
      const ref = refs.find((r) => r.id === d.ref);
      const setBy = role.points
        .flatMap((p) => p.choices)
        .filter((c) => c.setFlags?.[d.doneFlag]);
      expect(setBy.length, `${d.id} の doneFlag ${d.doneFlag} を立てる選択肢がない`).toBeGreaterThanOrEqual(1);
      const dueAt = scenario.start.day * 1440 + scenario.start.minutes + (ref?.deadlineHours ?? 0) * 60;
      const earliest = role.points
        .filter((p) => p.at)
        .flatMap((p) =>
          p.choices.filter((c) => c.setFlags?.[d.doneFlag]).map((c) => p.at!.day * 1440 + p.at!.minutes),
        )
        .sort((a, b) => a - b)[0];
      expect(earliest, `${d.id} を期限前に完了できる選択肢がない`).toBeLessThan(dueAt);
    }
  });

  it('記者会見の記録が必要な回答を、このロールでも取れる', () => {
    const noteIds = new Set(role.points.flatMap((p) => (p.notable ?? []).map((n) => n.id)));
    const noteAnswers = [
      ...(scenario.press?.questions ?? []),
      ...(scenario.press?.extraQuestions ?? []).map((e) => e.question),
    ].flatMap((q) => q.answers.filter((a) => typeof a.requiresNote === 'string'));
    expect(noteAnswers.length).toBeGreaterThanOrEqual(1);
    for (const answer of noteAnswers) {
      expect(noteIds.has(answer.requiresNote as string), `記録 ${answer.requiresNote} が notable にない`).toBe(true);
    }
  });

  it('声は日本語のみで、形がそろっている', () => {
    for (const v of role.voices) {
      expect(v.text.ja.length).toBeGreaterThan(0);
      expect(v.text.en).toBe('');
      expect(['sns', 'news', 'board', 'chat', 'boss', 'vendor', 'attacker']).toContain(v.media);
      if (v.misleading) expect(v.type).toBeTruthy();
    }
  });

  it('文言は日本語のみで、HTMLとASCIIのカンマ・コロンを含まない', () => {
    const localized = collectLocalized(role);
    expect(localized.length).toBeGreaterThan(50);
    for (const text of localized) {
      expect(text.ja.length, 'ja が空').toBeGreaterThan(0);
      expect(text.en, 'v1 は英語本文を持たない').toBe('');
      expect(text.ja).not.toMatch(/<[^>]+>|\{@html\}/);
      expect(text.ja, `ASCIIの記号: ${text.ja}`).not.toMatch(/[,:]/);
    }
  });

  it('禁止リストの実在社名・サービス名・国名を含まない', () => {
    const deny = parse(denylistYaml) as Record<string, string[]>;
    const blob = JSON.stringify(scenario);
    for (const list of [deny.companies, deny.services, deny.people, deny.countries]) {
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word} が含まれる`).toBe(false);
    }
  });
});

describe('到達できるランク', () => {
  const simulation = simulatePaths(scenario, refs, 'analyst', undefined, { randomRuns: 120 });

  it('S・A・B・C・D のすべてに届く', () => {
    expect(simulation.failures).toEqual([]);
    expect(simulation.runs.every((run) => run.finished)).toBe(true);
    const ranks = new Set(simulation.runs.map((run) => run.rank));
    expect([...ranks].sort()).toEqual(['A', 'B', 'C', 'D', 'S']);
  });

  it('中くらいの選択の組み合わせで A・B・C に届く', () => {
    const middle = new Set(
      simulation.runs
        .filter((run) => run.label.startsWith('avoid-fatal/') || run.label.startsWith('one-fatal/'))
        .map((run) => run.rank),
    );
    expect(middle.has('A')).toBe(true);
    expect(middle.has('B')).toBe(true);
    expect(middle.has('C')).toBe(true);
  });

  it('致命的な失点を含む経路では S に届かない', () => {
    for (const run of simulation.runs) {
      if (run.fatal) expect(run.rank).not.toBe('S');
    }
  });
});
