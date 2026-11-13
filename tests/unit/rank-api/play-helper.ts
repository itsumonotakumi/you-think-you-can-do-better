// テスト用: 実際のエンジンで 1 回プレイし、送信する記録と本来の点数を作る。
// ランキング API の再生処理とは別の経路で計算するので、点数の一致を確かめられる。
import type {
  Choice,
  DecisionPoint,
  PlayState,
  Rank,
  Reference,
  RoleId,
  Scenario,
} from '../../../src/engine/types';
import {
  answerPress,
  availableAnswers,
  choose,
  computeResult,
  currentPoint,
  finalizeBeforeEnding,
  startPlay,
  startPress,
  submitDraft,
} from '../../../src/engine/index';
import references from '../../../src/data/references.json';
import no01 from '../../../src/data/scenarios/no01-nebula.json';

const ALL = [no01] as unknown as Scenario[];

export const TEST_SCENARIO: Scenario = ALL[0]!;
export const TEST_STARTED_AT = '2026-01-01T00:00:00.000Z';

export function scenarioById(id: string): Scenario {
  const found = ALL.find((scenario) => scenario.id === id);
  if (!found) throw new Error(`テスト用シナリオが見つからない: ${id}`);
  return found;
}

export interface PlayedChoices {
  choices: { pointId: string; choiceId: string }[];
  drafts: { draftKey: string; slotId: string; optionId: string }[];
  press: { questionId: string; answerId: string | null }[];
  score: number;
  rank: Rank;
}

/** 先頭の選択肢を選ぶ。文案作成がある場面ではそちらを選び、草案の経路も通す */
export function pickFirst(_point: DecisionPoint, choices: Choice[]): string {
  const withDraft = choices.find((choice) => Boolean(choice.detail));
  return (withDraft ?? choices[0]!).id;
}

/** pick で選ぶ選択肢を決める。省略時は先頭の選択肢を選ぶ */
export function playThrough(
  scenario: Scenario,
  role: RoleId,
  pick: (point: DecisionPoint, choices: Choice[]) => string = pickFirst,
): PlayedChoices {
  const started = startPlay(
    scenario,
    role,
    1,
    { comment: '', predictedHours: null },
    TEST_STARTED_AT,
    references as unknown as Reference[],
  );
  let state: PlayState = started.state;
  let next = started.next;

  const choices: PlayedChoices['choices'] = [];
  const drafts: PlayedChoices['drafts'] = [];
  const press: PlayedChoices['press'] = [];
  const script = scenario.roles[role]!;

  for (let step = 0; step < 500 && next !== 'ending'; step++) {
    if (next === 'point') {
      const point = currentPoint(state, scenario)!;
      const choiceId = pick(point, point.choices);
      choices.push({ pointId: point.id, choiceId });
      const result = choose(state, scenario, choiceId);
      state = result.state;
      next = result.next;
      continue;
    }
    if (next === 'draft') {
      const key = state.pendingDraft!;
      const draft = script.drafts?.[key];
      if (!draft) throw new Error(`draft が見つからない: ${key}`);
      const selections: Record<string, string> = {};
      for (const slot of draft.slots) {
        if (slot.auto) continue;
        const option = slot.options?.[0];
        if (!option) continue;
        selections[slot.id] = option.id;
        drafts.push({ draftKey: key, slotId: slot.id, optionId: option.id });
      }
      const result = submitDraft(state, scenario, selections);
      state = result.state;
      next = result.next;
      continue;
    }
    if (next === 'press') {
      if (!state.press) {
        const result = startPress(state, scenario);
        state = result.state;
        next = result.next;
        continue;
      }
      const questionId = state.press.questionIds[state.press.index]!;
      const answer = availableAnswers(state, scenario)[0];
      const answerId = answer ? answer.id : null;
      press.push({ questionId, answerId });
      const result = answerPress(state, scenario, answerId);
      state = result.state;
      next = result.next;
      continue;
    }
    throw new Error(`想定しない遷移: ${next}`);
  }

  const finalized = finalizeBeforeEnding(state, scenario);
  const result = computeResult(finalized, scenario);
  return { choices, drafts, press, score: result.official, rank: result.rank };
}

/** 送信本文（nickname・clientId・turnstileToken は呼び出し側で決める） */
export function submissionBody(played: PlayedChoices, overrides: Record<string, unknown> = {}) {
  return {
    scenarioId: TEST_SCENARIO.id,
    scenarioVersion: TEST_SCENARIO.version,
    role: 'lead',
    mode: 'normal',
    choices: played.choices,
    drafts: played.drafts,
    press: played.press,
    nickname: 'ためし',
    clientId: 'client-0001',
    turnstileToken: '',
    ...overrides,
  };
}

export function makePlayRequest(body: unknown, ip = '203.0.113.1'): Request {
  return new Request('https://yattemite.example/api/plays', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

export function getRequest(path: string): Request {
  return new Request(`https://yattemite.example${path}`);
}
