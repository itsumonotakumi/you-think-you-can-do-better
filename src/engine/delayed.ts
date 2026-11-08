// 遅れて来る効果の予約と適用（6.5）。
import type { Cue, DelayedSpec, PlayState } from './types';
import { AVALANCHE_FLAME_JUMP, PHASES, STAMINA_BLUR } from './types';
import { applyGauges } from './gauges';
import { isNight } from './clock';

/** 選択・文案の時点のフェーズ番号 + afterPhases を適用時期にする */
export function reserveDelayed(
  state: PlayState,
  sourcePointId: string,
  sourceChoiceId: string,
  spec: DelayedSpec,
): void {
  state.delayed.push({
    sourcePointId,
    sourceChoiceId,
    dueAtPhaseIndex: PHASES.indexOf(state.phase) + spec.afterPhases,
    points: spec.points ?? 0,
    gauges: spec.gauges,
    reason: spec.reason,
    applied: false,
  });
}

function applyOne(state: PlayState, index: number, cues: Cue[]): void {
  const effect = state.delayed[index];
  if (!effect || effect.applied) return;
  effect.applied = true;
  const flameBefore = state.gauges.flame;
  state.rawScore += effect.points;
  if (effect.gauges) {
    state.gauges = applyGauges(state.gauges, effect.gauges, isNight(state.clock));
  }
  cues.push({ kind: 'delayedHit', reason: effect.reason });
  cues.push({ kind: 'se', id: 'delayed_hit' });
  if (state.gauges.flame - flameBefore >= AVALANCHE_FLAME_JUMP) {
    cues.push({ kind: 'fx', id: 'avalanche' });
  }
  if (state.gauges.stamina < STAMINA_BLUR) {
    cues.push({ kind: 'fx', id: 'blur' });
  }
}

/** フェーズが進んだとき、時期が来た効果をすべて適用する */
export function applyDelayedDue(state: PlayState, phaseIndex: number, cues: Cue[]): void {
  for (let i = 0; i < state.delayed.length; i++) {
    const effect = state.delayed[i];
    if (!effect || effect.applied || effect.dueAtPhaseIndex > phaseIndex) continue;
    applyOne(state, i, cues);
  }
}

/** エンディング計算の前に、未適用の効果を全部適用する（演出キューなし） */
export function applyAllDelayed(state: PlayState): void {
  for (let i = 0; i < state.delayed.length; i++) {
    if (!state.delayed[i]?.applied) applyOne(state, i, []);
  }
}
