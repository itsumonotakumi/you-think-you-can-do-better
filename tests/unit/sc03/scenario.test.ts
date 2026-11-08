// No.3 やまびこ商店 / 経営者ロールのデータ検査。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no03-yamabiko/scenario.yaml?raw';
import roleYaml from '../../../scenarios/no03-yamabiko/roles/executive.yaml?raw';
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
const scenario: Scenario = { ...base, roles: { executive: role } };
const refs = parse(referencesYaml) as unknown as Reference[];

const refIds = new Set([...referencesYaml.matchAll(/^\s*- id: (\S+)/gm)].map((m) => m[1] as string));

const choiceItems = role.points.flatMap((p) => p.choices.flatMap((c) => c.items ?? []));
const draftItems = Object.values(role.drafts ?? {}).flatMap((d: Draft) =>
  d.slots.flatMap((s) => [...(s.items ?? []), ...(s.options ?? [])]),
);
const detailItems: DetailItem[] = [...choiceItems, ...draftItems];
const voicesById = new Map(role.voices.map((v) => [v.id, v]));

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
    'executive',
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

describe('scenario no03-yamabiko', () => {
  it('メタ情報が契約どおり', () => {
    expect(scenario.id).toBe('no03-yamabiko');
    expect(scenario.languages).toEqual(['ja']);
    expect(scenario.difficulty).toBe(2);
    expect(scenario.start.minutes % 15).toBe(0);
    expect(role.pressEnabled).toBe(true);
    expect(role.estimateMinutes % 15).toBe(0);
    for (const rank of ['S', 'A', 'B', 'C', 'D'] as const) {
      expect(scenario.endings[rank].bgm).toBe(`ending_${rank.toLowerCase()}`);
    }
  });

  it('判断ポイントは15〜18、選択肢と細目の形式が正しい', () => {
    expect(role.points.length).toBeGreaterThanOrEqual(15);
    expect(role.points.length).toBeLessThanOrEqual(18);
    const pointIds = new Set<string>();
    for (const point of role.points) {
      expect(pointIds.has(point.id), `判断ポイントIDの重複: ${point.id}`).toBe(false);
      pointIds.add(point.id);
      expect((PHASES as readonly string[]).includes(point.phase), `${point.id} の phase`).toBe(true);
      expect(point.choices.length).toBeGreaterThanOrEqual(2);
      if (point.at) expect(point.at.minutes % 15).toBe(0);
      for (const choice of point.choices) expectChoice(choice);
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
    const choiceById = new Map(role.points.flatMap((p) => p.choices.map((c) => [c.id, c] as const)));
    const after = role.voices.filter((v) => 'at' in v.trigger && v.trigger.at === 'after');
    const criticisesGoodChoice = after.some((v: Voice) => {
      const trigger = v.trigger;
      if (!('at' in trigger) || trigger.at !== 'after' || !trigger.choice) return false;
      const c = choiceById.get(trigger.choice);
      return !!c && c.points > 0;
    });
    expect(criticisesGoodChoice).toBe(true);
  });

  it('deadline は速報の根拠を使い、選択で done になる', () => {
    const deadlines = role.deadlines ?? [];
    const prelim = deadlines.find((d) => d.ref === 'ppc-report-prelim');
    expect(prelim, 'ppc-report-prelim の期限がない').toBeTruthy();
    const setBy = role.points.flatMap((p) => p.choices).filter((c) => prelim && c.setFlags?.[prelim.doneFlag]);
    expect(setBy.length, 'doneFlag を立てる選択肢がない').toBeGreaterThanOrEqual(1);
  });

  it('記者会見は3〜5問で、記録が必要な回答が1つ以上ある', () => {
    const press = scenario.press;
    expect(press).toBeTruthy();
    expect(press?.questions.length).toBeGreaterThanOrEqual(3);
    expect(press?.questions.length).toBeLessThanOrEqual(5);
    for (const q of press?.questions ?? []) {
      expect(q.answers.length).toBeGreaterThanOrEqual(2);
      expect(q.text.ja.length).toBeGreaterThan(0);
    }
    const needsNote = (press?.questions ?? []).some((q) => q.answers.some((a) => !!a.requiresNote));
    expect(needsNote).toBe(true);
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
