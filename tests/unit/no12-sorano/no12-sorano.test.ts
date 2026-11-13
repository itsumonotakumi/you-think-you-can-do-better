// No.12 ソラノ / 経路とデータの検査。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no12-sorano/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no12-sorano/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no12-sorano/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no12-sorano/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no12-sorano/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import {
  addNote,
  availableAnswers,
  choose,
  computeResult,
  currentPoint,
  startPlay,
  startPress,
  submitDraft,
  answerPress,
} from '../../../src/engine/index';
import { CATEGORY_RANGE, MISLEADING_TYPES } from '../../../src/engine/types';
import type {
  Choice,
  DecisionPoint,
  DetailItem,
  Draft,
  Localized,
  PlayState,
  Reference,
  RoleId,
  RoleScript,
  Scenario,
} from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const roles: Record<RoleId, RoleScript> = {
  executive: parse(executiveYaml) as RoleScript,
  officer: parse(officerYaml) as RoleScript,
  lead: parse(leadYaml) as RoleScript,
  analyst: parse(analystYaml) as RoleScript,
};
const scenario: Scenario = { ...base, roles };
const refs = parse(referencesYaml) as Reference[];
const refIds = new Set(refs.map((ref) => ref.id));

const roleIds: RoleId[] = ['executive', 'officer', 'lead', 'analyst'];

function allChoices(script: RoleScript): Choice[] {
  return script.points.flatMap((point) => point.choices);
}

function allDraftItems(script: RoleScript): DetailItem[] {
  return Object.values(script.drafts ?? {}).flatMap((draft: Draft) =>
    draft.slots.flatMap((slot) => [...(slot.items ?? []), ...(slot.options ?? [])]),
  );
}

function countDetails(script: RoleScript): number {
  return allChoices(script).flatMap((choice) => choice.items ?? []).length + allDraftItems(script).length;
}

function expectLocalized(value: Localized | undefined, where: string): void {
  expect(value, `${where} の文言がない`).toBeTruthy();
  expect(value!.ja.length, `${where} の ja が空`).toBeGreaterThan(0);
}

function topChoice(point: DecisionPoint): Choice {
  return point.choices.reduce((best, choice) => (choice.points > best.points ? choice : best));
}

function worstChoice(point: DecisionPoint): Choice {
  return point.choices.reduce((worst, choice) => (choice.points < worst.points ? choice : worst));
}

function pickDraft(draft: Draft, mode: 'max' | 'min'): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const slot of draft.slots) {
    if (slot.auto) continue;
    const options = slot.options ?? slot.items ?? [];
    if (options.length === 0) continue;
    const picked = mode === 'max'
      ? options.reduce((best, option) => (option.points > best.points ? option : best))
      : options.reduce((worst, option) => (option.points < worst.points ? option : worst));
    selections[slot.id] = picked.id;
  }
  return selections;
}

interface PlayOutcome {
  rank: string;
  raw: number;
  fatal: boolean;
  finished: boolean;
  state: PlayState;
}

function play(role: RoleId, mode: 'max' | 'min', oneFatal = false): PlayOutcome {
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
  let fatalTaken = false;
  let guard = 0;
  while (next !== 'ending' && guard < 500) {
    guard += 1;
    if (next === 'point') {
      const point = currentPoint(state, scenario);
      if (!point) throw new Error('判断ポイントが見つからない');
      let picked: Choice;
      if (oneFatal && !fatalTaken) {
        const fatal = point.choices.find((choice) => choice.category === 'fatal');
        if (fatal) {
          picked = fatal;
          fatalTaken = true;
        } else {
          picked = mode === 'max' ? topChoice(point) : worstChoice(point);
        }
      } else {
        picked = mode === 'max' ? topChoice(point) : worstChoice(point);
      }
      const step = choose(state, scenario, picked.id);
      state = step.state;
      next = step.next;
      continue;
    }
    if (next === 'draft') {
      const key = state.pendingDraft;
      const draft = key ? roles[role].drafts?.[key] : undefined;
      if (!draft) throw new Error(`文案が見つからない: ${key ?? '(なし)'}`);
      const step = submitDraft(state, scenario, pickDraft(draft, mode));
      state = step.state;
      next = step.next;
      continue;
    }
    if (next === 'press') {
      for (const point of roles[role].points) {
        for (const note of point.notable ?? []) {
          state = addNote(state, { id: note.id, text: note.text, at: state.clock });
        }
      }
      const opened = startPress(state, scenario);
      state = opened.state;
      next = opened.next;
      while (next === 'press') {
        const answers = availableAnswers(state, scenario);
        if (answers.length === 0) throw new Error('回答がない');
        const picked = mode === 'max'
          ? answers.reduce((best, answer) => (answer.points > best.points ? answer : best))
          : answers.reduce((worst, answer) => (answer.points < worst.points ? answer : worst));
        const step = answerPress(state, scenario, picked.id);
        state = step.state;
        next = step.next;
      }
      continue;
    }
    throw new Error(`未知の遷移: ${String(next)}`);
  }
  const result = computeResult(state, scenario);
  return { rank: result.rank, raw: result.raw, fatal: result.fatal, finished: next === 'ending', state };
}

function pressQuestionIds(flags: Record<string, boolean>): string[] {
  const started = startPlay(
    scenario,
    'executive',
    1,
    { comment: '', predictedHours: null },
    '2026-11-13T00:00:00.000Z',
    refs,
  );
  const opened = startPress({ ...started.state, flags: { ...started.state.flags, ...flags } }, scenario);
  return opened.state.press?.questionIds ?? [];
}

describe('no12-sorano 構造', () => {
  it('4ロール・15判断・80細目以上・説明と教訓がある', () => {
    expect(Object.keys(roles).sort()).toEqual([...roleIds].sort());
    for (const role of roleIds) {
      const script = roles[role];
      expect(script.points.length, `${role} の判断数`).toBe(15);
      expect(countDetails(script), `${role} の細目数`).toBeGreaterThanOrEqual(80);
      for (const point of script.points) {
        expectLocalized(point.text, point.id);
        expectLocalized(point.lesson, `${point.id} の lesson`);
        expect(point.lesson!.ja.length, `${point.id} の lesson が短い`).toBeGreaterThanOrEqual(80);
        expect(point.lesson!.ja.length, `${point.id} の lesson が長い`).toBeLessThanOrEqual(200);
        expect(point.choices.length, `${point.id} の選択肢数`).toBeGreaterThanOrEqual(2);
        for (const choice of point.choices) {
          expectLocalized(choice.text, choice.id);
          expectLocalized(choice.explain, `${choice.id} の explain`);
          expect(choice.explain!.ja.length, `${choice.id} の explain が短い`).toBeGreaterThanOrEqual(40);
          expect(choice.explain!.ja.length, `${choice.id} の explain が長い`).toBeLessThanOrEqual(120);
          expect(choice.minutes % 15, `${choice.id} の minutes`).toBe(0);
          const [min, max] = CATEGORY_RANGE[choice.category];
          expect(choice.points, `${choice.id} の点数`).toBeGreaterThanOrEqual(min);
          expect(choice.points, `${choice.id} の点数`).toBeLessThanOrEqual(max);
          expect(choice.refs.length, `${choice.id} の根拠`).toBeGreaterThan(0);
          for (const ref of choice.refs) expect(refIds.has(ref), `${choice.id} の根拠 ${ref}`).toBe(true);
          expect(choice.items?.length ?? 0, `${choice.id} の細目`).toBeGreaterThan(0);
          for (const item of choice.items ?? []) {
            expect(Math.abs(item.points), `${item.id} の点数`).toBeGreaterThanOrEqual(1);
            expect(Math.abs(item.points), `${item.id} の点数`).toBeLessThanOrEqual(20);
            for (const ref of item.refs) expect(refIds.has(ref), `${item.id} の根拠 ${ref}`).toBe(true);
          }
        }
      }
    }
  });

  it('ミスリード13種・臆病への批判・正しい選択の直後の批判がある', () => {
    const types = new Set<string>();
    for (const role of roleIds) {
      const script = roles[role];
      const misleading = new Set(script.voices.filter((voice) => voice.misleading).map((voice) => voice.id));
      const covered = script.points.filter((point) => (point.voices ?? []).some((id) => misleading.has(id)));
      expect(covered.length * 2, `${role} のミスリードの声`).toBeGreaterThanOrEqual(script.points.length);
      for (const voice of script.voices) {
        if (!voice.misleading) continue;
        expect(voice.type, `${voice.id} の type`).toBeTruthy();
        types.add(voice.type!);
      }
      expect(script.points.some((point) => point.choices.some((choice) => choice.coward)), `${role} の臆病な選択`).toBe(true);
      const voiceIds = new Set(script.voices.map((voice) => voice.id));
      for (const key of ['2', '3', '4'] as const) {
        expect(voiceIds.has(script.cowardVoices[key]), `${role} の臆病ゲージの声`).toBe(true);
      }
      const positive = new Set(script.points.flatMap((point) => point.choices).filter((choice) => choice.points > 0).map((choice) => choice.id));
      const hasAfter = script.voices.some(
        (voice) => voice.trigger && 'at' in voice.trigger && voice.trigger.at === 'after'
          && (voice.trigger.choice === undefined || positive.has(voice.trigger.choice)),
      );
      expect(hasAfter, `${role} の正しい選択の直後の批判`).toBe(true);
    }
    for (const type of MISLEADING_TYPES) expect(types.has(type), `ミスリード型 ${type}`).toBe(true);
  });

  it('法令の期限は速報72時間・確報30日（不正目的の60日を使わない）', () => {
    for (const role of roleIds) {
      const deadlines = roles[role].deadlines ?? [];
      const refsUsed = deadlines.map((deadline) => deadline.ref);
      expect(refsUsed).toContain('ppc-report-prelim');
      expect(refsUsed).toContain('ppc-report-final');
      expect(refsUsed).not.toContain('ppc-report-final-malicious');
      expect(refs.find((ref) => ref.id === 'ppc-report-prelim')?.deadlineHours).toBe(72);
      expect(refs.find((ref) => ref.id === 'ppc-report-final')?.deadlineHours).toBe(720);
    }
  });

  it('まず閉じる選択と、速報・確報の完了フラグがある', () => {
    // 公開停止とログ保全は、技術を扱う3ロールが持つ。役員は顧客対応と契約を扱う。
    for (const role of ['executive', 'lead', 'analyst'] as RoleId[]) {
      const choices = allChoices(roles[role]);
      expect(choices.some((choice) => choice.setFlags?.closedBucket && choice.category === 'recover'), `${role} の公開停止`).toBe(true);
      expect(choices.some((choice) => choice.setFlags?.logsPreserved), `${role} のログ保全`).toBe(true);
    }
    for (const role of roleIds) {
      const choices = allChoices(roles[role]);
      expect(choices.some((choice) => choice.setFlags?.ppcPrelimFiled), `${role} の速報`).toBe(true);
      expect(choices.some((choice) => choice.setFlags?.ppcFinalFiled), `${role} の確報`).toBe(true);
    }
  });

  it('元事件の時期は年代だけにとどめる', () => {
    expect(scenario.sourcePeriod.ja).toContain('2020年代');
    expect(scenario.sourcePeriod.ja).not.toMatch(/20\d\d年(?!代)/);
  });
});

describe('no12-sorano 記者会見の出し分け', () => {
  it('通常は基本の質問だけ', () => {
    const ids = pressQuestionIds({});
    expect(ids).toContain('q-window');
    expect(ids).toContain('q-researcher');
    expect(ids).toContain('q-report');
    expect(ids).not.toContain('q-threat');
    expect(ids).not.toContain('q-hidden');
    expect(ids).not.toContain('q-compensation');
  });

  it('指摘者を脅した時だけ、その質問が出る', () => {
    expect(pressQuestionIds({ threatenedResearcher: true })).toContain('q-threat');
    const threat = base.press?.extraQuestions?.find((extra) => extra.question.id === 'q-threat')?.question;
    expect(threat).toBeTruthy();
    expect(threat!.answers.some((answer) => answer.text.ja.includes('撤回'))).toBe(true);
    const bestPlain = threat!.answers
      .filter((answer) => !answer.requiresNote && !answer.when)
      .sort((a, b) => b.points - a.points)[0]!;
    expect(bestPlain.text.ja).toContain('撤回');
  });

  it('隠した時だけ、公表の遅れを問う質問が出る', () => {
    expect(pressQuestionIds({ hidExposure: true })).toContain('q-hidden');
    const hidden = base.press?.extraQuestions?.find((extra) => extra.question.id === 'q-hidden')?.question;
    const best = [...hidden!.answers].sort((a, b) => b.points - a.points)[0]!;
    expect(best.text.ja).toContain('不正確');
  });

  it('補償を決めた時だけ、補償の質問が出る', () => {
    expect(pressQuestionIds({ paidCompensation: true })).toContain('q-compensation');
    const comp = base.press?.extraQuestions?.find((extra) => extra.question.id === 'q-compensation')?.question;
    const best = [...comp!.answers].sort((a, b) => b.points - a.points)[0]!;
    expect(best.text.ja).toContain('申請');
  });
});

describe('no12-sorano 経路', () => {
  it('最善の経路は S ランクに届く', () => {
    const outcome = play('executive', 'max');
    expect(outcome.finished).toBe(true);
    expect(outcome.fatal).toBe(false);
    expect(outcome.rank).toBe('S');
    expect(outcome.raw).toBeGreaterThanOrEqual(1000);
  });

  it('最悪の経路は D ランクになる', () => {
    const outcome = play('executive', 'min');
    expect(outcome.finished).toBe(true);
    expect(outcome.rank).toBe('D');
  });

  it('致命的な失点を含む経路は S にならない', () => {
    const outcome = play('executive', 'max', true);
    expect(outcome.finished).toBe(true);
    expect(outcome.fatal).toBe(true);
    expect(outcome.rank).not.toBe('S');
  });

  it('4ロールすべてで最善の経路が S に届く', () => {
    for (const role of roleIds) {
      const outcome = play(role, 'max');
      expect(outcome.finished, `${role} が終わらない`).toBe(true);
      expect(outcome.rank, `${role} のランク`).toBe('S');
    }
  });
});
