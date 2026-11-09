// 画面演出（設計書 10.4）。document.documentElement に fx-<id> クラスを付け外しする。
// CSS は src/app/effects/effects.css。クラス名は fx-<FxId>。
import type { Cue, FxId } from '../../engine/types';

/** reduceMotion で止める演出（揺れ・フラッシュ・早送り） */
const MOTION_FX: readonly FxId[] = ['shake', 'flash', 'fastforward'];

/** 自動で外す演出と、その時間（ms） */
const TRANSIENT_MS: Partial<Record<FxId, number>> = {
  shake: 300,
  flash: 200,
  avalanche: 600,
};

const timers = new Map<FxId, ReturnType<typeof setTimeout>>();
/** フラッシュの最短間隔。1秒に3回を超える明滅を避ける */
let lastFlashAt = Number.NEGATIVE_INFINITY;
const FLASH_MIN_INTERVAL_MS = 340;

/** documentElement に付きうる演出クラス */
const FX_IDS: readonly FxId[] = [
  'avalanche', 'shake', 'night', 'fastforward', 'deadline', 'flash', 'blur', 'stamp',
];

function className(id: FxId): string {
  return `fx-${id}`;
}

function clearTimer(id: FxId): void {
  const t = timers.get(id);
  if (t !== undefined) {
    clearTimeout(t);
    timers.delete(id);
  }
}

export function runFx(id: FxId, on = true): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;

  const cls = className(id);
  clearTimer(id);

  if (!on) {
    root.classList.remove(cls);
    return;
  }

  if (id === 'flash') {
    const now = typeof performance === 'undefined' ? 0 : performance.now();
    if (now - lastFlashAt < FLASH_MIN_INTERVAL_MS) return;
    lastFlashAt = now;
  }

  // アニメーションを最初からやり直す（連続発火でも1回だけ再生する）
  root.classList.remove(cls);
  void root.offsetWidth;
  root.classList.add(cls);

  const duration = TRANSIENT_MS[id];
  if (duration !== undefined) {
    timers.set(id, setTimeout(() => {
      root.classList.remove(cls);
      timers.delete(id);
    }, duration));
  }
}

/** 演出キューの fx 部分だけを処理。reduceMotion なら揺れ・フラッシュ・早送りを止める */
export function runFxCues(cues: Cue[], reduceMotion: boolean): void {
  for (const cue of cues) {
    if (cue.kind !== 'fx') continue;
    if (reduceMotion && MOTION_FX.includes(cue.id)) continue;
    runFx(cue.id, cue.on ?? true);
  }
}

/**
 * 付いている演出クラスを外す。画面遷移のたびに呼び、
 * 結果画面などに早送りの横縞が残らないようにする。
 * keep に挙げたものだけは残す（プレイ中をまたぐ深夜・期限の色など）。
 */
export function clearFx(keep: readonly FxId[] = []): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;
  for (const id of FX_IDS) {
    clearTimer(id);
    if (keep.includes(id)) continue;
    root.classList.remove(className(id));
  }
}
