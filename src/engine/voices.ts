// 世間の声の発火。misleading / type は演出キューに一切入れない（10章）。
import type { Cue, DecisionPoint, Flags, PlayState, Scenario, Voice } from './types';
import { MEDIA_SE } from './types';
import { cloneTime } from './clock';

export function roleVoices(scenario: Scenario, state: PlayState): Voice[] {
  return scenario.roles[state.role]?.voices ?? [];
}

function findVoice(scenario: Scenario, state: PlayState, voiceId: string): Voice | null {
  return roleVoices(scenario, state).find((v) => v.id === voiceId) ?? null;
}

/**
 * 声を1つ発火する。媒体ごとの効果音を鳴らし、表示履歴に残す。
 * 炎上度70以上なら新しい批判として揺れを出す。
 */
export function fireVoice(
  state: PlayState,
  scenario: Scenario,
  voiceId: string,
  pointId: string | null,
  cues: Cue[],
): boolean {
  const voice = findVoice(scenario, state, voiceId);
  if (!voice) return false;
  state.voicesShown.push({ voiceId: voice.id, at: cloneTime(state.clock), pointId });
  cues.push({ kind: 'voice', voiceId: voice.id, media: voice.media });
  const se = MEDIA_SE[voice.media];
  if (se) cues.push({ kind: 'se', id: se });
  if (state.gauges.flame >= 70) cues.push({ kind: 'fx', id: 'shake' });
  return true;
}

function shown(state: PlayState, voiceId: string): boolean {
  return state.voicesShown.some((v) => v.voiceId === voiceId);
}

/** 判断ポイントの表示時に、trigger が point の声を発火する */
export function firePointVoices(
  state: PlayState,
  scenario: Scenario,
  point: DecisionPoint,
  cues: Cue[],
): void {
  for (const voiceId of point.voices ?? []) {
    const voice = findVoice(scenario, state, voiceId);
    if (!voice) continue;
    if (!('at' in voice.trigger) || voice.trigger.at !== 'point') continue;
    fireVoice(state, scenario, voice.id, point.id, cues);
  }
}

/** 選択直後に、trigger が after の声を発火する */
export function fireAfterVoices(
  state: PlayState,
  scenario: Scenario,
  point: DecisionPoint,
  choiceId: string,
  cues: Cue[],
): void {
  for (const voice of roleVoices(scenario, state)) {
    const trigger = voice.trigger;
    if (!('at' in trigger) || trigger.at !== 'after') continue;
    if (trigger.choice !== undefined && trigger.choice !== choiceId) continue;
    fireVoice(state, scenario, voice.id, point.id, cues);
  }
}

/** flags 条件が真になった声を一度だけ発火する */
export function fireFlagVoices(
  state: PlayState,
  scenario: Scenario,
  pointId: string | null,
  cues: Cue[],
): void {
  for (const voice of roleVoices(scenario, state)) {
    const trigger = voice.trigger;
    if (!('flags' in trigger) || !trigger.flags) continue;
    if (shown(state, voice.id)) continue;
    if (!flagsMatch(trigger.flags, state.flags)) continue;
    fireVoice(state, scenario, voice.id, pointId, cues);
  }
}

export function flagsMatch(cond: Flags | undefined, flags: Flags): boolean {
  if (!cond) return true;
  return Object.entries(cond).every(([key, value]) => (flags[key] ?? false) === value);
}
