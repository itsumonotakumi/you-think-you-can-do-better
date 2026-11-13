// 送信された選択をエンジンで再生して点数を出す（クライアントの点数は信用しない）。
// 再生できない記録（存在しない id・順序違い・余分な選択）はすべて拒否する。
import type {
  Draft,
  Next,
  PlayState,
  PlaySubmission,
  Rank,
  Scenario,
} from '../../src/engine/types';
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
} from '../../src/engine/index';
import { REFERENCES } from './scenarios';

/** ランキングは初回プレイのみ。プレイ回数係数 1.2 で計算する */
export const FIRST_PLAY_COUNT = 1;
/** 無限ループ防止。判断ポイントは最大 25、記者会見は数十問なので十分 */
const MAX_STEPS = 500;

export interface ReplaySuccess {
  ok: true;
  score: number;
  rank: Rank;
}

export interface ReplayFailure {
  ok: false;
  error: string;
}

type DraftEntry = { slotId: string; optionId: string };

function groupDrafts(sub: PlaySubmission): Map<string, DraftEntry[]> {
  const grouped = new Map<string, DraftEntry[]>();
  for (const entry of sub.drafts) {
    const list = grouped.get(entry.draftKey) ?? [];
    list.push({ slotId: entry.slotId, optionId: entry.optionId });
    grouped.set(entry.draftKey, list);
  }
  return grouped;
}

/** 1回分のプレイをそのまま再生する。state は engine 側で複製される */
export function replaySubmission(
  sub: PlaySubmission,
  scenario: Scenario,
  startedAt: string,
): ReplaySuccess | ReplayFailure {
  const script = scenario.roles[sub.role];
  if (!script) return { ok: false, error: 'unknown_role_script' };
  if (sub.scenarioVersion !== scenario.version) {
    return { ok: false, error: 'scenario_version_mismatch' };
  }

  const drafts = groupDrafts(sub);
  let choiceIndex = 0;
  let pressIndex = 0;

  let state: PlayState;
  let next: Next;
  try {
    const started = startPlay(
      scenario,
      sub.role,
      FIRST_PLAY_COUNT,
      { comment: '', predictedHours: null },
      startedAt,
      REFERENCES,
    );
    state = started.state;
    next = started.next;

    for (let step = 0; step < MAX_STEPS; step++) {
      if (next === 'ending') break;

      if (next === 'point') {
        const entry = sub.choices[choiceIndex];
        const pointId = state.pointId;
        if (!entry || !pointId || entry.pointId !== pointId) {
          return { ok: false, error: 'choices_out_of_order' };
        }
        const point = currentPoint(state, scenario);
        if (!point) return { ok: false, error: 'unknown_point' };
        if (!point.choices.some((choice) => choice.id === entry.choiceId)) {
          return { ok: false, error: 'unknown_choice' };
        }
        choiceIndex += 1;
        const result = choose(state, scenario, entry.choiceId);
        state = result.state;
        next = result.next;
        continue;
      }

      if (next === 'draft') {
        const key = state.pendingDraft;
        if (!key) return { ok: false, error: 'draft_state' };
        const draft: Draft | undefined = script.drafts?.[key];
        if (!draft) return { ok: false, error: 'unknown_draft' };
        const entries = drafts.get(key);
        if (!entries || entries.length === 0) return { ok: false, error: 'draft_missing' };

        const selections: Record<string, string> = {};
        for (const entry of entries) {
          const slot = draft.slots.find((s) => s.id === entry.slotId);
          if (!slot) return { ok: false, error: 'unknown_slot' };
          if (slot.auto) return { ok: false, error: 'auto_slot_selected' };
          const allowed = [...(slot.items ?? []), ...(slot.options ?? [])];
          if (!allowed.some((item) => item.id === entry.optionId)) {
            return { ok: false, error: 'unknown_option' };
          }
          if (selections[entry.slotId]) return { ok: false, error: 'duplicate_slot' };
          selections[entry.slotId] = entry.optionId;
        }
        drafts.delete(key);

        const result = submitDraft(state, scenario, selections);
        state = result.state;
        next = result.next;
        continue;
      }

      if (next === 'press') {
        if (!state.press) {
          const started = startPress(state, scenario);
          state = started.state;
          next = started.next;
          continue;
        }
        const questionId = state.press.questionIds[state.press.index];
        const entry = sub.press[pressIndex];
        if (!entry || entry.questionId !== questionId) {
          return { ok: false, error: 'press_out_of_order' };
        }
        if (entry.answerId !== null) {
          const allowed = availableAnswers(state, scenario);
          if (!allowed.some((answer) => answer.id === entry.answerId)) {
            return { ok: false, error: 'press_answer_unavailable' };
          }
        }
        pressIndex += 1;
        const result = answerPress(state, scenario, entry.answerId);
        state = result.state;
        next = result.next;
        continue;
      }

      return { ok: false, error: 'unexpected_step' };
    }

    if (next !== 'ending') return { ok: false, error: 'too_many_steps' };
    if (choiceIndex !== sub.choices.length) return { ok: false, error: 'extra_choices' };
    if (drafts.size > 0) return { ok: false, error: 'extra_drafts' };
    if (pressIndex !== sub.press.length) return { ok: false, error: 'extra_press' };

    const finalized = finalizeBeforeEnding(state, scenario);
    const result = computeResult(finalized, scenario);
    return { ok: true, score: result.official, rank: result.rank };
  } catch {
    // エンジンが例外を投げた記録は不正とみなす
    return { ok: false, error: 'replay_failed' };
  }
}
