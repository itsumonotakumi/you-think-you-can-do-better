// 契約（Wave0 スタブ）。担当: i18n。署名を変えずに中身を実装する。
import type { Lang, Localized, NoticeId } from '../engine/types';

export let currentLang: Lang = 'ja';
export function setLang(lang: Lang): void { currentLang = lang; }
/** 画面の共通文言。欠けていれば「未翻訳」 */
export function t(key: string, vars?: Record<string, string | number>): string { void vars; return key; }
/** シナリオ等の Localized。空なら「未翻訳」 */
export function loc(text: Localized | string | undefined): string {
  if (text === undefined) return '';
  return typeof text === 'string' ? text : text[currentLang] || '未翻訳';
}
/** 固定の注記（シナリオで上書き不可） */
export function notice(id: NoticeId): string { return id; }
