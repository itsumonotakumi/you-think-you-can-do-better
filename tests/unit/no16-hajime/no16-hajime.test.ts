// No.16 こもれびカルチャー（入門編）/ 4ロールのデータ検査と経路のテスト。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no16-hajime/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no16-hajime/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no16-hajime/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no16-hajime/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no16-hajime/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import {
  availableAnswers,
  answerPress,
  choose,
  computeResult,
  currentPoint,
  startPlay,
  startPress,
  submitDraft,
} from '../../../src/engine/index';
import { CATEGORY_RANGE, MISLEADING_TYPES, PHASES, ROLES } from '../../../src/engine/types';
import type {
  Choice,
  DetailItem,
  Localized,
  Reference,
  RoleId,
  RoleScript,
  Scenario,
  Voice,
} from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const scripts: Record<RoleId, RoleScript> = {
  executive: parse(executiveYaml) as RoleScript,
  officer: parse(officerYaml) as RoleScript,
  lead: parse(leadYaml) as RoleScript,
  analyst: parse(analystYaml) as RoleScript,
};
const scenario: Scenario = { ...base, roles: scripts };
const refs = parse(referencesYaml) as Reference[];
const refIds = new Set(refs.map((ref) => ref.id));

const pointers: { role: RoleId; script: RoleScript }[] = ROLES.map((role) => ({
  role,
  script: scripts[role],
}));

function collectLocalized(node: unknown, out: Localized[] = []): Localized[] {
  if (Array.isArray(node)) {
    for (const value of node) collectLocalized(value, out);
    return out;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.ja === 'string' && typeof obj.en === 'string') {
      out.push(obj as unknown as Localized);
      return out;
    }
    for (const value of Object.values(obj)) collectLocalized(value, out);
  }
  return out;
}

function draftItems(script: RoleScript): DetailItem[] {
  return Object.values(script.drafts ?? {}).flatMap((draft) =>
    draft.slots.flatMap((slot) => [...(slot.items ?? []), ...(slot.options ?? [])]),
  );
}

function expectRefs(items: string[], where: string): void {
  expect(items.length, `${where} の refs が空`).toBeGreaterThan(0);
  for (const ref of items) expect(refIds.has(ref), `${where} の根拠 ${ref} が references にない`).toBe(true);
}

function expectChoice(choice: Choice): void {
  expect(choice.minutes % 15, `${choice.id} の minutes`).toBe(0);
  const [min, max] = CATEGORY_RANGE[choice.category];
  expect(choice.points, `${choice.id} の点数の区分`).toBeGreaterThanOrEqual(min);
  expect(choice.points, `${choice.id} の点数の区分`).toBeLessThanOrEqual(max);
  expectRefs(choice.refs, choice.id);
  expect(choice.explain?.ja.length, `${choice.id} の explain`).toBeGreaterThanOrEqual(40);
  expect(choice.explain?.ja.length, `${choice.id} の explain`).toBeLessThanOrEqual(120);
}

type Picker = (points: number[]) => number;

function play(role: RoleId, pick: Picker): { rank: string; fatal: boolean; raw: number; steps: number } {
  const script = scripts[role];
  const started = startPlay(
    scenario,
    role,
    1,
    { comment: '', predictedHours: null },
    '2026-11-13T00:00:00.000Z',
    refs,
  );
  let state = started.state;
  let next = started.next;
  let guard = 0;
  while (next !== 'ending' && guard < 200) {
    guard += 1;
    if (next === 'point') {
      const point = currentPoint(state, scenario);
      if (!point) throw new Error('判断ポイントがない');
      const choice = point.choices[pick(point.choices.map((c) => c.points))];
      if (!choice) throw new Error('選択肢がない');
      const step = choose(state, scenario, choice.id);
      state = step.state;
      next = step.next;
    } else if (next === 'draft') {
      const draft = state.pendingDraft ? script.drafts?.[state.pendingDraft] : undefined;
      if (!draft) throw new Error('文案がない');
      const selections: Record<string, string> = {};
      for (const slot of draft.slots) {
        if (slot.auto) continue;
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
  return { rank: result.rank, fatal: result.fatal, raw: result.raw, steps: state.history.length };
}

const best: Picker = (points) => points.indexOf(Math.max(...points));
const worst: Picker = (points) => points.indexOf(Math.min(...points));
const middle: Picker = (points) =>
  points.reduce((acc, point, index) => (Math.abs(point - 20) < Math.abs((points[acc] ?? 0) - 20) ? index : acc), 0);

describe('no16-hajime のシナリオ', () => {
  it('入門編のメタ情報', () => {
    expect(scenario.id).toBe('no16-hajime');
    expect(scenario.difficulty).toBe(1);
    expect(scenario.languages).toEqual(['ja']);
    expect(scenario.sourcePeriod.ja).toBe('2020年代');
    expect(Object.keys(scenario.endings)).toEqual(['S', 'A', 'B', 'C', 'D']);
    expect(scenario.press?.questions.length).toBeGreaterThanOrEqual(2);
    expect(scenario.press?.questions.length).toBeLessThanOrEqual(4);
  });

  it('全ロールに判断15（通常の経路は8）、報告書1、解説がある', () => {
    for (const { role, script } of pointers) {
      expect(script.points.length, role).toBe(15);
      // 誤った選択をした時だけ現れる分岐判断がある
      expect(script.points.filter((point) => point.when?.flags).length, role).toBe(7);
      expect(Object.keys(script.drafts ?? {}).length, role).toBe(1);
      for (const point of script.points) {
        expect((PHASES as readonly string[]).includes(point.phase), point.id).toBe(true);
        expect(point.choices.length, point.id).toBeGreaterThanOrEqual(2);
        expect(point.lesson?.ja.length, `${point.id} の lesson`).toBeGreaterThanOrEqual(80);
        expect(point.lesson?.ja.length, `${point.id} の lesson`).toBeLessThanOrEqual(200);
        for (const choice of point.choices) expectChoice(choice);
      }
    }
  });

  it('判断ポイントは時刻順に並ぶ', () => {
    for (const { role, script } of pointers) {
      let previous = -1;
      for (const point of script.points) {
        const current = (point.at?.day ?? 0) * 1440 + (point.at?.minutes ?? 0);
        expect(current, `${role}/${point.id}`).toBeGreaterThan(previous);
        previous = current;
      }
    }
  });

  it('細目はロールごとに80以上、点数は±1〜20、IDは一意', () => {
    for (const { role, script } of pointers) {
      const items = [...script.points.flatMap((p) => p.choices.flatMap((c) => c.items ?? [])), ...draftItems(script)];
      expect(items.length, role).toBeGreaterThanOrEqual(80);
      const ids = new Set<string>();
      for (const item of items) {
        expect(ids.has(item.id), `${role}: 細目IDの重複 ${item.id}`).toBe(false);
        ids.add(item.id);
        expect(Math.abs(item.points), item.id).toBeGreaterThanOrEqual(1);
        expect(Math.abs(item.points), item.id).toBeLessThanOrEqual(20);
        expect(['time', 'order', 'wording', 'content', 'record', 'care']).toContain(item.axis);
        expectRefs(item.refs, item.id);
      }
    }
  });

  it('選択肢の長さがそろい、最高点の位置が偏らない', () => {
    for (const { role, script } of pointers) {
      const groups = [
        ...script.points.map((point) => ({ id: point.id, items: point.choices })),
        ...Object.values(script.drafts ?? {}).flatMap((draft) =>
          draft.slots.filter((slot) => (slot.options?.length ?? 0) >= 2).map((slot) => ({
            id: slot.id,
            items: slot.options ?? [],
          })),
        ),
      ];
      const positions: number[] = [];
      for (const group of groups) {
        const lengths = group.items.map((item) => item.text.ja.length);
        expect(Math.max(...lengths) / Math.min(...lengths), `${role}/${group.id} の長さ`).toBeLessThanOrEqual(1.3);
        let top = 0;
        group.items.forEach((item, index) => {
          if (item.points > group.items[top]!.points) top = index;
        });
        positions.push(top + 1);
      }
      const topCount = Math.max(...[1, 2, 3].map((pos) => positions.filter((p) => p === pos).length));
      expect(topCount / positions.length, `${role} の最高点の位置`).toBeLessThan(0.5);
    }
  });

  it('ミスリードは判断の半数以上、型はシナリオ全体で8種以上', () => {
    const types = new Set<string>();
    for (const { role, script } of pointers) {
      const byId = new Map(script.voices.map((voice) => [voice.id, voice]));
      let covered = 0;
      for (const point of script.points) {
        let has = false;
        for (const id of point.voices ?? []) {
          const voice = byId.get(id);
          expect(voice, `${role}: 声 ${id}`).toBeTruthy();
          if (voice?.misleading) {
            has = true;
            expect(voice.type, `${role}: ${id} の type`).toBeTruthy();
            expect((MISLEADING_TYPES as readonly string[]).includes(voice.type as string)).toBe(true);
            types.add(voice.type as string);
          }
        }
        if (has) covered += 1;
      }
      expect(covered * 2, `${role} のミスリード数`).toBeGreaterThanOrEqual(script.points.length);
    }
    expect(types.size).toBeGreaterThanOrEqual(8);
  });

  it('臆病な選択肢と臆病ゲージの声、正しい選択の直後の批判がある', () => {
    for (const { role, script } of pointers) {
      expect(script.points.flatMap((p) => p.choices).filter((c) => c.coward).length, role).toBeGreaterThanOrEqual(1);
      const voiceIds = new Set(script.voices.map((voice) => voice.id));
      for (const key of ['2', '3', '4'] as const) {
        const id = script.cowardVoices[key];
        expect(voiceIds.has(id), `${role}: cowardVoices.${key}`).toBe(true);
        expect(script.voices.find((voice) => voice.id === id)?.trigger).toEqual({ at: 'manual' });
      }
      const after = script.voices.filter(
        (voice) => 'at' in voice.trigger && voice.trigger.at === 'after' && voice.trigger.choice,
      );
      const positive = script.points
        .flatMap((p) => p.choices)
        .filter((choice) => choice.points > 0)
        .map((choice) => choice.id);
      expect(
        after.some((voice) => {
          const trigger = voice.trigger as { at: 'after'; choice?: string };
          return trigger.choice !== undefined && positive.includes(trigger.choice);
        }),
        `${role}: 正しい選択の直後の批判`,
      ).toBe(true);
    }
  });

  it('記者会見の嘘の回答は条件で出し分ける', () => {
    const report = scenario.press?.questions.find((question) => question.id === 'q-report');
    expect(report).toBeTruthy();
    const filed = report?.answers.find((answer) => answer.id === 'a-report-filed');
    const claim = report?.answers.find((answer) => answer.id === 'a-report-claim');
    expect(filed?.when?.flags?.reportFiled).toBe(true);
    expect(claim?.when?.flags?.reportFiled).toBe(false);
    expect(claim?.points).toBeLessThan(0);
  });

  it('法定期限を持つ場合は根拠の deadlineHours を使う', () => {
    for (const { script } of pointers) {
      for (const deadline of script.deadlines ?? []) {
        expect(refIds.has(deadline.ref)).toBe(true);
        expect(refs.find((ref) => ref.id === deadline.ref)?.deadlineHours).toBeGreaterThan(0);
      }
    }
  });

  it('文言は日本語のみで、HTMLを含まない', () => {
    const localized = collectLocalized(scenario);
    expect(localized.length).toBeGreaterThan(80);
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
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word}`).toBe(false);
    }
  });
});

describe('no16-hajime の経路', () => {
  for (const role of ROLES) {
    it(`${role}: 最善で S、中くらいで A〜C、最悪で D に届く`, () => {
      const bestRun = play(role, best);
      expect(bestRun.fatal, `${role} 最善`).toBe(false);
      expect(bestRun.rank, `${role} 最善`).toBe('S');
      // 最善の経路では分岐判断は現れず、入門編の8判断で終わる
      expect(bestRun.steps, `${role} 最善の判断数`).toBe(8);

      const middleRun = play(role, middle);
      expect(['A', 'B', 'C'], `${role} 中間`).toContain(middleRun.rank);

      const worstRun = play(role, worst);
      expect(worstRun.rank, `${role} 最悪`).toBe('D');
    });
  }
});

// 型の使用を明示（未使用変数の検査を避ける）
void (scripts as Record<RoleId, RoleScript>);
