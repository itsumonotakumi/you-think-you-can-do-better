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
