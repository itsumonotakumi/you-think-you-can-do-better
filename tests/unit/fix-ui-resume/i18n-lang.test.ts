// 言語変更の共通処理と、遷移をまたぐ連絡。
import { afterEach, describe, expect, it, vi } from 'vitest';

type I18n = typeof import('../../../src/i18n/index.ts');

async function fresh(): Promise<I18n> {
  vi.resetModules();
  return import('../../../src/i18n/index.ts');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('applyLang', () => {
  it('現在の言語と <html lang> を同時に更新する', async () => {
    const i18n = await fresh();
    const doc = { documentElement: { lang: 'ja' } };
    vi.stubGlobal('document', doc);

    i18n.applyLang('en');

    expect(i18n.currentLang).toBe('en');
    expect(doc.documentElement.lang).toBe('en');
  });

  it('document が無い環境でも例外にならない', async () => {
    const i18n = await fresh();
    vi.stubGlobal('document', undefined);

    expect(() => i18n.applyLang('en')).not.toThrow();
    expect(i18n.currentLang).toBe('en');
  });
});

describe('画面遷移をまたぐ連絡', () => {
  it('取り出すと消える（一度だけ）', async () => {
    const i18n = await fresh();
    expect(i18n.takePendingNotice()).toBeNull();

    i18n.setPendingNotice('版が変わりました');
    expect(i18n.takePendingNotice()).toBe('版が変わりました');
    expect(i18n.takePendingNotice()).toBeNull();
  });

  it('版が変わったときの文言を言語別に返す', async () => {
    const i18n = await fresh();
    expect(i18n.versionChangedNotice('ja')).toContain('シナリオの版が変わったため');
    expect(i18n.versionChangedNotice('en')).toContain('updated');
    expect(i18n.versionChangedNotice('ja')).not.toBe(i18n.versionChangedNotice('en'));
  });
});
