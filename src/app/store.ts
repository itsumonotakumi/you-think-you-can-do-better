// 画面共通の状態（オーケストレーター所有）。画面はここを読み書きする。
import { get, writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { Cue, PlayState, Scenario, Settings, StepResult } from '../engine/types';
import { audio } from '../audio';
import { loadScenario } from '../data/loader';
import { setPendingNotice, versionChangedNotice } from '../i18n';
import { DEFAULT_SETTINGS } from '../storage';
import {
  clearResume, loadLastPlay, loadProgress, loadResume, saveProgress, saveResume,
} from '../storage';
import type { ResumeScreenId } from '../storage';
import type { CueCaption, ShownCaption } from './parts/logic';
import { shiftCaption, versionChanged, withCaptionIds } from './parts/logic';

export type ScreenId =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10' | 'S11' | 'S12'
  | 'error';

export type TitleOverlay = 'achievements' | null;

const innerScreen = writable<ScreenId>('S01');
const innerOverlay = writable<TitleOverlay>(null);

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

// ---------------- 再読み込みで同じ画面に戻すための保存 ----------------

const PLAY_SCREENS: readonly ResumeScreenId[] = ['S02', 'S05', 'S06', 'S07'];
const RESULT_SCREENS: readonly ResumeScreenId[] = ['S08', 'S09', 'S12'];

function isResumeScreenId(id: ScreenId): id is ResumeScreenId {
  // エラー画面は保存しない（直前にいた画面の保存を残し、再読み込みでそこへ戻す）
  return id !== 'error';
}

/** 保存したプレイの状態から、再開する画面を決める（終了 > 会見 > 文案 > 本編） */
export function playScreenOf(state: PlayState): 'S05' | 'S06' | 'S07' | 'S08' {
  if (state.finished) return 'S08';
  if (state.press) return 'S07';
  if (state.pendingDraft) return 'S06';
  return 'S05';
}

/** いまの画面と、その画面に戻るのに要る情報を保存する */
export function saveResumePoint(): void {
  const current = get(innerScreen);
  if (!isResumeScreenId(current)) return;
  const state = get(play);
  const isPlay = (PLAY_SCREENS as readonly string[]).includes(current);
  const isResult = (RESULT_SCREENS as readonly string[]).includes(current);
  const back = get(backTo);
  saveResume({
    screen: current,
    scenarioId: isPlay || isResult
      ? state?.scenarioId ?? null
      : current === 'S04' ? get(selectedScenarioId) : null,
    backTo: isResumeScreenId(back) ? back : 'S01',
    playRef: isResult && state?.finished ? state.startedAt : null,
    overlay: current === 'S01' ? get(innerOverlay) : null,
  });
}

function setScreen(value: ScreenId): void {
  // タイトルを離れたら、重ねて開いていた画面は閉じたものとして扱う
  if (get(innerScreen) === 'S01' && value !== 'S01') innerOverlay.set(null);
  innerScreen.set(value);
  saveResumePoint();
}

function setOverlay(value: TitleOverlay): void {
  innerOverlay.set(value);
  if (get(innerScreen) === 'S01') saveResumePoint();
}

/** 画面。移るたびに保存し、再読み込み後は restoreSession が同じ画面へ戻す */
export const screen: Writable<ScreenId> = {
  subscribe: innerScreen.subscribe,
  set: setScreen,
  update(fn) {
    setScreen(fn(get(innerScreen)));
  },
};

/** タイトルの上に重ねる画面（称号）。開いたまま再読み込みしても戻せるようにする */
export const titleOverlay: Writable<TitleOverlay> = {
  subscribe: innerOverlay.subscribe,
  set: setOverlay,
  update(fn) {
    setOverlay(fn(get(innerOverlay)));
  },
};

function toTitle(): void {
  play.set(null);
  scenario.set(null);
  screen.set('S01');
}

/** 保存した曲を決めるだけ決めておく（実際に鳴るのは最初の操作の後） */
function queueRestoredBgm(state: PlayState, sc: Scenario): void {
  const bgm = state.press ? 'press' : sc.audio.bgmByPhase?.[state.phase] ?? sc.audio.bgmDefault;
  audio.playBgm(bgm);
}

/**
 * localStorage の保存から、再読み込み前の画面へ戻す。mount の前に呼ぶ。
 * 保存が壊れている・シナリオが読めないときはタイトルへ戻す（例外にはしない）。
 */
export async function restoreSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  const saved = loadResume();
  if (!saved) return;

  try {
    switch (saved.screen) {
      case 'S01':
        titleOverlay.set(saved.overlay === 'achievements' ? 'achievements' : null);
        screen.set('S01');
        return;
      case 'S03':
        selectedScenarioId.set(null);
        screen.set('S03');
        return;
      case 'S04':
        if (!saved.scenarioId) {
          toTitle();
          return;
        }
        await loadScenario(saved.scenarioId);
        selectedScenarioId.set(saved.scenarioId);
        screen.set('S04');
        return;
      case 'S10':
      case 'S11':
        backTo.set(saved.backTo);
        screen.set(saved.screen);
        return;
      case 'S02':
      case 'S05':
      case 'S06':
      case 'S07': {
        const state = loadProgress();
        if (!state || state.finished) {
          saveProgress(null);
          toTitle();
          return;
        }
        const sc = await loadScenario(state.scenarioId);
        if (versionChanged(state, sc)) {
          // 版が変わった続きは遊べない。遊び直しはシナリオ選択から
          saveProgress(null);
          setPendingNotice(versionChangedNotice(get(settings).lang));
          screen.set('S03');
          return;
        }
        scenario.set(sc);
        selectedScenarioId.set(state.scenarioId);
        play.set(state);
        queueRestoredBgm(state, sc);
        screen.set(saved.screen === 'S02' ? 'S02' : playScreenOf(state));
        return;
      }
      case 'S08':
      case 'S09':
      case 'S12': {
        if (saved.playRef === null) {
          if (saved.screen === 'S12') {
            screen.set('S12');
            return;
          }
          toTitle();
          return;
        }
        const last = loadLastPlay();
        if (!last || last.startedAt !== saved.playRef) {
          toTitle();
          return;
        }
        const sc = await loadScenario(last.state.scenarioId);
        scenario.set(sc);
        selectedScenarioId.set(last.state.scenarioId);
        play.set(last.state);
        screen.set(saved.screen);
        return;
      }
      default:
        clearResume();
        toTitle();
    }
  } catch {
    // 保存データが壊れている・シナリオが読めない場合はタイトルへ
    clearResume();
    toTitle();
  }
}

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
