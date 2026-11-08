// 振り返りレポートの組み立て（設計書 5.4・5.5、テスト計画書 5.3）
import { computeResult } from "./scoring";
import type {
  Choice, DetailItem, PlayState, Report, ReportEntry, RoleId, RoleScript, Scenario,
} from "./types";

function roleScript(role: RoleId, scenario: Scenario): RoleScript | undefined {
  return scenario.roles[role];
}

function findChoice(role: RoleScript | undefined, choiceId: string): Choice | undefined {
  for (const point of role?.points ?? []) {
    const found = point.choices.find((choice) => choice.id === choiceId);
    if (found) return found;
  }
  return undefined;
}

/** ロール内のすべての細目（選択肢の items と、文案の items/options） */
export function allDetailItems(role: RoleScript | undefined): DetailItem[] {
  const items: DetailItem[] = [];
  for (const point of role?.points ?? []) {
    for (const choice of point.choices) items.push(...(choice.items ?? []));
  }
  for (const draft of Object.values(role?.drafts ?? {})) {
    for (const slot of draft.slots) {
      items.push(...(slot.items ?? []));
      items.push(...(slot.options ?? []));
    }
  }
  return items;
}

function detailById(role: RoleScript | undefined): Map<string, DetailItem> {
  const map = new Map<string, DetailItem>();
  for (const item of allDetailItems(role)) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return map;
}

export function buildReport(state: PlayState, scenario: Scenario): Report {
  const role = roleScript(state.role, scenario);
  const details = detailById(role);
  const voices = new Map((role?.voices ?? []).map((voice) => [voice.id, voice]));
  const earnedIds = new Set(state.itemsEarned);

  const entries: ReportEntry[] = state.history.map((record) => ({
    pointId: record.pointId,
    choiceId: record.choiceId,
    at: record.at,
    policyPoints: record.policyPoints,
    itemPoints: record.itemPoints,
    refs: findChoice(role, record.choiceId)?.refs ?? [],
    movedBy: record.voicesBefore.flatMap((voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice) return [];
      return [{ voiceId, misleading: voice.misleading, type: voice.type }];
    }),
    delayedHits: state.delayed
      .filter((effect) => effect.applied
        && effect.sourcePointId === record.pointId
        && effect.sourceChoiceId === record.choiceId)
      .map((effect) => ({ reason: effect.reason, points: effect.points })),
  }));

  const itemsEarned = [...earnedIds].flatMap((id) => {
    const item = details.get(id);
    if (!item) return [];
    return [{ id: item.id, points: item.points, axis: item.axis, refs: item.refs }];
  });

  const itemsMissed = [...details.values()]
    .filter((item) => item.points > 0 && !earnedIds.has(item.id))
    .map((item) => ({ id: item.id, points: item.points, axis: item.axis, refs: item.refs }));

  return {
    playCount: state.playCount,
    result: computeResult(state, scenario),
    entries,
    itemsEarned,
    itemsMissed,
    pressAnswers: state.press?.answers ?? [],
  };
}
