// 振り返りレポートの組み立て（設計書 5.4・5.5、テスト計画書 5.3）
// 保存データが壊れていても例外にしない（画面が止まらないように形を整えてから使う）
import { computeResult } from "./scoring";
import type {
  Choice, DetailItem, GameTime, Localized, PlayState, PressState, Report, ReportEntry, RoleId,
  RoleScript, Scenario,
} from "./types";

type Loose = Record<string, unknown>;

function asRecord(v: unknown): Loose {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Loose) : {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function timeOf(v: unknown, fallback: GameTime): GameTime {
  const t = asRecord(v);
  if (typeof t.day === "number" && Number.isFinite(t.day)
    && typeof t.minutes === "number" && Number.isFinite(t.minutes)) {
    return { day: t.day, minutes: t.minutes };
  }
  return { day: fallback.day, minutes: fallback.minutes };
}

function localizedOf(v: unknown): Localized {
  const l = asRecord(v);
  return { ja: str(l.ja), en: str(l.en) };
}

function roleScript(role: RoleId, scenario: Scenario): RoleScript | undefined {
  return scenario.roles[role];
}

function findChoice(role: RoleScript | undefined, choiceId: string): Choice | undefined {
  for (const point of role?.points ?? []) {
    const found = (point.choices ?? []).find((choice) => choice.id === choiceId);
    if (found) return found;
  }
  return undefined;
}

/** ロール内のすべての細目（選択肢の items と、文案の items/options） */
export function allDetailItems(role: RoleScript | undefined): DetailItem[] {
  const items: DetailItem[] = [];
  for (const point of role?.points ?? []) {
    for (const choice of point.choices ?? []) items.push(...(choice.items ?? []));
  }
  for (const draft of Object.values(role?.drafts ?? {})) {
    for (const slot of draft.slots ?? []) {
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

function pressAnswersOf(state: PlayState): PressState["answers"] {
  const press = asRecord(state.press);
  return list(press.answers).flatMap((raw) => {
    const answer = asRecord(raw);
    if (typeof answer.questionId !== "string") return [];
    return [{
      questionId: answer.questionId,
      answerId: typeof answer.answerId === "string" ? answer.answerId : null,
      points: num(answer.points),
    }];
  });
}

export function buildReport(state: PlayState, scenario: Scenario): Report {
  const role = roleScript(state.role, scenario);
  const details = detailById(role);
  const voices = new Map((role?.voices ?? []).map((voice) => [voice.id, voice]));
  const earnedIds = new Set(list(state.itemsEarned).filter((id): id is string => typeof id === "string"));
  const delayed = list(state.delayed);

  const entries: ReportEntry[] = list(state.history).map((raw) => {
    const record = asRecord(raw);
    const pointId = str(record.pointId);
    const choiceId = str(record.choiceId);
    const voicesBefore = list(record.voicesBefore).filter((id): id is string => typeof id === "string");
    return {
      pointId,
      choiceId,
      at: timeOf(record.at, state.clock),
      policyPoints: num(record.policyPoints),
      itemPoints: num(record.itemPoints),
      refs: findChoice(role, choiceId)?.refs ?? [],
      movedBy: voicesBefore.flatMap((voiceId) => {
        const voice = voices.get(voiceId);
        if (!voice) return [];
        return [{ voiceId, misleading: voice.misleading, type: voice.type }];
      }),
      delayedHits: delayed.flatMap((rawEffect) => {
        const effect = asRecord(rawEffect);
        if (effect.applied !== true) return [];
        if (pointId === "") return [];
        if (str(effect.sourcePointId) !== pointId || str(effect.sourceChoiceId) !== choiceId) return [];
        return [{ reason: localizedOf(effect.reason), points: num(effect.points) }];
      }),
    };
  });

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
    pressAnswers: pressAnswersOf(state),
  };
}
