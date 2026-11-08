// No.3 やまびこ商店 / 役員（常務取締役・通販部門責任者）ロールのデータ検査。
// 共有契約（src/engine/types.ts）と validate の約束を、担当ファイル単体で固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no03-yamabiko/scenario.yaml?raw';
import roleYaml from '../../../scenarios/no03-yamabiko/roles/officer.yaml?raw';
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
import {
  startPlay,
  currentPoint,
  choose,
  submitDraft,
  startPress,
  availableAnswers,
  answerPress,
  computeResult,
} from '../../../src/engine';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const role = parse(roleYaml) as unknown as RoleScript;
const scenario: Scenario = { ...base, roles: { officer: role } };
const refs = parse(referencesYaml) as unknown as Reference[];

const refIds = new Set(
  [...referencesYaml.matchAll(/^\s*- id: (\S+)/gm)].map((m) => m[1] as string),
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
  const where = choice.id;
  expect(choice.minutes).toBeGreaterThan(0);
  expect(choice.minutes % 15, `${where} の minutes が15の倍数でない`).toBe(0);
  const [min, max] = CATEGORY_RANGE[choice.category];
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeGreaterThanOrEqual(min);
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeLessThanOrEqual(max);
  expectRefs(choice.refs, where);
  if (choice.category === 'fatal') expect(choice.points).toBeLessThanOrEqual(-200);
}

/** 貪欲に1回プレイして公式スコアを返す（max または min） */
function play(policy: 'max' | 'min'): { rank: string; official: number } {
  const dir = policy === 'max' ? -1 : 1;
  const ordered = <T extends { points: number }>(list: T[]): T[] =>
    [...list].sort((a, b) => (a.points - b.points) * dir);
  let step = startPlay(
    scenario,
    'officer',
    1,
    { comment: '', predictedHours: null },
    '2026-11-08T00:00:00.000Z',
    refs,
  );
  let state = step.state;
  let next = step.next;
  for (let guard = 0; guard < 200 && next !== 'ending'; guard += 1) {
    if (next === 'point') {
      const point = currentPoint(state, scenario);
      if (!point) throw new Error('判断ポイントがない');
      const choice = ordered(point.choices).at(0);
      if (!choice) throw new Error('選択肢がない');
      step = choose(state, scenario, choice.id);
    } else if (next === 'draft') {
      const key = state.pendingDraft;
      const draft = key ? role.drafts?.[key] : undefined;
      if (!draft) throw new Error(`文案がない: ${key}`);
      const selections: Record<string, string> = {};
      for (const slot of draft.slots) {
        if (slot.auto) continue;
        const item = ordered([...(slot.options ?? slot.items ?? [])]).at(0);
        if (item) selections[slot.id] = item.id;
      }
      step = submitDraft(state, scenario, selections);
    } else if (next === 'press') {
      step = startPress(state, scenario);
      state = step.state;
      while (step.next === 'press') {
        const answer = ordered(availableAnswers(state, scenario)).at(0);
        step = answerPress(state, scenario, answer?.id ?? null);
        state = step.state;
      }
    } else {
      throw new Error(`未知の遷移: ${String(next)}`);
    }
    state = step.state;
    next = step.next;
  }
  const result = computeResult(state, scenario);
  return { rank: result.rank, official: result.official };
}

describe('no03-yamabiko / officer', () => {
  it('ロールのメタ情報とフェーズの並びが契約どおり', () => {
    expect(role.estimateMinutes).toBeGreaterThan(0);
    expect(role.pressEnabled).toBe(true);
    expect(role.intro.ja).toContain('常務');
    expect(role.points.length).toBeGreaterThanOrEqual(15);
    expect(role.points.length).toBeLessThanOrEqual(25);
    let previous = -1;
    for (const point of role.points) {
      const index = PHASES.indexOf(point.phase);
      expect(index, `${point.id} の phase`).toBeGreaterThanOrEqual(0);
      expect(index, `${point.id} でフェーズが戻っている`).toBeGreaterThanOrEqual(previous);
      previous = index;
      if (point.at) {
        expect(point.at.minutes % 15, `${point.id} の at が15分刻みでない`).toBe(0);
        expect(point.at.minutes).toBeGreaterThanOrEqual(0);
        expect(point.at.minutes).toBeLessThan(24 * 60);
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

  it('全判断ポイントにミスリードの声があり、型は8種以上', () => {
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
    const final = deadlines.find((d) => d.ref === 'ppc-report-final' || d.ref === 'ppc-report-final-malicious');
    expect(prelim, 'ppc-report-prelim の期限がない').toBeTruthy();
    expect(final, '確報（ppc-report-final または -malicious）の期限がない').toBeTruthy();
    const choices = role.points.flatMap((p) => p.choices);
    for (const deadline of deadlines) {
      const setBy = choices.filter((c) => deadline && c.setFlags?.[deadline.doneFlag]);
      expect(setBy.length, `${deadline.id} の doneFlag を立てる選択肢がない`).toBeGreaterThanOrEqual(1);
    }
  });

  it('文案作成が3種類あり、スロットは items か options の片方だけを持つ', () => {
    const drafts = Object.values(role.drafts ?? {});
    expect(drafts.length).toBeGreaterThanOrEqual(3);
    for (const draft of drafts) {
      expect(draft.slots.length).toBeGreaterThan(0);
      for (const slot of draft.slots) {
        const hasItems = Array.isArray(slot.items);
        const hasOptions = Array.isArray(slot.options);
        expect(hasItems !== hasOptions, `${slot.id} は items と options のどちらか一方`).toBe(true);
      }
    }
  });

  it('会見の最良回答に必要な記録が、役員ロールの判断でも取れる', () => {
    const notes = new Set(role.points.flatMap((p) => (p.notable ?? []).map((n) => n.id)));
    const required = new Set(
      (scenario.press?.questions ?? []).flatMap((q) =>
        q.answers.map((a) => a.requiresNote).filter((id): id is string => typeof id === 'string'),
      ),
    );
    for (const id of required) expect(notes.has(id), `記録 ${id} が取れない`).toBe(true);
  });

  it('S と D の両方に到達できる', () => {
    expect(play('max').rank).toBe('S');
    expect(play('min').rank).toBe('D');
    expect(play('max').official).toBeGreaterThanOrEqual(1200);
    expect(play('min').official).toBeLessThan(0);
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
