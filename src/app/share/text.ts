// SNS の投稿文。担当: f-share。
// 各サービスの文字数に収め、ハッシュタグと公開先URLを必ず残す。
import type { Lang } from '../../engine/types';
import { SHARE_HASHTAG, type ShareCard } from './data';

export type SharePlatform = 'x' | 'linkedin' | 'threads' | 'bluesky';

export const SHARE_PLATFORMS: readonly SharePlatform[] = ['x', 'linkedin', 'threads', 'bluesky'];

/** 各サービスの上限（文字数）。X は日本語140字、Bluesky は300字 */
export const PLATFORM_LIMITS: Record<SharePlatform, number> = {
  x: 140,
  linkedin: 3000,
  threads: 500,
  bluesky: 300,
};

interface Template {
  head: (card: ShareCard) => string;
  short: (card: ShareCard) => string;
  result: (card: ShareCard) => string;
  resultShort: (card: ShareCard) => string;
  headline: (value: string) => string;
  achievement: (value: string) => string;
}

const TEMPLATES: Record<Lang, Template> = {
  ja: {
    head: (card) => `『${card.title}』の${card.role}でプレイしました。`,
    short: (card) => `『${card.title}』${card.role}`,
    result: (card) => `結果は ${card.rank} ランク、公式スコア ${card.score}点（${card.playCount}回目）。`,
    resultShort: (card) => `${card.rank}ランク / ${card.score}点`,
    headline: (value) => `翌朝の新聞：「${value}」`,
    achievement: (value) => `称号：${value}`,
  },
  en: {
    head: (card) => `I played "${card.title}" as ${card.role}.`,
    short: (card) => `"${card.title}" - ${card.role}`,
    result: (card) => `Rank ${card.rank}, score ${card.score} (play ${card.playCount}).`,
    resultShort: (card) => `Rank ${card.rank} / ${card.score} pts`,
    headline: (value) => `Next morning's headline: "${value}"`,
    achievement: (value) => `Title: ${value}`,
  },
};

/** 文字数（絵文字なども1文字として数える） */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/** 上限を超えるときだけ末尾を「…」で切る */
export function truncateText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  if (max <= 0) return '';
  return `${chars.slice(0, max - 1).join('')}…`;
}

function joinLines(lines: (string | undefined)[]): string {
  return lines.filter((line): line is string => Boolean(line && line.trim() !== '')).join('\n');
}

/**
 * 投稿文を作る。長すぎるときは 称号 → 見出し の順に落とし、
 * それでも入らなければ見出しを切り詰める。ハッシュタグとURLは残す。
 */
export function buildPostText(card: ShareCard, platform: SharePlatform = 'x'): string {
  const template = TEMPLATES[card.lang];
  const limit = PLATFORM_LIMITS[platform];
  const tail = joinLines([SHARE_HASHTAG, card.url]);
  const headlineLine = card.headline ? template.headline(card.headline) : undefined;
  const achievementLine = card.achievement ? template.achievement(card.achievement) : undefined;
  const extras = [headlineLine, achievementLine].filter(
    (line): line is string => line !== undefined,
  );
  const shortBase = joinLines([template.short(card), template.resultShort(card)]);

  // 見出しを切り詰めて残す場合の文字数（改行1つ分を空ける）
  const headlineRoom = limit - charCount(joinLines([shortBase, tail])) - 1;
  const shortHeadline = headlineLine && headlineRoom > 2
    ? joinLines([shortBase, truncateText(headlineLine, headlineRoom), tail])
    : '';

  const candidates: string[] = [
    joinLines([template.head(card), template.result(card), ...extras, tail]),
    joinLines([template.short(card), template.result(card), ...extras, tail]),
    joinLines([template.short(card), template.resultShort(card), ...extras, tail]),
    // 称号を落とし、見出しだけ残す
    joinLines([template.short(card), template.resultShort(card), headlineLine, tail]),
    shortHeadline,
    // 見出しも落とす
    joinLines([template.short(card), template.resultShort(card), tail]),
  ];
  for (const text of candidates) {
    if (text !== '' && charCount(text) <= limit) return text;
  }

  // ここまで来るのはURLだけで上限を超える場合など。先頭を切ってでもタグとURLを残す
  const tailRoom = charCount(tail);
  const headRoom = limit - tailRoom - 1;
  if (headRoom <= 0) return truncateText(tail, limit);
  const head = joinLines([template.short(card), template.resultShort(card)]);
  return `${truncateText(head, headRoom)}\n${tail}`;
}
