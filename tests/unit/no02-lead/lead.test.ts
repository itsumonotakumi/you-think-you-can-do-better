// No.2 ペイブリッジ / セキュリティ部門長（CSIRTリーダー）ロールのデータ検査。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no02-paybridge/scenario.yaml?raw';
import roleYaml from '../../../scenarios/no02-paybridge/roles/lead.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import {
  availableAnswers,
  choose,
  computeResult,
  currentPoint,
  startPlay,
  startPress,
  submitDraft,
  answerPress,
} from '../../../src/engine/index';
import { CATEGORY_RANGE, MISLEADING_TYPES, PHASES } from '../../../src/engine/types';
import type { Reference } from '../../../src/engine/types';
import type {
  Choice,
  DetailItem,
  Draft,
  Localized,
  RoleScript,
  Scenario,
  Voice,
} from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const role = parse(roleYaml) as unknown as RoleScript;
const scenario: Scenario = { ...base, roles: { lead: role } };

// references.yaml は共有ファイルなので、id だけを拾う。
const refIds = new Set(
  [...referencesYaml.matchAll(/^\s*- id: "?([^"\s]+)"?/gm)].map((m) => m[1] as string),
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
}

function play(pick: (points: number[]) => number): { rank: string; fatal: boolean; raw: number } {
  const refs = parse(referencesYaml) as Reference[];
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
  while (next !== 'ending' && guard < 300) {
    guard += 1;
    if (next === 'point') {
      const point = currentPoint(state, scenario);
      if (!point) throw new Error('判断ポイントがない');
      const target = pick(point.choices.map((c) => c.points));
      const choice = point.choices[target];
      if (!choice) throw new Error('選択肢がない');
      const step = choose(state, scenario, choice.id);
      state = step.state;
      next = step.next;
    } else if (next === 'draft') {
      const draft = state.pendingDraft ? role.drafts?.[state.pendingDraft] : undefined;
      if (!draft) throw new Error('文案がない');
      const selections: Record<string, string> = {};
      for (const slot of draft.slots) {
        const options = slot.options ?? slot.items ?? [];
        if (options.length === 0) continue;
        selections[slot.id] = options[pick(options.map((o) => o.points))]?.id ?? options[0]!.id;
      }
      const step = submitDraft(state, scenario, selections);
      state = step.state;
      next = step.next;
    } else if (next === 'press') {
      const opened = startPress(state, scenario);
      state = opened.state;
      next = opened.next;
      while (next === 'press') {
        const answers = availableAnswers(state, scenario);
        const answer = answers[pick(answers.map((a) => a.points))];
        const step = answerPress(state, scenario, answer?.id ?? null);
        state = step.state;
        next = step.next;
      }
    } else {
      throw new Error(`未知の遷移: ${String(next)}`);
    }
  }
  const result = computeResult(state, scenario);
  return { rank: result.rank, fatal: result.fatal, raw: result.raw };
}

describe('到達できるランク', () => {
  it('最善を選ぶと致命的な失点なしで S に届く', () => {
    const run = play((points) => points.indexOf(Math.max(...points)));
    expect(run.fatal).toBe(false);
    expect(run.rank).toBe('S');
  });

  it('中くらいの選択を重ねると A〜C に届く', () => {
    const run = play((points) => {
      const middle = 30;
      return points.reduce((best, p, i) => (Math.abs(p - middle) < Math.abs((points[best] ?? 0) - middle) ? i : best), 0);
    });
    expect(['A', 'B', 'C']).toContain(run.rank);
  });

  it('最悪を選ぶと D に届く', () => {
    const run = play((points) => points.indexOf(Math.min(...points)));
    expect(run.rank).toBe('D');
  });
});

describe('scenario no02-paybridge / lead', () => {
  it('ロールのメタ情報が契約どおり', () => {
    expect(scenario.languages).toEqual(['ja']);
    expect(role.estimateMinutes).toBeGreaterThan(30);
    expect(role.pressEnabled).toBe(true);
    expect(role.intro.ja.length).toBeGreaterThan(20);
    expect(role.intro.en).toBe('');
  });

  it('判断ポイントは15〜25、選択肢の形式が正しい', () => {
    expect(role.points.length).toBeGreaterThanOrEqual(15);
    expect(role.points.length).toBeLessThanOrEqual(25);
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

  it('判断ポイントは時刻順に並ぶ', () => {
    let prev = -1;
    for (const point of role.points) {
      if (!point.at) continue;
      const cur = point.at.day * 1440 + point.at.minutes;
      expect(cur, `${point.id} の時刻`).toBeGreaterThan(prev);
      prev = cur;
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
    expect(after.length).toBeGreaterThanOrEqual(1);
    const criticisesGoodChoice = after.some((v: Voice) => {
      const trigger = v.trigger;
      if (!('at' in trigger) || trigger.at !== 'after') return false;
      const choiceId = trigger.choice;
      if (!choiceId) return false;
      const c = choiceById.get(choiceId);
      return !!c && c.points > 0;
    });
    expect(criticisesGoodChoice).toBe(true);
    for (const v of after) {
      const trigger = v.trigger;
      if ('at' in trigger && trigger.at === 'after' && trigger.choice) {
        expect(choiceById.has(trigger.choice), `${v.id} の choice が見つからない`).toBe(true);
      }
    }
  });

  it('法定期限は根拠を使い、選択で done になる', () => {
    const deadlines = role.deadlines ?? [];
    expect(deadlines.length).toBeGreaterThanOrEqual(2);
    for (const d of deadlines) {
      expect(refIds.has(d.ref), `${d.id} の根拠 ${d.ref}`).toBe(true);
      const setBy = role.points.flatMap((p) => p.choices).filter((c) => c.setFlags?.[d.doneFlag]);
      expect(setBy.length, `${d.id} の doneFlag ${d.doneFlag} を立てる選択肢がない`).toBeGreaterThanOrEqual(1);
    }
    for (const key of ['hours', 'hour', 'deadlineHours']) {
      for (const d of deadlines) expect(Object.prototype.hasOwnProperty.call(d, key)).toBe(false);
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

  it('文言は日本語のみで、HTMLを含まない', () => {
    const localized = collectLocalized(role);
    expect(localized.length).toBeGreaterThan(50);
    for (const text of localized) {
      expect(text.ja.length, 'ja が空').toBeGreaterThan(0);
      expect(text.en, 'v1 は英語本文を持たない').toBe('');
      expect(text.ja).not.toMatch(/<[^>]+>|\{@html\}/);
      expect(text.ja).not.toMatch(/[,:]/);
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
