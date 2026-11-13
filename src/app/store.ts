// 画面共通の状態（オーケストレーター所有）。画面はここを読み書きする。
import { get, writable } from 'svelte/store';
import type { PlayState, Scenario, Settings, StepResult, Cue } from '../engine/types';
import { DEFAULT_SETTINGS } from '../storage';
import type { CueCaption, ShownCaption } from './parts/logic';
import { shiftCaption, withCaptionIds } from './parts/logic';

export type ScreenId =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10' | 'S11' | 'S12'
  | 'error';

export const screen = writable<ScreenId>('S01');
/** S10/S11 から戻る先 */
export const backTo = writable<ScreenId>('S01');
export const settings = writable<Settings>({ ...DEFAULT_SETTINGS });
export const scenario = writable<Scenario | null>(null);
export const play = writable<PlayState | null>(null);
/** 直近の演出キュー（App が受け取って audio / effects / 字幕に渡す） */
export const cues = writable<Cue[]>([]);
/** 表示待ちの字幕。先頭から順に出す */
export const captions = writable<ShownCaption[]>([]);
/** 表示済みの字幕（新しいものが先頭。履歴用） */
export const captionHistory = writable<ShownCaption[]>([]);
export const selectedScenarioId = writable<string | null>(null);
export const errorMessage = writable<string>('');

let captionSeq = 0;

/** 演出キューの字幕を待ち行列の末尾に積む */
export function enqueueCaptions(items: CueCaption[]): void {
  if (items.length === 0) return;
  const shown = withCaptionIds(items, captionSeq + 1);
  captionSeq += items.length;
  captions.update((queue) => [...queue, ...shown]);
}

/** 表示中の字幕を待ち行列から外し、履歴の先頭へ移す */
export function advanceCaption(captionId: number): void {
  const queue = get(captions);
  const next = shiftCaption(queue, captionId, get(captionHistory));
  if (next.queue === queue) return;
  captions.set(next.queue);
  captionHistory.set(next.history);
}

/** 新しいプレイを始めたときなどに、字幕の待ち行列と履歴を空にする */
export function resetCaptions(): void {
  captionSeq = 0;
  captions.set([]);
  captionHistory.set([]);
}

/** エンジンの結果を反映し、次の画面へ */
export function applyStep(r: StepResult): void {
  play.set(r.state);
  cues.set(r.cues);
  screen.set(r.next === 'point' ? 'S05' : r.next === 'draft' ? 'S06' : r.next === 'press' ? 'S07' : 'S08');
}
