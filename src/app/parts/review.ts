// 振り返り画面の表示用ロジック（S09）。データが欠けていても落とさない。
import type {
  Choice, DecisionPoint, Draft, DraftSlot, Localized, RoleScript,
} from '../../engine/types';

type DraftOption = NonNullable<DraftSlot['options']>[number];

/** 表示できる文言があるか（未設定・空文字は出さない） */
export function hasLocalized(text: Localized | undefined): text is Localized {
  if (!text) return false;
  const ja = typeof text.ja === 'string' ? text.ja.trim() : '';
  const en = typeof text.en === 'string' ? text.en.trim() : '';
  return ja !== '' || en !== '';
}

/** その判断で最も高い点数の選択肢。同点は最初のものを返す */
export function bestChoiceOf(point: DecisionPoint): Choice | null {
  let best: Choice | null = null;
  for (const choice of point.choices ?? []) {
    if (!best || choice.points > best.points) best = choice;
  }
  return best;
}

/** 選んだ選択肢が最高点か（同点なら最高点とみなす） */
export function isBestChoice(point: DecisionPoint, choice: Choice): boolean {
  const best = bestChoiceOf(point);
  return !best || choice.points >= best.points;
}

export interface DraftSlotReview {
  slot: DraftSlot;
  chosen: DraftOption;
  /** 選んだものが最高点でないときだけ、最高点の選択肢 */
  best: DraftOption | null;
}

export interface DraftReview {
  key: string;
  draft: Draft;
  slots: DraftSlotReview[];
}

/** 取れた細目から、実際に使った報告書（ドラフト）の選択を復元する */
export function draftReviews(role: RoleScript | undefined, earnedIds: readonly string[]): DraftReview[] {
  const earned = new Set(earnedIds);
  const reviews: DraftReview[] = [];
  for (const [key, draft] of Object.entries(role?.drafts ?? {})) {
    if (!draft || !Array.isArray(draft.slots)) continue;
    const slots: DraftSlotReview[] = [];
    for (const slot of draft.slots ?? []) {
      const options = slot.options ?? [];
      if (options.length === 0) continue;
      const chosen = options.find((option) => earned.has(option.id));
      if (!chosen) continue;
      const best = options.reduce((a, b) => (b.points > a.points ? b : a));
      slots.push({ slot, chosen, best: chosen.points >= best.points ? null : best });
    }
    if (slots.length > 0) reviews.push({ key, draft, slots });
  }
  return reviews;
}
