// No.13 ツムギ・アナリティクス / 4ロール共通のデータ検査と経路の確認。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no13-tsumugi/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no13-tsumugi/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no13-tsumugi/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no13-tsumugi/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no13-tsumugi/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import {
  addNote,
  answerPress,
  availableAnswers,
  choose,
  computeResult,
  currentPoint,
  startPlay,
  startPress,
  submitDraft,
} from '../../../src/engine/index';
import { CATEGORY_RANGE, MISLEADING_TYPES, PHASES } from '../../../src/engine/types';
import type {
  Choice,
  DetailItem,
  Draft,
  Localized,
  PlayState,
  Rank,
  Reference,
  RoleId,
  RoleScript,
  Scenario,
} from '../../../src/engine/types';

const roleTexts: Record<RoleId, string> = {
  executive: executiveYaml,
  officer: officerYaml,
  lead: leadYaml,
  analyst: analystYaml,
};
const roles = Object.fromEntries(
  (Object.keys(roleTexts) as RoleId[]).map((role) => [role, parse(roleTexts[role]) as RoleScript]),
) as Record<RoleId, RoleScript>;
const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const scenario: Scenario = { ...base, roles };
const references = parse(referencesYaml) as Reference[];
const referencesById = new Map(references.map((ref) => [ref.id, ref]));
const refIds = new Set([...referencesYaml.matchAll(/^\s*- id: "?([^"\s]+)"?/gm)].map((m) => m[1] as string));

const roleIds = Object.keys(roles) as RoleId[];

function allChoices(script: RoleScript): Choice[] {
  return script.points.flatMap((point) => point.choices);
}

function draftItems(script: RoleScript): DetailItem[] {
  return Object.values(script.drafts ?? {}).flatMap((draft: Draft) =>
    draft.slots.flatMap((slot) => [...(slot.items ?? []), ...(slot.options ?? [])]),
  );
}

function allItems(script: RoleScript): DetailItem[] {
  return [...allChoices(script).flatMap((choice) => choice.items ?? []), ...draftItems(script)];
}

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

function expectRefs(refs: string[], where: string): void {
  expect(refs.length, `${where} の refs が空`).toBeGreaterThan(0);
  for (const ref of refs) expect(refIds.has(ref), `${where} の根拠 ${ref} が references にない`).toBe(true);
}

function jaLength(text: Localized | undefined): number {
  return text?.ja.length ?? 0;
}

/** 最善・中庸・最悪の点数を選ぶ走行。会見では同じ方針で回答する。 */
function play(role: RoleId, policy: 'max' | 'mid' | 'min'): { rank: Rank; fatal: boolean; state: PlayState } {
  const pickIndex = (points: number[]): number => {
    if (policy === 'max') return points.indexOf(Math.max(...points));
    if (policy === 'min') return points.indexOf(Math.min(...points));
    const middle = 20;
    return points.reduce(
      (best, value, index) =>
        Math.abs(value - middle) < Math.abs((points[best] ?? 0) - middle) ? index : best,
      0,
    );
  };

  let step = startPlay(
    scenario,
    role,
    1,
    { comment: '', predictedHours: null },
    '2026-11-13T00:00:00.000Z',
    references,
  );
  let state = step.state;
  let next = step.next;
  let guard = 0;
  while (next !== 'ending' && guard < 400) {
    guard += 1;
    if (next === 'point') {
      const point = currentPoint(state, scenario);
      if (!point) throw new Error('判断ポイントがない');
      for (const note of point.notable ?? []) {
        if (!state.notes.some((item) => item.id === note.id)) {
          state = addNote(state, { id: note.id, text: note.text, at: state.clock });
        }
      }
      const choice = point.choices[pickIndex(point.choices.map((item) => item.points))];
      if (!choice) throw new Error('選択肢がない');
      step = choose(state, scenario, choice.id);
      state = step.state;
      next = step.next;
    } else if (next === 'draft') {
      const draft = state.pendingDraft ? roles[role].drafts?.[state.pendingDraft] : undefined;
      if (!draft) throw new Error('文案がない');
      const selections: Record<string, string> = {};
      for (const slot of draft.slots) {
        if (slot.auto) continue;
        const options = slot.options ?? slot.items ?? [];
        if (options.length === 0) continue;
        selections[slot.id] = options[pickIndex(options.map((option) => option.points))]?.id ?? options[0]!.id;
      }
      step = submitDraft(state, scenario, selections);
      state = step.state;
      next = step.next;
    } else if (next === 'press') {
      step = startPress(state, scenario);
      state = step.state;
      next = step.next;
      while (next === 'press') {
        const answers = availableAnswers(state, scenario);
        const answer = answers[pickIndex(answers.map((item) => item.points))];
        step = answerPress(state, scenario, answer?.id ?? null);
        state = step.state;
        next = step.next;
      }
    } else {
      throw new Error(`未知の遷移: ${String(next)}`);
    }
  }
  const result = computeResult(state, scenario);
  return { rank: result.rank, fatal: result.fatal, state };
}

describe('no13-tsumugi / シナリオの前提', () => {
  it('id・版・言語・出典の書き方が契約どおり', () => {
    expect(scenario.id).toBe('no13-tsumugi');
    expect(scenario.version).toBe('1.0.0');
    expect(scenario.languages).toEqual(['ja']);
    expect(scenario.difficulty).toBeGreaterThanOrEqual(3);
    expect(scenario.sourcePeriod.ja).toContain('フィクション');
    expect(scenario.sourcePeriod.ja).not.toMatch(/\d{4}年(?!代)/);
    expect(scenario.title.ja.length).toBeGreaterThan(0);
    expect(scenario.tagline.ja.length).toBeGreaterThan(20);
  });

  it('4ロールがそろい、見積もりと導入文がある', () => {
    expect(roleIds.sort()).toEqual(['analyst', 'executive', 'lead', 'officer']);
    for (const role of roleIds) {
      const script = roles[role];
      expect(script.estimateMinutes).toBeGreaterThan(20);
      expect(script.estimateMinutes).toBeLessThanOrEqual(45);
      expect(script.intro.ja.length).toBeGreaterThan(40);
      expect(script.pressEnabled).toBe(true);
    }
  });

  it('会社と人物は架空で、実在社名を避けている', () => {
    expect(scenario.company.name.ja).toContain('ツムギ');
    expect(scenario.company.people.length).toBeGreaterThanOrEqual(4);
    const deny = parse(denylistYaml) as Record<string, string[]>;
    const blob = JSON.stringify(scenario);
    for (const list of [deny.companies, deny.services, deny.people, deny.countries]) {
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word} が含まれる`).toBe(false);
    }
  });

  it('エンディングと見出しが5段階そろっている', () => {
    for (const rank of ['S', 'A', 'B', 'C', 'D'] as Rank[]) {
      expect(scenario.endings[rank].text.ja.length).toBeGreaterThan(80);
      expect(scenario.headlines?.[rank]?.ja.length).toBeGreaterThan(0);
    }
  });
});

describe('no13-tsumugi / 判断ポイントと選択肢', () => {
  for (const role of roleIds) {
    it(`${role}: 判断ポイントは15〜16、時刻順で、選択肢の形がそろう`, () => {
      const script = roles[role];
      expect(script.points.length).toBeGreaterThanOrEqual(15);
      expect(script.points.length).toBeLessThanOrEqual(16);
      const ids = new Set<string>();
      let previous = -1;
      for (const point of script.points) {
        expect(ids.has(point.id), `判断IDの重複: ${point.id}`).toBe(false);
        ids.add(point.id);
        expect((PHASES as readonly string[]).includes(point.phase), `${point.id} の phase`).toBe(true);
        expect(point.choices.length).toBe(3);
        if (point.at) {
          expect(point.at.minutes % 15).toBe(0);
          const current = point.at.day * 1440 + point.at.minutes;
          expect(current, `${point.id} の時刻`).toBeGreaterThan(previous);
          previous = current;
        }
        for (const choice of point.choices) {
          expect(choice.minutes % 15, `${choice.id} の minutes`).toBe(0);
          expect(choice.minutes).toBeGreaterThan(0);
          const [min, max] = CATEGORY_RANGE[choice.category];
          expect(choice.points, `${choice.id} の点数`).toBeGreaterThanOrEqual(min);
          expect(choice.points, `${choice.id} の点数`).toBeLessThanOrEqual(max);
          expectRefs(choice.refs, choice.id);
        }
      }
    });

    it(`${role}: 最高点の選択肢が本文の長さで分からない`, () => {
      for (const point of roles[role].points) {
        const points = point.choices.map((choice) => choice.points);
        const top = points.indexOf(Math.max(...points));
        const ties = points.filter((value) => value === points[top]).length;
        if (ties > 1) continue;
        const topLength = jaLength(point.choices[top]?.text);
        const longestOther = Math.max(
          ...point.choices.filter((_, index) => index !== top).map((choice) => jaLength(choice.text)),
        );
        expect(topLength * 10, `${point.id}: 長さで正解が分かる`).toBeLessThan(longestOther * 13);
      }
    });

    it(`${role}: 選択肢の長さがそろい、解説と教訓の長さが範囲内`, () => {
      for (const point of roles[role].points) {
        const lengths = point.choices.map((choice) => jaLength(choice.text));
        expect(Math.max(...lengths), `${point.id} の長さの比`).toBeLessThanOrEqual(
          Math.floor(Math.min(...lengths) * 1.3),
        );
        const lessonLength = jaLength(point.lesson);
        expect(lessonLength, `${point.id} の lesson`).toBeGreaterThanOrEqual(80);
        expect(lessonLength, `${point.id} の lesson`).toBeLessThanOrEqual(200);
        for (const choice of point.choices) {
          const explainLength = jaLength(choice.explain);
          expect(explainLength, `${choice.id} の explain`).toBeGreaterThanOrEqual(40);
          expect(explainLength, `${choice.id} の explain`).toBeLessThanOrEqual(120);
        }
      }
    });

    it(`${role}: 最高点の選択肢の位置が偏っていない`, () => {
      const counts = new Map<number, number>();
      let total = 0;
      for (const point of roles[role].points) {
        const points = point.choices.map((choice) => choice.points);
        const top = points.indexOf(Math.max(...points));
        if (points.filter((value) => value === points[top]).length > 1) continue;
        total += 1;
        counts.set(top, (counts.get(top) ?? 0) + 1);
      }
      expect(total).toBe(roles[role].points.length);
      for (const count of counts.values()) expect(count).toBeLessThan(total * 0.5);
    });

    it(`${role}: 細目は80以上で、点数と根拠とIDが正しい`, () => {
      const items = allItems(roles[role]);
      expect(items.length).toBeGreaterThanOrEqual(80);
      const ids = new Set<string>();
      for (const item of items) {
        expect(ids.has(item.id), `細目IDの重複: ${item.id}`).toBe(false);
        ids.add(item.id);
        expect(Math.abs(item.points), `${item.id} の点数`).toBeGreaterThanOrEqual(1);
        expect(Math.abs(item.points), `${item.id} の点数`).toBeLessThanOrEqual(20);
        expect(['time', 'order', 'wording', 'content', 'record', 'care']).toContain(item.axis);
        expectRefs(item.refs, item.id);
      }
    });
  }
});

describe('no13-tsumugi / 声と臆病ゲージ', () => {
  for (const role of roleIds) {
    it(`${role}: ミスリードの声が判断の半数以上に付き、型もそろう`, () => {
      const script = roles[role];
      const misleading = new Set(script.voices.filter((voice) => voice.misleading).map((voice) => voice.id));
      let covered = 0;
      for (const point of script.points) {
        if ((point.voices ?? []).some((id) => misleading.has(id))) covered += 1;
      }
      expect(covered * 2).toBeGreaterThanOrEqual(script.points.length);
      for (const voice of script.voices) {
        if (!voice.misleading) continue;
        expect((MISLEADING_TYPES as readonly string[]).includes(voice.type as string)).toBe(true);
      }
    });

    it(`${role}: 臆病な選択肢と、臆病ゲージの声がある`, () => {
      const script = roles[role];
      const cowardChoices = allChoices(script).filter((choice) => choice.coward);
      expect(cowardChoices.length).toBeGreaterThanOrEqual(2);
      for (const key of ['2', '3', '4'] as const) {
        const id = script.cowardVoices[key];
        const voice = script.voices.find((item) => item.id === id);
        expect(voice, `${id} が見つからない`).toBeTruthy();
        expect(voice?.trigger).toEqual({ at: 'manual' });
      }
    });

    it(`${role}: 正しい選択の直後に批判の声があり、choice の参照先が実在する`, () => {
      const script = roles[role];
      const positive = new Set(allChoices(script).filter((choice) => choice.points > 0).map((choice) => choice.id));
      const choiceIds = new Set(allChoices(script).map((choice) => choice.id));
      const after = script.voices.filter((voice) => 'at' in voice.trigger && voice.trigger.at === 'after');
      expect(after.length).toBeGreaterThanOrEqual(3);
      expect(
        after.some((voice) => {
          const trigger = voice.trigger;
          if (!('at' in trigger) || trigger.at !== 'after' || !trigger.choice) return false;
          return positive.has(trigger.choice);
        }),
      ).toBe(true);
      for (const voice of after) {
        const trigger = voice.trigger;
        if ('at' in trigger && trigger.at === 'after' && trigger.choice) {
          expect(choiceIds.has(trigger.choice), `${voice.id} の choice`).toBe(true);
        }
      }
    });

    it(`${role}: 声は日本語で、媒体と形がそろっている`, () => {
      for (const voice of roles[role].voices) {
        expect(voice.text.ja.length).toBeGreaterThan(0);
        expect(voice.text.en).toBe('');
        expect(['sns', 'news', 'board', 'chat', 'boss', 'vendor', 'attacker']).toContain(voice.media);
        if (voice.misleading) expect(voice.type).toBeTruthy();
      }
    });
  }

  it('ミスリードの型はシナリオ全体で8種以上', () => {
    const types = new Set<string>();
    for (const role of roleIds) {
      for (const voice of roles[role].voices) {
        if (voice.misleading && voice.type) types.add(voice.type);
      }
    }
    expect(types.size).toBeGreaterThanOrEqual(8);
  });

  it('臆病批判の声が3段階そろっている', () => {
    for (const role of roleIds) {
      const script = roles[role];
      const texts = ['2', '3', '4'].map((key) => script.voices.find((voice) => voice.id === script.cowardVoices[key as '2']));
      for (const voice of texts) expect(voice?.text.ja.length ?? 0).toBeGreaterThan(0);
      expect(script.voices.filter((voice) => voice.id.startsWith('v-coward-')).length).toBe(3);
    }
  });
});

describe('no13-tsumugi / 法定期限', () => {
  it('速報は72時間、確報は不正の目的のおそれとして60日（1440時間）を使う', () => {
    for (const role of roleIds) {
      const deadlines = roles[role].deadlines ?? [];
      expect(deadlines.length).toBeGreaterThanOrEqual(2);
      const prelim = deadlines.find((deadline) => deadline.ref === 'ppc-report-prelim');
      const final = deadlines.find((deadline) => deadline.ref === 'ppc-report-final-malicious');
      expect(prelim, `${role} の速報`).toBeTruthy();
      expect(final, `${role} の確報`).toBeTruthy();
      expect(referencesById.get('ppc-report-prelim')?.deadlineHours).toBe(72);
      expect(referencesById.get('ppc-report-final-malicious')?.deadlineHours).toBe(1440);
      for (const deadline of deadlines) expect(deadline.ref).not.toBe('ppc-report-final');
    }
  });

  it('期限の doneFlag を立てる選択肢が実在する', () => {
    for (const role of roleIds) {
      const script = roles[role];
      const flags = new Set(allChoices(script).flatMap((choice) => Object.keys(choice.setFlags ?? {})));
      for (const deadline of script.deadlines ?? []) {
        expect(flags.has(deadline.doneFlag), `${role} の ${deadline.doneFlag}`).toBe(true);
      }
    }
  });
});

describe('no13-tsumugi / 記者会見', () => {
  it('質問と回答の形が正しく、どの質問にも必ず選べる回答がある', () => {
    const press = scenario.press;
    expect(press).toBeTruthy();
    const questions = [
      ...(press?.questions ?? []),
      ...(press?.extraQuestions ?? []).map((entry) => entry.question),
    ];
    expect(questions.length).toBeGreaterThanOrEqual(6);
    for (const question of questions) {
      expect(question.text.ja.length).toBeGreaterThan(5);
      if (question.seconds !== undefined) {
        expect(question.seconds).toBeGreaterThanOrEqual(20);
        expect(question.seconds).toBeLessThanOrEqual(45);
      }
      const always = question.answers.filter(
        (answer) => answer.when === undefined && (answer.requiresNote === undefined || answer.requiresNote === false),
      );
      expect(always.length, `${question.id} に条件なしの回答がない`).toBeGreaterThanOrEqual(1);
      for (const answer of question.answers) {
        expect(answer.text.en).toBe('');
        expect(answer.text.ja.length).toBeGreaterThan(0);
      }
    }
  });

  it('身代金の質問は、支払いの有無で出し分ける', () => {
    const extras = scenario.press?.extraQuestions ?? [];
    const paid = extras.find((entry) => entry.when.flags?.paidRansom === true);
    const unpaid = extras.find((entry) => entry.when.flags?.paidRansom === false);
    expect(paid?.question.id).toBe('q-ransom-paid');
    expect(unpaid?.question.id).toBe('q-ransom');
    const paidAdmit = paid?.question.answers.find((answer) => answer.points > 0);
    const unpaidRefuse = unpaid?.question.answers.find((answer) => answer.points > 0);
    expect(paidAdmit?.text.ja).toContain('支払いました');
    expect(unpaidRefuse?.text.ja).toContain('支払っていません');
  });

  it('隠した場合と連絡が遅れた場合の追加質問がある', () => {
    const flags = (scenario.press?.extraQuestions ?? []).map((entry) => Object.keys(entry.when.flags ?? {})[0]);
    expect(flags).toContain('hidAttack');
    expect(flags).toContain('delayClient');
  });

  it('委託元と自社、どちらが報告するかを問う質問がある', () => {
    const question = scenario.press?.questions.find((item) => item.id === 'q-report');
    expect(question).toBeTruthy();
    const own = question?.answers.find((answer) => answer.points >= 80);
    expect(own?.text.ja).toContain('従業員情報');
  });

  it('身代金を払うと、支払った前提の質問に切り替わる', () => {
    const { state } = playWithPicks('executive', () => 'e03-a-pay');
    const ids = state.press?.questionIds ?? [];
    expect(ids).toContain('q-ransom-paid');
    expect(ids).not.toContain('q-ransom');
    expect(state.flags.paidRansom).toBe(true);
  });

  it('支払わない経路では、支払っていない前提の質問になる', () => {
    const { state } = playWithPicks('executive', () => 'e03-c-refuse');
    const ids = state.press?.questionIds ?? [];
    expect(ids).toContain('q-ransom');
    expect(ids).not.toContain('q-ransom-paid');
  });
});

/** 指定の選択肢があればそれを選び、それ以外は最大点を選ぶ走行。 */
function playWithPicks(role: RoleId, pick: (choiceIds: string[]) => string | null): { state: PlayState } {
  let step = startPlay(
    scenario,
    role,
    1,
    { comment: '', predictedHours: null },
    '2026-11-13T00:00:00.000Z',
    references,
  );
  let state = step.state;
  let next = step.next;
  let guard = 0;
  while (next !== 'ending' && guard < 400) {
    guard += 1;
    if (next === 'point') {
      const point = currentPoint(state, scenario);
      if (!point) throw new Error('判断ポイントがない');
      for (const note of point.notable ?? []) {
        if (!state.notes.some((item) => item.id === note.id)) {
          state = addNote(state, { id: note.id, text: note.text, at: state.clock });
        }
      }
      const wanted = pick(point.choices.map((choice) => choice.id));
      const choice = point.choices.find((item) => item.id === wanted)
        ?? point.choices.reduce((best, item) => (item.points > best.points ? item : best));
      step = choose(state, scenario, choice.id);
      state = step.state;
      next = step.next;
    } else if (next === 'draft') {
      const draft = state.pendingDraft ? roles[role].drafts?.[state.pendingDraft] : undefined;
      if (!draft) throw new Error('文案がない');
      const selections: Record<string, string> = {};
      for (const slot of draft.slots) {
        if (slot.auto) continue;
        const options = slot.options ?? slot.items ?? [];
        if (options.length === 0) continue;
        selections[slot.id] = options.reduce((best, item) => (item.points > best.points ? item : best)).id;
      }
      step = submitDraft(state, scenario, selections);
      state = step.state;
      next = step.next;
    } else if (next === 'press') {
      step = startPress(state, scenario);
      state = step.state;
      next = step.next;
      while (next === 'press') {
        const answers = availableAnswers(state, scenario);
        const answer = answers.reduce((best, item) => (item.points > best.points ? item : best));
        step = answerPress(state, scenario, answer?.id ?? null);
        state = step.state;
        next = step.next;
      }
    } else {
      throw new Error(`未知の遷移: ${String(next)}`);
    }
  }
  return { state };
}

describe('no13-tsumugi / 到達できるランク', () => {
  for (const role of roleIds) {
    it(`${role}: 最善を選ぶと致命的な失点なしで S に届く`, () => {
      const run = play(role, 'max');
      expect(run.fatal).toBe(false);
      expect(run.rank).toBe('S');
    });

    it(`${role}: 中庸の選択を重ねると A〜C に届く`, () => {
      expect(['A', 'B', 'C']).toContain(play(role, 'mid').rank);
    });

    it(`${role}: 最悪を選ぶと D に届く`, () => {
      expect(play(role, 'min').rank).toBe('D');
    });
  }
});

describe('no13-tsumugi / 文言', () => {
  it('日本語のみで、HTMLを含まない', () => {
    const localized = collectLocalized(scenario);
    expect(localized.length).toBeGreaterThan(400);
    for (const text of localized) {
      expect(text.ja.length, 'ja が空').toBeGreaterThan(0);
      expect(text.en, 'v1 は英語本文を持たない').toBe('');
      expect(text.ja).not.toMatch(/<[^>]+>|\{@html\}/);
    }
  });

  it('本文に実在の年号や固有の事件名を書かない', () => {
    const localized = collectLocalized(scenario);
    for (const text of localized) {
      expect(text.ja).not.toMatch(/\d{4}年(?!代)/);
    }
  });
});
