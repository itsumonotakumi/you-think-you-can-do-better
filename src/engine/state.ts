// プレイの開始と参照（4.1）。状態は structuredClone して返す。
import type {
  Cue,
  DecisionPoint,
  PlayMode,
  PlayState,
  PlayerNote,
  Reference,
  RoleId,
  Scenario,
  StepResult,
} from './types';
import { PHASES } from './types';
import { isNight } from './clock';
import { initDeadlines } from './deadlines';
import { findNextPoint, presentPoint } from './events';

export function startPlay(
  scenario: Scenario,
  role: RoleId,
  playCount: number,
  prologue: PlayState['prologue'],
  startedAt: string,
  refs: Reference[],
  /** 省略時は通常モード。本番モードは画面が制限時間を数える（#10） */
  mode: PlayMode = 'normal',
): StepResult {
  const script = scenario.roles[role];
  if (!script) throw new Error(`role script not found: ${role}`);

  const state: PlayState = {
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    role,
    playCount,
    clock: { ...scenario.start },
    phase: PHASES[0] ?? 'detect',
    pointId: null,
    gauges: { ...scenario.initialGauges },
    cowardStreak: 0,
    rawScore: 0,
    fatal: false,
    history: [],
    itemsEarned: [],
    itemsMissed: [],
    delayed: [],
    voicesShown: [],
    notes: [],
    deadlines: initDeadlines(scenario, script, refs),
    flags: {},
    press: null,
    prologue: prologue ? { ...prologue } : { comment: '', predictedHours: null },
    startedAt,
    pendingDraft: null,
    finished: false,
    mode,
  };

  const cues: Cue[] = [];
  const night = isNight(state.clock);
  if (night) cues.push({ kind: 'fx', id: 'night', on: true });

  const first = findNextPoint(state, scenario);
  state.phase = first?.phase ?? state.phase;
  const bgm = night
    ? 'night'
    : scenario.audio.bgmByPhase?.[state.phase] ?? scenario.audio.bgmDefault;
  cues.push({ kind: 'bgm', id: bgm });

  if (first) {
    presentPoint(state, scenario, first, cues);
    return { state, cues, next: 'point' };
  }
  return { state, cues, next: script.pressEnabled ? 'press' : 'ending' };
}

export function currentPoint(state: PlayState, scenario: Scenario): DecisionPoint | null {
  if (!state.pointId) return null;
  return scenario.roles[state.role]?.points.find((p) => p.id === state.pointId) ?? null;
}

export function addNote(state: PlayState, note: PlayerNote): PlayState {
  const next = structuredClone(state);
  const index = next.notes.findIndex((n) => n.id === note.id);
  if (index >= 0) next.notes[index] = { ...note };
  else next.notes.push({ ...note });
  return next;
}
