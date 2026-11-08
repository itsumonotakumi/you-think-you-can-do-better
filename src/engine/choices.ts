// 選択と文案作成の適用（6.4）。引数の state は変更しない。
import type {
  Choice,
  Cue,
  DecisionPoint,
  DetailItem,
  DraftSlot,
  PlayState,
  RoleScript,
  Scenario,
  StepResult,
} from './types';
import { AVALANCHE_FLAME_JUMP, COWARD_PENALTY, STAMINA_BLUR } from './types';
import { advanceClock, stepNext } from './events';
import { applyGauges } from './gauges';
import { isNight, toAbs } from './clock';
import { reserveDelayed } from './delayed';
import { updateDeadlines } from './deadlines';
import { fireAfterVoices, fireFlagVoices, fireVoice } from './voices';
import { currentPoint } from './state';

type AnyDraftItem = DetailItem & {
  when?: { withinHours?: number; otherwise?: boolean };
  delayed?: Parameters<typeof reserveDelayed>[3];
};

function roleScript(scenario: Scenario, state: PlayState): RoleScript {
  const script = scenario.roles[state.role];
  if (!script) throw new Error(`role script not found: ${state.role}`);
  return script;
}

function requirePoint(state: PlayState, scenario: Scenario): DecisionPoint {
  const point = currentPoint(state, scenario);
  if (!point) throw new Error('no current point');
  return point;
}

export function choose(state: PlayState, scenario: Scenario, choiceId: string): StepResult {
  const next = structuredClone(state);
  const point = requirePoint(next, scenario);
  const choice: Choice | undefined = point.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`choice not found: ${choiceId}`);

  const cues: Cue[] = [];
  const script = roleScript(scenario, next);
  const voicesBefore = next.voicesShown
    .filter((v) => v.pointId === point.id)
    .map((v) => v.voiceId);
  const clockBefore = { ...next.clock };
  const flameBefore = next.gauges.flame;

  // 1. 方針点（fatal 済みの increase は fatalAlternate）
  const policyPoints =
    choice.category === 'increase' && next.fatal
      ? choice.fatalAlternate ?? choice.points
      : choice.points;
  // 2. 致命的な失点
  if (choice.category === 'fatal') next.fatal = true;
  if (choice.setFlags) Object.assign(next.flags, choice.setFlags);

  // 3. ゲージ（深夜帯は体力の減りが 1.5 倍）
  next.gauges = applyGauges(next.gauges, choice.gauges ?? {}, isNight(next.clock));

  // 細目
  let itemPoints = 0;
  for (const item of choice.items ?? []) {
    itemPoints += item.points;
    if (!next.itemsEarned.includes(item.id)) next.itemsEarned.push(item.id);
  }
  next.rawScore += policyPoints + itemPoints;

  // 5. 臆病ゲージ
  next.cowardStreak = choice.coward ? next.cowardStreak + 1 : 0;
  if (choice.coward && next.cowardStreak >= 2) {
    const key: '2' | '3' | '4' =
      next.cowardStreak >= 4 ? '4' : next.cowardStreak === 3 ? '3' : '2';
    next.rawScore += COWARD_PENALTY[key];
    const voiceId = script.cowardVoices?.[key];
    if (voiceId) fireVoice(next, scenario, voiceId, point.id, cues);
  }

  // 7. 遅れて来る効果の予約
  for (const spec of choice.delayed ?? []) {
    reserveDelayed(next, point.id, choice.id, spec);
  }

  // 8. 履歴
  next.history.push({
    pointId: point.id,
    choiceId: choice.id,
    at: clockBefore,
    policyPoints,
    itemPoints,
    voicesBefore,
  });

  // 直前の選択の後に出る声
  fireAfterVoices(next, scenario, point, choice.id, cues);

  // 時計を進める
  advanceClock(next, scenario, choice.minutes, cues);
  if (choice.minutes >= 120) cues.push({ kind: 'fx', id: 'fastforward' });
  updateDeadlines(next, scenario, cues);

  // 4. 体力不足のぼかし
  if (next.gauges.stamina < STAMINA_BLUR) cues.push({ kind: 'fx', id: 'blur' });
  // 通知の雪崩
  if (next.gauges.flame - flameBefore >= AVALANCHE_FLAME_JUMP) {
    cues.push({ kind: 'fx', id: 'avalanche' });
  }
  fireFlagVoices(next, scenario, point.id, cues);

  if (choice.detail) {
    next.pendingDraft = choice.detail;
    return { state: next, cues, next: 'draft' };
  }
  return stepNext(next, scenario, cues);
}

function pickDraftItem(
  slot: DraftSlot,
  elapsedMinutes: number,
  selections: Record<string, string>,
): AnyDraftItem | null {
  const items = (slot.items ?? slot.options ?? []) as AnyDraftItem[];
  if (slot.auto) {
    for (const item of items) {
      const when = item.when;
      if (when?.withinHours !== undefined && elapsedMinutes <= when.withinHours * 60) return item;
    }
    for (const item of items) {
      if (item.when?.otherwise) return item;
    }
    return null;
  }
  const selected = selections[slot.id];
  if (!selected) return null;
  return items.find((item) => item.id === selected) ?? null;
}

function addMissed(state: PlayState, id: string): void {
  if (state.itemsEarned.includes(id) || state.itemsMissed.includes(id)) return;
  state.itemsMissed.push(id);
}

export function submitDraft(
  state: PlayState,
  scenario: Scenario,
  selections: Record<string, string>,
): StepResult {
  const next = structuredClone(state);
  const script = roleScript(scenario, next);
  const key = next.pendingDraft;
  if (!key) throw new Error('no pending draft');
  const draft = script.drafts?.[key];
  if (!draft) throw new Error(`draft not found: ${key}`);

  const cues: Cue[] = [];
  const elapsedMinutes = Math.max(0, toAbs(next.clock) - toAbs(scenario.start));
  let itemPoints = 0;

  for (const slot of draft.slots) {
    const picked = pickDraftItem(slot, elapsedMinutes, selections);
    const items = (slot.items ?? slot.options ?? []) as AnyDraftItem[];
    for (const item of items) {
      if (picked && item.id === picked.id) {
        itemPoints += item.points;
        next.rawScore += item.points;
        if (!next.itemsEarned.includes(item.id)) next.itemsEarned.push(item.id);
      } else {
        addMissed(next, item.id);
      }
    }
    if (picked?.delayed) {
      const sourcePointId = next.pointId ?? next.history[next.history.length - 1]?.pointId ?? '';
      reserveDelayed(next, sourcePointId, picked.id, picked.delayed);
    }
  }

  const record = [...next.history].reverse().find((r) => r.pointId === next.pointId);
  if (record) record.itemPoints += itemPoints;

  next.pendingDraft = null;
  fireFlagVoices(next, scenario, next.pointId, cues);

  return stepNext(next, scenario, cues);
}
