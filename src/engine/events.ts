// 時計の進行、時刻イベント、判断ポイントの表示（6.1・6.2）。
import type {
  Condition,
  Cue,
  DecisionPoint,
  Flags,
  GameTime,
  Next,
  PlayState,
  Scenario,
  ScenarioEvent,
  StepResult,
} from './types';
import { AVALANCHE_FLAME_JUMP, PHASES } from './types';
import { addMinutes, cloneTime, isNight, toAbs } from './clock';
import { applyGauges } from './gauges';
import { applyDelayedDue } from './delayed';
import { updateDeadlines } from './deadlines';
import { fireFlagVoices, firePointVoices, fireVoice } from './voices';

/** 条件（今は flags のみ）。未設定の旗は false とみなす */
export function conditionMet(cond: Condition | undefined, flags: Flags): boolean {
  if (!cond?.flags) return true;
  return Object.entries(cond.flags).every(([key, value]) => (flags[key] ?? false) === value);
}

function eventKey(id: string): string {
  return `ev:${id}`;
}

function fireEvent(state: PlayState, scenario: Scenario, event: ScenarioEvent, cues: Cue[]): void {
  state.flags[eventKey(event.id)] = true;
  if (event.setFlags) Object.assign(state.flags, event.setFlags);
  if (event.gauges) {
    const flameBefore = state.gauges.flame;
    state.gauges = applyGauges(state.gauges, event.gauges, isNight(state.clock));
    if (state.gauges.flame - flameBefore >= AVALANCHE_FLAME_JUMP) {
      cues.push({ kind: 'fx', id: 'avalanche' });
    }
  }
  for (const voiceId of event.voices ?? []) {
    fireVoice(state, scenario, voiceId, state.pointId, cues);
  }
  for (const se of event.sound?.se ?? []) cues.push({ kind: 'se', id: se });
  if (event.caption) cues.push({ kind: 'caption', text: event.caption });
}

/** 時計を目標時刻へ進める。深夜帯をまたいだら演出を出す */
function moveClockTo(state: PlayState, target: GameTime, cues: Cue[]): void {
  if (toAbs(target) === toAbs(state.clock)) return;
  const night = isNight(target);
  if (isNight(state.clock) !== night) cues.push({ kind: 'fx', id: 'night', on: night });
  state.clock = cloneTime(target);
}

/** 時計を進める。通過した時刻イベントを時刻順に、それぞれの発生時刻で発火する */
export function advanceClock(
  state: PlayState,
  scenario: Scenario,
  minutes: number,
  cues: Cue[],
): void {
  if (minutes <= 0) return;
  const from = cloneTime(state.clock);
  const to = addMinutes(state.clock, minutes);
  cues.push({ kind: 'clock', from, to });
  const events = [...(scenario.roles[state.role]?.events ?? [])].sort(
    (a, b) => toAbs(a.at) - toAbs(b.at),
  );
  const fromAbs = toAbs(from);
  const toAbsValue = toAbs(to);
  for (const event of events) {
    const at = toAbs(event.at);
    if (at <= fromAbs || at > toAbsValue) continue;
    if (state.flags[eventKey(event.id)]) continue;
    if (!conditionMet(event.when, state.flags)) continue;
    moveClockTo(state, event.at, cues);
    fireEvent(state, scenario, event, cues);
  }
  moveClockTo(state, to, cues);
  fireFlagVoices(state, scenario, state.pointId, cues);
}

export function findNextPoint(state: PlayState, scenario: Scenario): DecisionPoint | null {
  const points = scenario.roles[state.role]?.points ?? [];
  const current = state.pointId ? points.findIndex((p) => p.id === state.pointId) : -1;
  for (let i = current + 1; i < points.length; i++) {
    const point = points[i];
    if (!point) continue;
    if (conditionMet(point.when, state.flags)) return point;
  }
  return null;
}

/** 判断ポイントを表示する。at があれば時計を進め、フェーズ変化と声を処理する */
export function presentPoint(
  state: PlayState,
  scenario: Scenario,
  point: DecisionPoint,
  cues: Cue[],
): void {
  if (point.at && toAbs(point.at) > toAbs(state.clock)) {
    advanceClock(state, scenario, toAbs(point.at) - toAbs(state.clock), cues);
  }
  const previousIndex = PHASES.indexOf(state.phase);
  const nextIndex = PHASES.indexOf(point.phase);
  state.phase = point.phase;
  if (nextIndex > previousIndex) {
    applyDelayedDue(state, nextIndex, cues);
    const bgm = scenario.audio.bgmByPhase?.[point.phase] ?? scenario.audio.bgmDefault;
    cues.push({ kind: 'bgm', id: bgm });
  }
  state.pointId = point.id;
  firePointVoices(state, scenario, point, cues);
  for (const se of point.sound?.se ?? []) cues.push({ kind: 'se', id: se });
  fireFlagVoices(state, scenario, point.id, cues);
  updateDeadlines(state, scenario, cues);
}

export function endingNext(state: PlayState, scenario: Scenario): Next {
  return scenario.roles[state.role]?.pressEnabled ? 'press' : 'ending';
}

/** 次の判断ポイントへ進む。無ければ記者会見かエンディング */
export function stepNext(state: PlayState, scenario: Scenario, cues: Cue[]): StepResult {
  const point = findNextPoint(state, scenario);
  if (point) {
    presentPoint(state, scenario, point, cues);
    return { state, cues, next: 'point' };
  }
  state.pointId = null;
  return { state, cues, next: endingNext(state, scenario) };
}
