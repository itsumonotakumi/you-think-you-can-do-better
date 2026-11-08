// 言語切替と文言の取得。担当: i18n。設計書 9章, 13章。
import type { Lang, Localized, NoticeId } from '../engine/types';
import type { LocaleData } from '../data/loader';

export let currentLang: Lang = 'ja';

/** initI18n で渡された言語データ。無い間はすべて「未翻訳」 */
let localeData: LocaleData | null = null;

export function initI18n(data: LocaleData): void {
  localeData = data;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
}

/** 言語設定の共通処理。文言の切替と <html lang> を同時に更新する */
export function applyLang(lang: Lang): void {
  setLang(lang);
  try {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  } catch {
    // 文書が無い環境（テストなど）では文言の切替だけ行う
  }
}

/**
 * 画面遷移をまたいで一度だけ表示する連絡。
 * 例: シナリオの版が変わって続きから再開できないとき
 */
let pendingNotice: string | null = null;

export function setPendingNotice(text: string): void {
  pendingNotice = text;
}

export function takePendingNotice(): string | null {
  const text = pendingNotice;
  pendingNotice = null;
  return text;
}

/** シナリオの版が変わったときの連絡（ロケール未収録のためコード内に持つ） */
export function versionChangedNotice(lang: Lang = currentLang): string {
  return lang === 'en'
    ? 'The scenario has been updated, so this play will start over from the beginning.'
    : 'シナリオの版が変わったため、はじめからになります。';
}

function untranslated(): string {
  return currentLang === 'en' ? 'Untranslated' : '未翻訳';
}

/** 画面の共通文言。{name} を vars で置換。欠けていれば「未翻訳」 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = localeData?.[currentLang]?.strings?.[key];
  if (raw === undefined) return untranslated();
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** シナリオ等の Localized。空なら「未翻訳」（日本語に戻さない） */
export function loc(text: Localized | string | undefined): string {
  if (text === undefined) return '';
  if (typeof text === 'string') return text;
  const value = text[currentLang];
  return value === undefined || value === '' ? untranslated() : value;
}

/** 固定の注記（シナリオで上書き不可） */
export function notice(id: NoticeId): string {
  const value = localeData?.[currentLang]?.notices?.[id] as string | undefined;
  return value === undefined || value === '' ? untranslated() : value;
}
