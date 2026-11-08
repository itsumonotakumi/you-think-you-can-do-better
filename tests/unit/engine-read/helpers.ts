import type { PlayState } from '../../../src/engine/types';

/** 単体テスト用の初期状態 */
export function makeState(over: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: 'fixture',
    scenarioVersion: '1.0.0',
    role: 'executive',
    playCount: 1,
    clock: { day: 0, minutes: 600 },
    phase: 'detect',
    pointId: 'p1',
    gauges: { damage: 20, flame: 0, trust: 70, stamina: 100 },
    cowardStreak: 0,
    rawScore: 0,
    fatal: false,
    history: [],
    itemsEarned: [],
    itemsMissed: [],
    delayed: [],
    voicesShown: [],
    notes: [],
    deadlines: [],
    flags: {},
    press: null,
    prologue: { comment: '', predictedHours: null },
    startedAt: '2026-11-08T00:00:00Z',
    pendingDraft: null,
    finished: false,
    ...over,
  };
}
