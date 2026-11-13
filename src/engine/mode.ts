// 本番モード（#10）。時間の計測は画面が行い、時間切れの選択だけエンジンが決める。
// 乱数・現在時刻を使わないので、同じ判断なら必ず同じ選択になる。
import type { Choice, DecisionPoint } from './types';

/** 本番モードの1判断あたりの制限時間（秒）。設定（pressTimeScale）で延長できる */
export const HARD_SECONDS = 60;

/** 1判断の制限時間（秒）。倍率は 1 / 1.5 / 2 を想定し、それ以外は等倍に丸める */
export function decisionSeconds(scale: number): number {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.max(1, Math.round(HARD_SECONDS * factor));
}

/**
 * 時間切れ＝「判断の先送り」。その判断で最も消極的な選択を返す。
 * 臆病な選択（coward: true）があればその中で点数が最小のもの、無ければ全体で点数が最小のもの。
 * 同点は choices の並び順で先のものを選ぶ（決定的）。
 */
export function timeoutChoice(point: DecisionPoint): Choice | null {
  const cowards = point.choices.filter((choice) => choice.coward === true);
  const pool = cowards.length > 0 ? cowards : point.choices;
  let picked: Choice | null = null;
  for (const choice of pool) {
    if (picked === null || choice.points < picked.points) picked = choice;
  }
  return picked;
}
