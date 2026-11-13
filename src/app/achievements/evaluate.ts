// 称号の判定（#9）。PlayState・Scenario・EndingResult・PlaysStore から決まる純粋関数。
// 乱数・現在時刻・外部通信は使わない（at は呼び出し側が渡す）。
import type {
  Achievement, EndingResult, PlayState, PlaysStore, RoleId, Scenario,
} from '../../engine/types';
import { ROLES } from '../../engine/types';
import { ACHIEVEMENTS } from './definitions';

export interface AchievementInput {
  state: PlayState;
  scenario: Scenario;
  result: EndingResult;
  plays: PlaysStore;
  /** 公開中のシナリオ id（全シナリオ制覇の判定に使う）。省略時はこの称号を判定しない */
  scenarioIds?: readonly string[];
  /** 既に獲得済みの称号 id。ここにあるものは返さない */
  earned?: readonly string[];
}

/** 最初の「通知・公表」の判断を終えた時刻までの時間（時間単位）。無ければ null */
export function firstReportHours(state: PlayState, scenario: Scenario): number | null {
  const role = scenario.roles[state.role];
  if (!role) return null;
  const history = Array.isArray(state.history) ? state.history : [];
  for (const record of history) {
    if (!record || typeof record !== 'object') continue;
    const point = role.points?.find((item) => item.id === record.pointId);
    if (!point || point.phase !== 'notify') continue;
    const choice = point.choices?.find((item) => item.id === record.choiceId);
    if (!choice) continue;
    const at = record.at;
    if (!at || typeof at.day !== 'number' || typeof at.minutes !== 'number') continue;
    const minutes = (at.day - scenario.start.day) * 1440
      + (at.minutes - scenario.start.minutes) + choice.minutes;
    return Math.max(0, minutes) / 60;
  }
  return null;
}

interface PlayTotals {
  totalPlays: number;
  /** シナリオ id → プレイしたロールと、S を取ったか */
  scenarios: Map<string, { roles: Set<RoleId>; hasS: boolean }>;
}

/** プレイ記録を、シナリオとロールの単位にまとめる */
export function playTotals(plays: PlaysStore): PlayTotals {
  const scenarios: PlayTotals['scenarios'] = new Map();
  let totalPlays = 0;
  for (const [key, record] of Object.entries(plays ?? {})) {
    if (!record || !Number.isFinite(record.count) || record.count <= 0) continue;
    const slash = key.lastIndexOf('/');
    if (slash <= 0) continue;
    const scenarioId = key.slice(0, slash);
    const role = key.slice(slash + 1);
    if (!(ROLES as readonly string[]).includes(role)) continue;
    totalPlays += record.count;
    const entry = scenarios.get(scenarioId) ?? { roles: new Set<RoleId>(), hasS: false };
    entry.roles.add(role as RoleId);
    if (record.best?.rank === 'S') entry.hasS = true;
    scenarios.set(scenarioId, entry);
  }
  return { totalPlays, scenarios };
}

/** 条件を満たす称号のうち、まだ獲得していないものを返す */
export function evaluateAchievements(input: AchievementInput): Achievement[] {
  const { state, scenario, result, plays } = input;
  const earned = new Set(input.earned ?? []);
  const totals = playTotals(plays);
  const hours = firstReportHours(state, scenario);
  const predicted = state.prologue?.predictedHours ?? null;
  const notes = Array.isArray(state.notes) ? state.notes : [];
  const earnedItems = Array.isArray(state.itemsEarned) ? state.itemsEarned : [];
  const missedItems = Array.isArray(state.itemsMissed) ? state.itemsMissed : [];
  const deadlines = Array.isArray(state.deadlines) ? state.deadlines : [];
  const press = state.press;
  const scenarioIds = input.scenarioIds ?? [];
  const elapsedDays = state.clock.day - scenario.start.day;

  const satisfied: Record<string, boolean> = {
    'first-clear': state.finished === true,
    'flame-zero': state.gauges.flame === 0,
    'fast-report': hours !== null && hours <= 72,
    'press-no-timeout': press !== null && Array.isArray(press.answers) && press.answers.length > 0
      && press.answers.every((answer) => answer.answerId !== null),
    'coward-zero': state.cowardStreak === 0,
    'no-fatal': result.fatal === false && state.fatal === false,
    'rank-s': result.rank === 'S',
    'hard-a': state.mode === 'hard' && (result.rank === 'S' || result.rank === 'A'),
    'items-complete': earnedItems.length > 0 && missedItems.length === 0,
    'deadline-all': deadlines.length > 0
      && deadlines.every((deadline) => deadline.done && !deadline.over),
    'notes-3': notes.length >= 3,
    'prediction-hit': predicted !== null && hours !== null && Math.abs(predicted - hours) <= 3,
    'long-haul': elapsedDays >= 2,
    'trust-70': state.gauges.trust >= 70,
    'damage-low': state.gauges.damage <= 20,
    'all-roles': [...totals.scenarios.values()].some((entry) => entry.roles.size >= ROLES.length),
    'scenarios-3': totals.scenarios.size >= 3,
    'rank-s-two': [...totals.scenarios.values()].filter((entry) => entry.hasS).length >= 2,
    'plays-10': totals.totalPlays >= 10,
    'plays-20': totals.totalPlays >= 20,
    'all-scenarios': scenarioIds.length > 0
      && scenarioIds.every((id) => totals.scenarios.has(id)),
    // 要件の「外野卒業」: 全シナリオを全4ロールで終える
    graduate: scenarioIds.length > 0
      && scenarioIds.every((id) => (totals.scenarios.get(id)?.roles.size ?? 0) >= ROLES.length),
  };

  return ACHIEVEMENTS
    .filter((def) => satisfied[def.id] === true && !earned.has(def.id))
    .map((def) => ({ id: def.id, title: def.title, description: def.description }));
}

/**
 * 新しく獲得した称号から、シェア画像に載せる代表を1つ選ぶ（#6）。
 * 重みが大きいもの、同じなら定義の並びで先のもの。
 */
export function representativeTitle(newOnes: readonly Achievement[]): Achievement | null {
  let best: Achievement | null = null;
  let bestWeight = Number.NEGATIVE_INFINITY;
  for (const item of newOnes) {
    const def = ACHIEVEMENTS.find((candidate) => candidate.id === item.id);
    const weight = def?.weight ?? 0;
    if (weight > bestWeight) {
      best = item;
      bestWeight = weight;
    }
  }
  return best;
}
