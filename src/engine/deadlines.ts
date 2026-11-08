// 法定期限（6.3）。期限の数値は根拠データ（Reference.deadlineHours）から作る。
import type { Cue, DeadlineState, PlayState, Reference, RoleScript, Scenario } from './types';
import { DEADLINE_WARN_MINUTES } from './types';
import { addMinutes, toAbs } from './clock';
import { applyAllDelayed } from './delayed';

export function initDeadlines(
  scenario: Scenario,
  script: RoleScript,
  refs: Reference[],
): DeadlineState[] {
  const out: DeadlineState[] = [];
  for (const def of script.deadlines ?? []) {
    const ref = refs.find((r) => r.id === def.ref);
    if (!ref?.deadlineHours) continue;
    out.push({
      id: def.id,
      dueAt: addMinutes(scenario.start, ref.deadlineHours * 60),
      warned: false,
      done: false,
      over: false,
    });
  }
  return out;
}

/** 時計が進むたびに呼ぶ。完了・警告・超過を判定する */
export function updateDeadlines(state: PlayState, scenario: Scenario, cues?: Cue[]): void {
  const definitions = scenario.roles[state.role]?.deadlines;
  if (!definitions) return;
  for (const deadline of state.deadlines) {
    const def = definitions.find((d) => d.id === deadline.id);
    if (!def) continue;
    if (!deadline.done && (state.flags[def.doneFlag] ?? false)) deadline.done = true;
    if (deadline.done || deadline.over) continue;
    const remain = toAbs(deadline.dueAt) - toAbs(state.clock);
    if (!deadline.warned && remain < DEADLINE_WARN_MINUTES) {
      deadline.warned = true;
      if (cues) {
        cues.push({ kind: 'se', id: 'deadline_warn' });
        cues.push({ kind: 'fx', id: 'deadline' });
      }
    }
    if (remain < 0) {
      deadline.over = true;
      state.rawScore += def.points;
      if (cues) cues.push({ kind: 'se', id: 'deadline_over' });
    }
  }
}

/**
 * エンディング計算の前処理。
 * 未適用の遅れて来る効果をすべて適用し、完了していない期限を超過扱いにして点数を加える。
 */
export function finalizeBeforeEnding(state: PlayState, scenario: Scenario): PlayState {
  const next = structuredClone(state);
  applyAllDelayed(next);
  const definitions = scenario.roles[next.role]?.deadlines;
  for (const deadline of next.deadlines) {
    const def = definitions?.find((d) => d.id === deadline.id);
    if (!def) continue;
    if (!deadline.done && (next.flags[def.doneFlag] ?? false)) deadline.done = true;
    if (!deadline.done && !deadline.over) {
      deadline.over = true;
      next.rawScore += def.points;
    }
  }
  next.finished = true;
  return next;
}
