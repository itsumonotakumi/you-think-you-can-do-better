// #8 翌朝の新聞見出し。ゲージ（信頼・炎上・被害）・ランク・期限超過・記者会見の結果から
// 状況を1つ選び、共通の雛形（locales/*/ui/headline.yaml）を返す純粋関数。
// 乱数・Date.now は使わない。同じ state と scenario からは常に同じ見出しになる。
// シェア画像（#6）からも使えるよう、表示文言ではなく Localized を返す。
import { parse } from 'yaml';
import jaSource from '../../../locales/ja/ui/headline.yaml?raw';
import enSource from '../../../locales/en/ui/headline.yaml?raw';
import { computeResult } from '../../engine/scoring';
import type { Choice, Lang, Localized, PlayState, Rank, Scenario } from '../../engine/types';

export type HeadlineSituation =
  | 'pressFail'
  | 'fatal'
  | 'coverup'
  | 'deadline'
  | 'ransom'
  | 'flame'
  | 'damage'
  | 'trustLost'
  | 'quick'
  | 'plain';

/** ランクを3段階にまとめた、雛形の選び方 */
export type HeadlineTier = 'high' | 'mid' | 'low';

export interface HeadlinePick {
  rank: Rank;
  situation: HeadlineSituation;
  tier: HeadlineTier;
  /** 選んだ雛形のキー（テストとデバッグ用） */
  key: string;
}

/** 状況の判定に使うしきい値 */
export const HEADLINE_THRESHOLDS = {
  flame: 70,
  damage: 70,
  /** これ未満の信頼は「失墜」とみなす */
  trust: 25,
  /** これ以下の回答点は「会見で大きく失敗した」とみなす */
  pressSevere: -100,
  /** これ以内に公表できていれば「迅速な公表」とみなす */
  quickHours: 24,
  /** 迅速な公表として扱う最低の信頼 */
  quickTrust: 50,
} as const;

/** 隠蔽ぎみとみなす旗（シナリオの hid* も含む） */
const CONCEALMENT_KEYS: readonly string[] = [
  'falseDisclosure',
  'falseReport',
  'vagueReport',
  'downplayed',
  'leakDenied',
  'destroyedEvidence',
  'maintenanceExplained',
];
const CONCEALMENT_PREFIX = /^hid/i;

/** 迅速な公表とみなす旗 */
const QUICK_KEYS: readonly string[] = [
  'fullDisclosure',
  'subFullDisclosure',
  'timelyDisclosed',
  'selfDisclosed',
  'honestReport',
  'honestGap',
  'honestEarnings',
  'pressHonest',
  'ownWarningOwned',
  'admittedWarning',
  'admittedPriorWarning',
  'leakAdmitted',
];

const FALLBACK: Localized = {
  ja: '見出しを用意できませんでした',
  en: 'Headline unavailable',
};

type Tree = Record<string, unknown>;

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, child] of Object.entries(value as Tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[full] = child;
    else Object.assign(out, flatten(child, full));
  }
  return out;
}

const TEMPLATES: Record<Lang, Record<string, string>> = {
  ja: flatten(parse(jaSource)),
  en: flatten(parse(enSource)),
};

function companyName(scenario: Scenario, lang: Lang): string {
  const name = scenario.company.name;
  return name[lang] || name.ja || name.en || '';
}

function fillCompany(text: string, scenario: Scenario, lang: Lang): string {
  return text.replace(/\{company\}/g, companyName(scenario, lang));
}

function hasFlag(state: PlayState, keys: readonly string[]): boolean {
  return keys.some((key) => state.flags[key] === true);
}

function hasConcealment(state: PlayState): boolean {
  return Object.entries(state.flags).some(
    ([key, value]) =>
      value === true && (CONCEALMENT_PREFIX.test(key) || CONCEALMENT_KEYS.includes(key)),
  );
}

type PressOutcome = 'none' | 'ok' | 'mild' | 'severe';

function pressOutcome(state: PlayState): PressOutcome {
  const answers = state.press?.answers;
  if (!answers || answers.length === 0) return 'none';
  const severe = answers.some(
    (answer) => answer.answerId === null || answer.points <= HEADLINE_THRESHOLDS.pressSevere,
  );
  if (severe) return 'severe';
  const total = answers.reduce((sum, answer) => sum + answer.points, 0);
  return total < 0 ? 'mild' : 'ok';
}

/**
 * 通知フェーズの選択が、実際に通知・公表したものか。
 * 「全容が分かってから発表する」のような先送り・否定・保身は公表に数えない。
 */
export function isNotificationChoice(choice: Choice): boolean {
  if (choice.coward) return false;
  return choice.category === 'increase' || choice.category === 'recover' || choice.category === 'maintain';
}

/** 最初の「通知・公表」の判断を終えた時刻までの時間（時間単位）。無ければ null */
function publicationHours(state: PlayState, scenario: Scenario): number | null {
  const role = scenario.roles[state.role];
  if (!role) return null;
  for (const record of state.history) {
    const point = role.points.find((item) => item.id === record.pointId);
    if (!point || point.phase !== 'notify') continue;
    const choice = point.choices.find((item) => item.id === record.choiceId);
    if (!choice || !isNotificationChoice(choice)) continue;
    const minutes = (record.at.day - scenario.start.day) * 1440
      + (record.at.minutes - scenario.start.minutes) + choice.minutes;
    return Math.max(0, minutes) / 60;
  }
  return null;
}

function isQuick(state: PlayState, scenario: Scenario): boolean {
  if (hasFlag(state, QUICK_KEYS)) return true;
  const hours = publicationHours(state, scenario);
  return hours !== null && hours <= HEADLINE_THRESHOLDS.quickHours;
}

/** ランクを雛形の段階にまとめる */
export function tierFor(rank: Rank): HeadlineTier {
  if (rank === 'S' || rank === 'A') return 'high';
  if (rank === 'B' || rank === 'C') return 'mid';
  return 'low';
}

function situationFor(
  state: PlayState,
  scenario: Scenario,
  rank: Rank,
  press: PressOutcome,
): HeadlineSituation {
  // 会見での虚偽・時間切れは、ほかの状況より先に伝える
  if (press === 'severe') return 'pressFail';
  if (state.fatal) return 'fatal';
  if (hasConcealment(state)) return 'coverup';
  if (state.deadlines.some((deadline) => deadline.over)) return 'deadline';
  if (press === 'mild') return 'pressFail';
  if (state.flags.paidRansom === true) return 'ransom';
  if (state.gauges.flame >= HEADLINE_THRESHOLDS.flame) return 'flame';
  if (state.gauges.damage >= HEADLINE_THRESHOLDS.damage) return 'damage';
  if (state.gauges.trust < HEADLINE_THRESHOLDS.trust) return 'trustLost';
  if (
    rank !== 'D'
    && state.gauges.trust >= HEADLINE_THRESHOLDS.quickTrust
    && isQuick(state, scenario)
  ) {
    return 'quick';
  }
  return 'plain';
}

function keyFor(situation: HeadlineSituation, rank: Rank, tier: HeadlineTier): string {
  if (situation === 'plain') return `headline.template.plain.${rank}`;
  if (situation === 'fatal' || situation === 'ransom') return `headline.template.${situation}`;
  return `headline.template.${situation}.${tier}`;
}

/** 状況の判定結果。ランクも含めて返す */
export function pickHeadline(state: PlayState, scenario: Scenario): HeadlinePick {
  const rank = computeResult(state, scenario).rank;
  const situation = situationFor(state, scenario, rank, pressOutcome(state));
  const tier = tierFor(rank);
  return { rank, situation, tier, key: keyFor(situation, rank, tier) };
}

function templateText(lang: Lang, pick: HeadlinePick): string {
  const keys = [
    pick.key,
    `headline.template.plain.${pick.rank}`,
    'headline.template.plain.D',
  ];
  for (const key of keys) {
    const text = TEMPLATES[lang][key];
    if (text) return text;
  }
  const other: Lang = lang === 'ja' ? 'en' : 'ja';
  for (const key of keys) {
    const text = TEMPLATES[other][key];
    if (text) return text;
  }
  return '';
}

/**
 * 翌朝の新聞見出し。シナリオがランクごとの見出しを持っていれば、それを優先する。
 * {company} はシナリオの会社名（その言語。空なら日本語）に置き換える。
 */
export function headlineFor(state: PlayState, scenario: Scenario): Localized {
  const pick = pickHeadline(state, scenario);
  const override = scenario.headlines?.[pick.rank];
  const ja = override?.ja || templateText('ja', pick) || FALLBACK.ja;
  const en = override?.en || templateText('en', pick) || FALLBACK.en;
  return {
    ja: fillCompany(ja, scenario, 'ja'),
    en: fillCompany(en, scenario, 'en'),
  };
}
