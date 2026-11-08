import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocaleData } from '../../../src/data/loader';

type I18nModule = typeof import('../../../src/i18n/index.ts');

const data: LocaleData = {
  ja: {
    strings: {
      'common.start': 'はじめる',
      'common.playCount': '{n}回目',
      'common.greet': '{name}さん、こんにちは',
    },
    notices: {
      criminal: '悪いのは犯罪者です。',
      fiction: 'この物語はフィクションです。',
      score: '採点は目安です。',
      purpose: '学ぶためのツールです。',
      voices: '現実に起きがちな反応です。',
      replay: '現実に2回目はありません。',
    },
  },
  en: {
    strings: {
      'common.start': 'Start',
      'common.playCount': 'Play {n}',
      'common.greet': 'Hello, {name}',
    },
    notices: {
      criminal: 'The criminals are at fault.',
      fiction: 'This story is fiction.',
      score: 'The score is only a guide.',
      purpose: 'A tool for learning.',
      voices: 'Reactions that commonly occur.',
      replay: 'There is no second chance.',
    },
  },
};

let i18n: I18nModule;

beforeEach(async () => {
  vi.resetModules();
  i18n = await import('../../../src/i18n/index.ts');
});

describe('t', () => {
  it('初期化前は「未翻訳」', () => {
    expect(i18n.t('common.start')).toBe('未翻訳');
  });

  it('初期化後は現在の言語の文言を返す', () => {
    i18n.initI18n(data);
    expect(i18n.t('common.start')).toBe('はじめる');
  });

  it('英語に切り替えると英語を返す', () => {
    i18n.initI18n(data);
    i18n.setLang('en');
    expect(i18n.currentLang).toBe('en');
    expect(i18n.t('common.start')).toBe('Start');
  });

  it('{name} を置換する', () => {
    i18n.initI18n(data);
    expect(i18n.t('common.playCount', { n: 3 })).toBe('3回目');
    expect(i18n.t('common.greet', { name: '匠' })).toBe('匠さん、こんにちは');
  });

  it('渡されていない変数は残す', () => {
    i18n.initI18n(data);
    expect(i18n.t('common.greet')).toBe('{name}さん、こんにちは');
    expect(i18n.t('common.greet', { other: 'x' })).toBe('{name}さん、こんにちは');
  });

  it('欠けた文言は言語に合わせて「未翻訳」/「Untranslated」', () => {
    i18n.initI18n(data);
    expect(i18n.t('common.missing')).toBe('未翻訳');
    i18n.setLang('en');
    expect(i18n.t('common.missing')).toBe('Untranslated');
  });
});

describe('loc', () => {
  it('文字列はそのまま返す', () => {
    expect(i18n.loc('そのまま')).toBe('そのまま');
    expect(i18n.loc(undefined)).toBe('');
  });

  it('現在の言語を返し、空なら「未翻訳」（日本語に戻さない）', () => {
    i18n.initI18n(data);
    const text = { ja: '日本語', en: '' };
    expect(i18n.loc(text)).toBe('日本語');
    i18n.setLang('en');
    expect(i18n.loc(text)).toBe('Untranslated');
  });
});

describe('notice', () => {
  it('固定の注記を言語ごとに返す', () => {
    i18n.initI18n(data);
    expect(i18n.notice('criminal')).toBe('悪いのは犯罪者です。');
    i18n.setLang('en');
    expect(i18n.notice('replay')).toBe('There is no second chance.');
  });

  it('初期化前は「未翻訳」', () => {
    expect(i18n.notice('score')).toBe('未翻訳');
  });
});
