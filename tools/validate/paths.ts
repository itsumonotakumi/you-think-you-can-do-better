// C11〜C13 用の経路シミュレーション（簡略版）。
//
// 全経路の厳密探索はしない。実エンジンを貪欲に走らせて、
// 「最大点」「最小点」「fatal を避けた最大点」「fatal を1つだけ含む最大点」の方針と、
// 判断ポイントごとに (i + k) % n で第 k 候補を選ぶ決定的な変種を数十本流す。
//
// 注意: node --experimental-strip-types は拡張子なしの import を解決できない。
// engine の各ファイルは拡張子なしで import しているため、実行時だけ解決フックを足す
// （Vitest では Vite が解決するのでフックは使われない）。
// @ts-ignore node:module の型は tools/validate/node-shims.d.ts に無い（実行時のみ使う）
import * as nodeModule from 'node:module';
import type {
  Choice,
  DecisionPoint,
  Draft,
  DraftSlot,
  PressAnswer,
  Rank,
  Reference,
  RoleId,
  Scenario,
} from '../../src/engine/types.ts';

const STARTED_AT = '2026-11-08T00:00:00.000Z';
export const MAX_STEPS = 500;

export type PathPolicy = 'max' | 'min' | 'avoid-fatal' | 'one-fatal';

export interface PathRun {
  label: string;
  rank: Rank;
  official: number;
  fatal: boolean;
  steps: number;
  finished: boolean;
  /** "判断ID:選択肢ID" の並び（失敗時の調査用） */
  picks: string[];
}

export interface PathFailure {
  label: string;
  message: string;
}

export interface PathSimulation {
  runs: PathRun[];
  failures: PathFailure[];
}

type UrlCtor = new (input: string, base: string) => { href: string };

try {
  const registerHooks = (nodeModule as { registerHooks?: (hooks: unknown) => void }).registerHooks;
  const Url = (globalThis as { URL?: UrlCtor }).URL;
  if (registerHooks && Url) {
    registerHooks({
      resolve(
        specifier: string,
        context: { parentURL?: string },
        nextResolve: (s: string, c: unknown) => unknown,
      ) {
        const last = specifier.split('/').pop() ?? '';
        const relative = specifier.startsWith('./') || specifier.startsWith('../');
        if (relative && !last.includes('.') && context.parentURL?.endsWith('.ts')) {
          return { url: new Url(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
    });
  }
} catch {
  // フックを登録できない環境では通常の解決に任せる
}

const engine: typeof import('../../src/engine/index.ts') = await import('../../src/engine/index.ts');

const POLICIES: readonly PathPolicy[] = ['max', 'min', 'avoid-fatal', 'one-fatal'];
const SHIFTS = [0, 1, 2, 3];

function orderByPoints<T extends { points: number }>(list: T[], policy: PathPolicy): T[] {
  const direction = policy === 'min' ? 1 : -1;
  return [...list].sort((a, b) => (a.points - b.points) * direction);
}

function at<T>(list: T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error('候補がありません');
  return value;
}

function pickChoice(
  point: DecisionPoint,
  policy: PathPolicy,
  index: number,
  shift: number | null,
  taken: { fatal: boolean },
): Choice {
  let choices = point.choices;
  if (choices.length === 0) throw new Error(`選択肢がありません: ${point.id}`);

  if (policy === 'avoid-fatal') {
    const safe = choices.filter((choice) => choice.category !== 'fatal');
    if (safe.length > 0) choices = safe;
  }
  if (policy === 'one-fatal') {
    if (!taken.fatal) {
      const fatals = choices.filter((choice) => choice.category === 'fatal');
      if (fatals.length > 0) {
        taken.fatal = true;
        return at(orderByPoints(fatals, 'max'), 0);
      }
    } else {
      const safe = choices.filter((choice) => choice.category !== 'fatal');
      if (safe.length > 0) choices = safe;
    }
  }

  const ordered = orderByPoints(choices, policy);
  const position = shift === null ? 0 : (index + shift) % ordered.length;
  return at(ordered, position);
}

function pickDraft(draft: Draft, policy: PathPolicy, shift: number | null): Record<string, string> {
  const selections: Record<string, string> = {};
  draft.slots.forEach((slot: DraftSlot, index) => {
    if (slot.auto) return;
    const candidates: { id: string; points: number }[] = slot.options ?? slot.items ?? [];
    if (candidates.length === 0) return;
    const ordered = orderByPoints(candidates, policy);
    const position = shift === null ? 0 : (index + shift) % ordered.length;
    selections[slot.id] = at(ordered, position).id;
  });
  return selections;
}

function pickAnswer(
  answers: PressAnswer[],
  policy: PathPolicy,
  index: number,
  shift: number | null,
): PressAnswer | null {
  if (answers.length === 0) return null;
  const ordered = orderByPoints(answers, policy);
  const position = shift === null ? 0 : (index + shift) % ordered.length;
  return at(ordered, position);
}

interface RunOptions {
  policy: PathPolicy;
  /** null なら各判断で方針どおりの最善候補。数値なら (判断の番号 + 値) % 候補数 */
  choiceShift: number | null;
  draftShift: number | null;
  maxSteps: number;
}

function playOne(
  scenario: Scenario,
  refs: Reference[],
  role: RoleId,
  options: RunOptions,
): PathRun {
  const label = `${options.policy}/${options.choiceShift === null ? 'best' : `k${options.choiceShift}`}`;
  const started = engine.startPlay(
    scenario,
    role,
    1,
    { comment: '', predictedHours: null },
    STARTED_AT,
    refs,
  );
  let state = started.state;
  let next = started.next;
  let steps = 0;
  let pointIndex = 0;
  let answerIndex = 0;
  const picks: string[] = [];
  const taken = { fatal: false };

  const tick = () => {
    steps += 1;
    if (steps > options.maxSteps) throw new Error(`${options.maxSteps} ステップ以内にエンディングに着きません`);
  };

  while (next !== 'ending') {
    if (next === 'point') {
      const point = engine.currentPoint(state, scenario);
      if (!point) throw new Error('判断ポイントが見つかりません');
      const choice = pickChoice(point, options.policy, pointIndex, options.choiceShift, taken);
      picks.push(`${point.id}:${choice.id}`);
      pointIndex += 1;
      tick();
      const step = engine.choose(state, scenario, choice.id);
      state = step.state;
      next = step.next;
      continue;
    }

    if (next === 'draft') {
      const key = state.pendingDraft;
      const draft = key ? scenario.roles[role]?.drafts?.[key] : undefined;
      if (!draft) throw new Error(`文案が見つかりません: ${key ?? '(なし)'}`);
      tick();
      const step = engine.submitDraft(state, scenario, pickDraft(draft, options.policy, options.draftShift));
      state = step.state;
      next = step.next;
      continue;
    }

    if (next === 'press') {
      tick();
      const opened = engine.startPress(state, scenario);
      state = opened.state;
      next = opened.next;
      while (next === 'press') {
        const answers = engine.availableAnswers(state, scenario);
        const answer = pickAnswer(answers, options.policy, answerIndex, options.choiceShift);
        answerIndex += 1;
        tick();
        const step = engine.answerPress(state, scenario, answer?.id ?? null);
        state = step.state;
        next = step.next;
      }
      continue;
    }

    throw new Error(`未知の遷移: ${String(next)}`);
  }

  const result = engine.computeResult(state, scenario);
  return {
    label,
    rank: result.rank,
    official: result.official,
    fatal: result.fatal,
    steps,
    finished: true,
    picks,
  };
}

/** 決定的に数十本の経路を流す。engine が例外を投げた走行は failures に入れる。 */
export function simulatePaths(
  scenario: Scenario,
  refs: Reference[],
  role: RoleId,
  maxSteps: number = MAX_STEPS,
): PathSimulation {
  const runs: PathRun[] = [];
  const failures: PathFailure[] = [];

  const attempt = (policy: PathPolicy, choiceShift: number | null, draftShift: number | null) => {
    const options: RunOptions = { policy, choiceShift, draftShift, maxSteps };
    const label = `${policy}/${choiceShift === null ? 'best' : `k${choiceShift}`}`;
    try {
      runs.push(playOne(scenario, refs, role, options));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ label, message });
    }
  };

  for (const policy of POLICIES) {
    // 方針どおりの最善手
    attempt(policy, null, null);
    // 各判断で第 k 候補を選ぶ決定的な変種
    for (const shift of SHIFTS) attempt(policy, shift, shift);
  }

  return { runs, failures };
}
