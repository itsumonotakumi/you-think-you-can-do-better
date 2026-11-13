// 「全国の◯%がこれを選んだ」の計算（#7）。振り返り画面だけで使う。
import type { ChoiceStatsResponse } from '../../engine/types';

/**
 * 判断ポイントと選択肢の選択率（%）。
 * 無い・壊れている・範囲外なら null（表示しない）。
 */
export function choicePercent(
  stats: ChoiceStatsResponse | null,
  pointId: string,
  choiceId: string,
): number | null {
  if (!stats || typeof pointId !== 'string' || typeof choiceId !== 'string') return null;
  if (!Object.hasOwn(stats.points, pointId)) return null;
  const row = stats.points[pointId];
  if (!row || typeof row !== 'object' || !Object.hasOwn(row, choiceId)) return null;
  const value = row[choiceId];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(Math.min(100, value));
}
