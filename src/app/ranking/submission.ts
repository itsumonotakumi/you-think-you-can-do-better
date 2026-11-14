// 送信データの組み立て（#7）。点数は送らない。サーバーがエンジンを再実行して決める。
// 選んだ選択肢は PlayState.history、報告書は itemsEarned、記者会見は state.press から復元する。
import type { PlayState, PlaySubmission, Scenario } from '../../engine/types';
import type { RankingProfile } from './profile';

/** PlaySubmission に削除用の鍵を足したもの（共有契約 types.ts は変えない） */
export type RankingPlaySubmission = PlaySubmission & { deleteKey?: string };

export interface SubmissionInput {
  nickname: string;
  clientId: string;
  turnstileToken: string;
  /** 端末で作った削除用の鍵。サーバーはハッシュだけ保存する */
  deleteKey?: string;
}

/** 初回プレイの終了後だけ送れる（版が変わった続きは送らない） */
export function canSubmitRanking(state: PlayState | null, scenario: Scenario | null): boolean {
  if (!state || !scenario) return false;
  return state.finished
    && state.playCount === 1
    && state.scenarioId === scenario.id
    && state.scenarioVersion === scenario.version;
}

/** その回で実際に到達した報告書のキー（選択肢の detail から辿る） */
function reachedDraftKeys(state: PlayState, scenario: Scenario): Set<string> {
  const role = scenario.roles[state.role];
  const reached = new Set<string>();
  for (const record of state.history) {
    const point = role?.points.find((item) => item.id === record.pointId);
    const choice = point?.choices.find((item) => item.id === record.choiceId);
    if (choice?.detail) reached.add(choice.detail);
  }
  return reached;
}

/**
 * 報告書の選択を復元する。
 * 選んだ部品の id は itemsEarned に入るので、到達した報告書の各枠から一致するものを拾う。
 * 自動で決まる枠（auto）はサーバーが時計から再計算するため送らない。
 */
export function collectDraftChoices(
  state: PlayState,
  scenario: Scenario,
): PlaySubmission['drafts'] {
  const script = scenario.roles[state.role];
  if (!script?.drafts) return [];
  const reached = reachedDraftKeys(state, scenario);
  const earned = new Set(state.itemsEarned);
  const out: PlaySubmission['drafts'] = [];

  for (const [draftKey, draft] of Object.entries(script.drafts)) {
    if (!reached.has(draftKey)) continue;
    for (const slot of draft.slots) {
      if (slot.auto) continue;
      const picked = (slot.options ?? slot.items ?? []).find((option) => earned.has(option.id));
      if (picked) out.push({ draftKey, slotId: slot.id, optionId: picked.id });
    }
  }
  return out;
}

/** シナリオに存在する判断と選択肢だけを残す（壊れた保存値で送らない） */
export function collectChoices(
  state: PlayState,
  scenario: Scenario,
): PlaySubmission['choices'] {
  const role = scenario.roles[state.role];
  if (!role) return [];
  const out: PlaySubmission['choices'] = [];
  for (const record of state.history) {
    const point = role.points.find((item) => item.id === record.pointId);
    const choice = point?.choices.find((item) => item.id === record.choiceId);
    if (point && choice) out.push({ pointId: point.id, choiceId: choice.id });
  }
  return out;
}

export function collectPress(state: PlayState): PlaySubmission['press'] {
  return (state.press?.answers ?? []).flatMap((answer) =>
    typeof answer.questionId === 'string'
      ? [{ questionId: answer.questionId, answerId: answer.answerId ?? null }]
      : []);
}

export function buildRankingSubmission(
  state: PlayState,
  scenario: Scenario,
  input: SubmissionInput,
): RankingPlaySubmission | null {
  if (!canSubmitRanking(state, scenario)) return null;
  const submission: RankingPlaySubmission = {
    scenarioId: state.scenarioId,
    scenarioVersion: state.scenarioVersion,
    role: state.role,
    mode: state.mode ?? 'normal',
    choices: collectChoices(state, scenario),
    drafts: collectDraftChoices(state, scenario),
    press: collectPress(state),
    nickname: input.nickname,
    clientId: input.clientId,
    turnstileToken: input.turnstileToken,
  };
  if (input.deleteKey) submission.deleteKey = input.deleteKey;
  return submission;
}

/** 保存済みプロフィールから送信者情報を作る */
export function submissionInput(profile: RankingProfile, turnstileToken: string): SubmissionInput {
  return {
    nickname: profile.nickname,
    clientId: profile.clientId,
    turnstileToken,
  };
}
