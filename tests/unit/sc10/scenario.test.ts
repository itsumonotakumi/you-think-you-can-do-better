// No.10 ネクサス半導体 / 経営者ロールのデータ検査。
// 検査ツール（tools/validate）とは別に、担当シナリオの約束をここで固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no10-nexus/scenario.yaml?raw';
import roleYaml from '../../../scenarios/no10-nexus/roles/executive.yaml?raw';
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
  answerPress,
  availableAnswers,
  choose,
  computeResult,
  currentPoint,
  startPlay,
  startPress,
  submitDraft,
} from '../../../src/engine';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const role = parse(roleYaml) as unknown as RoleScript;
const scenario: Scenario = { ...base, roles: { executive: role } };
const refs = parse(referencesYaml) as unknown as Reference[];

// references.yaml は共有ファイル。id は本文の照合にだけ使う。
const refIds = new Set(
  [...referencesYaml.matchAll(/^\s*- id: (\S+)/gm)].map((m) => m[1] as string),
);

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
  const where = `${choice.id}`;
  expect(choice.minutes).toBeGreaterThan(0);
  expect(choice.minutes % 15, `${where} の minutes が15の倍数でない`).toBe(0);
  const [min, max] = CATEGORY_RANGE[choice.category];
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeGreaterThanOrEqual(min);
  expect(choice.points, `${where} の点数が区分 ${choice.category} の範囲外`).toBeLessThanOrEqual(max);
  expectRefs(choice.refs, where);
  if (choice.category === 'fatal') expect(choice.points).toBeLessThanOrEqual(-200);
}

describe('scenario no10-nexus', () => {
  it('メタ情報が契約どおり', () => {
    expect(scenario.id).toBe('no10-nexus');
    expect(scenario.languages).toEqual(['ja']);
    expect(scenario.difficulty).toBe(3);
    expect(scenario.start.minutes % 15).toBe(0);
    expect(scenario.roles.executive).toBe(role);
    expect(role.pressEnabled).toBe(true);
    for (const rank of ['S', 'A', 'B', 'C', 'D'] as const) {
      expect(scenario.endings[rank].bgm).toBe(`ending_${rank.toLowerCase()}`);
    }
  });

  it('シナリオ固有の根拠が references の末尾に追記されている', () => {
    for (const id of ['no10-ai-guideline', 'no10-ipa-genai', 'no10-ppc-genai']) {
      expect(refIds.has(id), `根拠 ${id} がない`).toBe(true);
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

  it('記者会見の準備に文案作成を置き、細目が十分にある', () => {
    const drafts = Object.values(role.drafts ?? {});
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...drafts.map((d) => d.slots.length))).toBeGreaterThanOrEqual(10);
    expect(draftItems.length).toBeGreaterThanOrEqual(30);
    const pressPoints = (scenario.press?.questions ?? []).flatMap((q) => q.answers.map((a) => a.points));
    expect(Math.max(...pressPoints)).toBeGreaterThanOrEqual(60);
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
    expect(after.length).toBeGreaterThanOrEqual(1);
    const criticisesGoodChoice = after.some((v: Voice) => {
      const trigger = v.trigger;
      if (!('at' in trigger) || trigger.at !== 'after' || !trigger.choice) return false;
      const c = choiceById.get(trigger.choice);
      return !!c && c.points > 0 && (c.category === 'maintain' || c.category === 'recover' || c.category === 'increase');
    });
    expect(criticisesGoodChoice).toBe(true);
  });

  it('deadline は速報と確報の根拠を使い、選択で done になる', () => {
    const deadlines = role.deadlines ?? [];
    const prelim = deadlines.find((d) => d.ref === 'ppc-report-prelim');
    const final = deadlines.find((d) => d.ref === 'ppc-report-final-malicious');
    expect(prelim, 'ppc-report-prelim の期限がない').toBeTruthy();
    expect(final, '確報の期限がない').toBeTruthy();
    for (const deadline of [prelim, final]) {
      const setBy = role.points
        .flatMap((p) => p.choices)
        .filter((c) => deadline && c.setFlags?.[deadline.doneFlag]);
      expect(setBy.length, `${deadline?.id} の doneFlag を立てる選択肢がない`).toBeGreaterThanOrEqual(1);
    }
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
    const blob = JSON.stringify(scenario);
    for (const list of [deny.companies, deny.services, deny.people, deny.countries]) {
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word} が含まれる`).toBe(false);
    }
  });

  it('エンジンで最後まで進み、最高点の経路はS、最低点の経路はDになる', () => {
    const play = (pickMax: boolean) => {
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
      let guard = 0;
      while (next !== 'ending' && guard < 100) {
        guard += 1;
        if (next === 'point') {
          const point = currentPoint(state, scenario);
          if (!point) throw new Error('point がない');
          const ordered = [...point.choices].sort((a, b) => (pickMax ? b.points - a.points : a.points - b.points));
          step = choose(state, scenario, (ordered[0] as Choice).id);
        } else if (next === 'draft') {
          const draft = role.drafts?.[state.pendingDraft ?? ''];
          if (!draft) throw new Error('draft がない');
          const selections: Record<string, string> = {};
          for (const slot of draft.slots) {
            if (slot.auto) continue;
            const candidates = [...(slot.options ?? slot.items ?? [])].sort((a, b) =>
              pickMax ? b.points - a.points : a.points - b.points,
            );
            if (candidates[0]) selections[slot.id] = candidates[0].id;
          }
          step = submitDraft(state, scenario, selections);
        } else if (next === 'press') {
          step = startPress(state, scenario);
          if (step.next === 'ending') {
            state = step.state;
            next = step.next;
            continue;
          }
          while (step.next === 'press') {
            const answers = [...availableAnswers(step.state, scenario)].sort((a, b) =>
              pickMax ? b.points - a.points : a.points - b.points,
            );
            step = answerPress(step.state, scenario, answers[0]?.id ?? null);
          }
        } else {
          throw new Error(`未知の遷移 ${String(next)}`);
        }
        state = step.state;
        next = step.next;
      }
      expect(next, 'エンディングに着く').toBe('ending');
      return computeResult(state, scenario);
    };

    const best = play(true);
    expect(best.rank).toBe('S');
    expect(best.fatal).toBe(false);
    expect(best.official).toBeGreaterThanOrEqual(1200);

    const worst = play(false);
    expect(worst.rank).toBe('D');
    expect(worst.official).toBeLessThan(0);
  });
});
