// 画面共通の状態（オーケストレーター所有）。画面はここを読み書きする。
import { writable } from 'svelte/store';
import type { PlayState, Scenario, Settings, StepResult, Cue } from '../engine/types';
import { DEFAULT_SETTINGS } from '../storage';

export type ScreenId =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10' | 'S11' | 'error';

export const screen = writable<ScreenId>('S01');
/** S10/S11 から戻る先 */
export const backTo = writable<ScreenId>('S01');
export const settings = writable<Settings>({ ...DEFAULT_SETTINGS });
export const scenario = writable<Scenario | null>(null);
export const play = writable<PlayState | null>(null);
/** 直近の演出キュー（S05 が受け取って audio / effects に渡す） */
export const cues = writable<Cue[]>([]);
export const selectedScenarioId = writable<string | null>(null);
export const errorMessage = writable<string>('');

/** エンジンの結果を反映し、次の画面へ */
export function applyStep(r: StepResult): void {
  play.set(r.state);
  cues.set(r.cues);
  screen.set(r.next === 'point' ? 'S05' : r.next === 'draft' ? 'S06' : r.next === 'press' ? 'S07' : 'S08');
}
