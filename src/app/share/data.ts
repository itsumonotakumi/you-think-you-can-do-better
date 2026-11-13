// シェアする内容（画像・投稿文の元データ）。担当: f-share。
// 個人を特定できる情報（プロローグの書き込み、記録、選択履歴）はここに入れない。
import type { EndingResult, Lang, Localized, Rank, Scenario } from '../../engine/types';

/** 投稿文に必ず入れるハッシュタグ */
export const SHARE_HASHTAG = '#じゃあなたがやってみて';

/** 画像と投稿文に使う、画面に出してよい結果だけ */
export interface ShareCard {
  lang: Lang;
  scenarioId: string;
  title: string;
  role: string;
  rank: Rank;
  score: number;
  playCount: number;
  product: string;
  url: string;
  hashtag: string;
  illustrationUrl: string;
  /** #8 翌朝の新聞見出し（任意） */
  headline?: string;
  /** #9 称号（任意） */
  achievement?: string;
}

export interface ShareSource {
  scenario: Scenario;
  result: EndingResult;
  lang: Lang;
  /** 画面の文言（i18n）で解決済みのロール名 */
  roleLabel: string;
  /** 画面の文言（i18n）で解決済みの製品名 */
  productName: string;
  /** VITE_SITE_URL など。空なら投稿文・画像からURLを省く */
  url?: string;
  headline?: string;
  achievement?: string;
  /** 挿絵の置き場所。既定は Vite の base（'./'） */
  illustrationBase?: string;
}

/** Localized から今の言語の文言を取る。空なら他の言語、それも空なら空文字 */
export function localizedFor(text: Localized | undefined, lang: Lang): string {
  if (!text) return '';
  return (text[lang] || text.ja || text.en || '').trim();
}

/** 末尾のスラッシュを落とし、http(s) のURLだけ通す */
export function normalizeSiteUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return '';
  return /^https?:\/\/[^\s]+$/i.test(value) ? value : '';
}

/** ビルド時の公開先URL。未設定なら開発中の origin を使う */
export function siteUrl(envUrl: string | undefined = import.meta.env?.VITE_SITE_URL): string {
  const fromEnv = normalizeSiteUrl(envUrl);
  if (fromEnv) return fromEnv;
  try {
    if (typeof location !== 'undefined' && location.origin) {
      return normalizeSiteUrl(location.origin);
    }
  } catch {
    // 画面が無い環境（テストなど）ではURLを省く
  }
  return '';
}

function illustrationUrl(scenarioId: string, base: string | undefined): string {
  const safeId = scenarioId.replace(/[^a-z0-9-]/gi, '');
  const root = base && base.trim() !== '' ? base.trim() : './';
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return `${prefix}illustrations/${safeId}-key.webp`;
}

/** 結果画面の状態から、画像・投稿文に出す値だけを取り出す */
export function buildShareCard(source: ShareSource): ShareCard {
  const headline = (source.headline ?? '').trim();
  const achievement = (source.achievement ?? '').trim();
  const card: ShareCard = {
    lang: source.lang,
    scenarioId: source.scenario.id,
    title: localizedFor(source.scenario.title, source.lang),
    role: source.roleLabel.trim(),
    rank: source.result.rank,
    score: source.result.official,
    playCount: source.result.playCount,
    product: source.productName.trim(),
    url: normalizeSiteUrl(source.url),
    hashtag: SHARE_HASHTAG,
    illustrationUrl: illustrationUrl(source.scenario.id, source.illustrationBase),
  };
  if (headline) card.headline = headline;
  if (achievement) card.achievement = achievement;
  return card;
}

/** 保存するファイル名。OSで使えない文字を落とす */
export function shareFileName(card: ShareCard): string {
  const part = (value: string): string => value
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const id = part(card.scenarioId) || 'result';
  const role = part(card.role) || 'play';
  return `ytcdb-${id}-${role}-${card.rank.toLowerCase()}.png`;
}
