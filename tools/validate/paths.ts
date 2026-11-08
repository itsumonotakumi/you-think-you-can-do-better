// C11〜C13 用の経路シミュレーション。
//
// 実エンジンを走らせて、
//   - 方針別（最大点・最小点・fatal 回避・fatal 1回）の決定的な走行
//   - シナリオIDから作るシード付き疑似乱数で選択・文案・会見の回答を選ぶ走行
// を流す。同じ（判断ID・旗・ゲージの帯・fatal・点数帯）の状態に何度も入る走行は打ち切る。
// 訪問回数は走行ごとに数える（走行をまたいで共有すると、先に走った数本で後の走行が
// 打ち切られ、実際には到達できるランクを見落とす）。
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
  PlayState,
  PressAnswer,
  Rank,
  Reference,
  RoleId,
  Scenario,
} from '../../src/engine/types.ts';

const STARTED_AT = '2026-11-08T00:00:00.000Z';
export const MAX_STEPS = 500;
/** 検査で流すランダム走行の本数（1シナリオ×ロールあたり） */
export const RANDOM_RUNS_PER_ROLE = 2000;

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

export interface PathOptions {
  /** ランダム走行の本数（0 なら方針別の走行だけ） */
  randomRuns?: number;
  /** ランダム走行の種。省略時はシナリオIDとロールから作る */
  seed?: number;
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
/** 同じ状態を1回の走行で何回まで通すか（これを超えた走行は打ち切る） */
const MAX_STATE_VISITS = 8;

// ---------------- シード付き疑似乱数（mulberry32） ----------------

/** FNV-1a。シナリオIDとロールから決定的な種を作る */
export function seedFor(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomIndex(length: number, rng: () => number): number {
  if (length <= 1) return 0;
  const value = Math.floor(rng() * length);
  return value < 0 ? 0 : value >= length ? length - 1 : value;
}

/** 同じ続きになる状態を打ち切るための目印（設計11章: フラグ・ゲージの帯・fatal） */
export function pathStateKey(state: PlayState): string {
  const flags = Object.keys(state.flags)
    .filter((key) => state.flags[key])
    .sort()
    .join(',');
  const gauges = state.gauges;
  return [
    state.pointId ?? '-',
    flags,
    state.fatal ? 'fatal' : '-',
    Math.floor(gauges.damage / 20),
    Math.floor(gauges.flame / 20),
    Math.floor(gauges.trust / 20),
    Math.floor(gauges.stamina / 20),
    Math.floor(state.rawScore / 200),
  ].join('|');
}

// ---------------- 方針別の選択 ----------------

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

// ---------------- ランダム走行の選択 ----------------

function randomDraft(draft: Draft, rng: () => number): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const slot of draft.slots) {
    if (slot.auto) continue;
    const candidates: { id: string }[] = slot.options ?? slot.items ?? [];
    if (candidates.length === 0) continue;
    const picked = candidates[randomIndex(candidates.length, rng)];
    if (picked) selections[slot.id] = picked.id;
  }
  return selections;
}

// ---------------- 1回の走行 ----------------

interface RunOptions {
  policy: PathPolicy;
  /** null なら各判断で方針どおりの最善候補。数値なら (判断の番号 + 値) % 候補数 */
  choiceShift: number | null;
  draftShift: number | null;
  maxSteps: number;
  /** random なら選択・文案・会見の回答を乱数で選ぶ */
  mode: 'policy' | 'random';
  rng: () => number;
  /** ランダム走行で、同じ状態に入った回数を数えて打ち切るか（表は走行ごとに作る） */
  prune: boolean;
  /** ランダム走行の表示名 */
  label?: string;
}

type RunResult = PathRun | null;

function playOne(
  scenario: Scenario,
  refs: Reference[],
  role: RoleId,
  options: RunOptions,
): RunResult {
  const label = options.mode === 'random'
    ? options.label ?? 'random'
    : `${options.policy}/${options.choiceShift === null ? 'best' : `k${options.choiceShift}`}`;
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
  // 訪問回数表は走行ごとに作る（共有すると先の走行が後の走行を打ち切ってしまう）
  const seen: Map<string, number> | null = options.prune ? new Map<string, number>() : null;

  const tick = () => {
    steps += 1;
    if (steps > options.maxSteps) throw new Error(`${options.maxSteps} ステップ以内にエンディングに着きません`);
  };

  /** 同じ状態に何度も入る走行は打ち切る（上限まで同じ状態を許す） */
  const pruned = (candidate: PlayState): boolean => {
    if (!seen) return false;
    const key = pathStateKey(candidate);
    const count = seen.get(key) ?? 0;
    if (count >= MAX_STATE_VISITS) return true;
    seen.set(key, count + 1);
    return false;
  };

  while (next !== 'ending') {
    if (next === 'point') {
      const point = engine.currentPoint(state, scenario);
      if (!point) throw new Error('判断ポイントが見つかりません');
      const choice = options.mode === 'random'
        ? at(point.choices, randomIndex(point.choices.length, options.rng))
        : pickChoice(point, options.policy, pointIndex, options.choiceShift, taken);
      picks.push(`${point.id}:${choice.id}`);
      pointIndex += 1;
      tick();
      const step = engine.choose(state, scenario, choice.id);
      state = step.state;
      next = step.next;
      if (pruned(state)) return null;
      continue;
    }

    if (next === 'draft') {
      const key = state.pendingDraft;
      const drafts = scenario.roles[role]?.drafts;
      const draft = key && drafts && Object.hasOwn(drafts, key) ? drafts[key] : undefined;
      if (!draft) throw new Error(`文案が見つかりません: ${key ?? '(なし)'}`);
      tick();
      const selections = options.mode === 'random'
        ? randomDraft(draft, options.rng)
        : pickDraft(draft, options.policy, options.draftShift);
      const step = engine.submitDraft(state, scenario, selections);
      state = step.state;
      next = step.next;
      if (pruned(state)) return null;
      continue;
    }

    if (next === 'press') {
      tick();
      const opened = engine.startPress(state, scenario);
      state = opened.state;
      next = opened.next;
      while (next === 'press') {
        const answers = engine.availableAnswers(state, scenario);
        const answer = options.mode === 'random'
          ? (answers.length === 0 ? null : at(answers, randomIndex(answers.length, options.rng)))
          : pickAnswer(answers, options.policy, answerIndex, options.choiceShift);
        answerIndex += 1;
        tick();
        const step = engine.answerPress(state, scenario, answer?.id ?? null);
        state = step.state;
        next = step.next;
      }
      if (pruned(state)) return null;
      continue;
    }

    throw new Error(`未知の遷移: ${String(next)}`);
  }

  // 記者会見なしで終わった経路でも、遅延効果と未完了の期限を必ず反映してから採点する
  const finalized = engine.finalizeBeforeEnding(state, scenario);
  const result = engine.computeResult(finalized, scenario);
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

/** 方針別の走行と、シード付き乱数の走行を流す。engine が例外を投げた走行は failures に入れる。 */
export function simulatePaths(
  scenario: Scenario,
  refs: Reference[],
  role: RoleId,
  maxSteps: number = MAX_STEPS,
  options: PathOptions = {},
): PathSimulation {
  const runs: PathRun[] = [];
  const failures: PathFailure[] = [];
  const randomRuns = options.randomRuns ?? 0;
  const rng = mulberry32(options.seed ?? seedFor(`${scenario.id}/${role}`));

  const attempt = (runOptions: RunOptions, label: string) => {
    try {
      const run = playOne(scenario, refs, role, runOptions);
      if (run) runs.push(run);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ label, message });
    }
  };

  for (const policy of POLICIES) {
    // 方針どおりの最善手
    attempt(
      { policy, choiceShift: null, draftShift: null, maxSteps, mode: 'policy', rng, prune: false },
      `${policy}/best`,
    );
    // 各判断で第 k 候補を選ぶ決定的な変種
    for (const shift of SHIFTS) {
      attempt(
        { policy, choiceShift: shift, draftShift: shift, maxSteps, mode: 'policy', rng, prune: false },
        `${policy}/k${shift}`,
      );
    }
  }

  for (let i = 0; i < randomRuns; i += 1) {
    const label = `random/${i + 1}`;
    attempt(
      { policy: 'max', choiceShift: null, draftShift: null, maxSteps, mode: 'random', rng, prune: true, label },
      label,
    );
  }

  return { runs, failures };
}
