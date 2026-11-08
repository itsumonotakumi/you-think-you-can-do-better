// 記者会見（設計書 5.6・6.8、テスト計画書 5.2）
import { finalizeBeforeEnding } from "./deadlines";
import type {
  Cue, Flags, PlayState, PressAnswer, PressQuestion, Scenario, StepResult,
} from "./types";

/** 時間切れの既定点（設計書 5.6） */
export const DEFAULT_TIMEOUT_POINTS = -30;

/** 未設定の旗は false とみなす */
function flagsMet(flags: Flags | undefined, state: PlayState): boolean {
  return Object.entries(flags ?? {}).every(([key, value]) => (state.flags[key] ?? false) === value);
}

/** この会見で出題する質問（questions + 条件を満たす extraQuestions） */
export function pressQuestions(state: PlayState, scenario: Scenario): PressQuestion[] {
  const press = scenario.press;
  if (!press) return [];
  const extra = (press.extraQuestions ?? [])
    .filter((entry) => flagsMet(entry.when.flags, state))
    .map((entry) => entry.question);
  return [...press.questions, ...extra];
}

/** いま表示している質問 */
export function currentQuestion(state: PlayState, scenario: Scenario): PressQuestion | null {
  if (!state.press) return null;
  return pressQuestions(state, scenario)[state.press.index] ?? null;
}

/** 記録があるときだけ選べる回答を除いた、選択可能な回答 */
export function availableAnswers(state: PlayState, scenario: Scenario): PressAnswer[] {
  const question = currentQuestion(state, scenario);
  if (!question) return [];
  const noteIds = new Set(state.notes.map((note) => note.id));
  return question.answers.filter((answer) => !answer.requiresNote || noteIds.has(answer.requiresNote));
}

/** 質問を表示する演出（設計書 10.3・10.4） */
function questionCues(): Cue[] {
  return [
    { kind: "se", id: "shutter" },
    { kind: "fx", id: "flash" },
  ];
}

function endPress(state: PlayState, scenario: Scenario, cues: Cue[]): StepResult {
  const finalized = finalizeBeforeEnding(state, scenario) as unknown;
  const out = finalized && typeof finalized === "object" ? (finalized as PlayState) : state;
  out.finished = true;
  return { state: out, cues, next: "ending" };
}

export function startPress(state: PlayState, scenario: Scenario): StepResult {
  const next = structuredClone(state);
  const questions = pressQuestions(next, scenario);
  next.press = { questionIds: questions.map((question) => question.id), index: 0, answers: [] };
  if (questions.length === 0) return endPress(next, scenario, []);
  return { state: next, cues: questionCues(), next: "press" };
}

export function answerPress(
  state: PlayState,
  scenario: Scenario,
  answerId: string | null,
  _multiplierSeconds?: number,
): StepResult {
  const next = structuredClone(state);
  const press = next.press;
  if (!press) return { state: next, cues: [], next: "ending" };

  const question = currentQuestion(next, scenario);
  if (!question) {
    next.finished = true;
    return { state: next, cues: [], next: "ending" };
  }

  // 記録がない回答は選べない。選べない回答は時間切れと同じ扱いにする
  const picked = answerId === null
    ? null
    : availableAnswers(next, scenario).find((answer) => answer.id === answerId) ?? null;
  const points = picked ? picked.points : question.timeoutPoints ?? DEFAULT_TIMEOUT_POINTS;

  next.rawScore += points;
  press.answers.push({ questionId: question.id, answerId: picked ? picked.id : null, points });
  press.index += 1;

  if (press.index < press.questionIds.length) {
    return { state: next, cues: questionCues(), next: "press" };
  }
  return endPress(next, scenario, []);
}
