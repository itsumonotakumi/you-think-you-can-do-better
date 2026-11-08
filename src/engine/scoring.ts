// 採点（設計書 6.6・6.7、テスト計画書 5.2）
import { PLAY_MULTIPLIER, RANK_THRESHOLDS } from "./types";
import type { EndingResult, PlayState, Rank, Scenario } from "./types";

/** 回数係数。1回目 1.2 / 2回目 1.0 / 3回目 0.8 / 4回目以降 0.6 */
export function multiplierFor(playCount: number): number {
  const index = Math.min(Math.max(Math.trunc(playCount) || 1, 1), PLAY_MULTIPLIER.length) - 1;
  return PLAY_MULTIPLIER[index] ?? 1;
}

/** 公式スコアからランクを決める。S は致命的な失点がないときだけ */
export function rankFor(official: number, fatal: boolean): Rank {
  if (!fatal && official >= RANK_THRESHOLDS.S) return "S";
  if (official >= RANK_THRESHOLDS.A) return "A";
  if (official >= RANK_THRESHOLDS.B) return "B";
  if (official >= RANK_THRESHOLDS.C) return "C";
  return "D";
}

/** 売上見通し（事件前比 %）。最終の信頼 = state.gauges.trust */
export function salesForecast(state: PlayState, scenario: Scenario): number {
  const model = scenario.salesModel;
  const trust = state.gauges.trust;
  let sales = model.base + (trust - 50) * model.trustWeight;
  if (state.fatal) sales -= model.fatalPenalty;
  return Math.round(Math.min(model.max, Math.max(model.min, sales)));
}

/** 結果の計算。state.finished でなくても計算できる純関数 */
export function computeResult(state: PlayState, scenario: Scenario): EndingResult {
  const raw = state.rawScore;
  const multiplier = multiplierFor(state.playCount);
  // 素点が 0 以下のときは係数を掛けない
  const official = raw > 0 ? Math.round(raw * multiplier) : raw;
  return {
    raw,
    multiplier,
    official,
    rank: rankFor(official, state.fatal),
    sales: salesForecast(state, scenario),
    fatal: state.fatal,
    playCount: state.playCount,
  };
}
