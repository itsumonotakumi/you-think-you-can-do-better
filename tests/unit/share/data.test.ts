// シェアする内容の組み立て。個人情報を混ぜないことを固定する。
import { describe, expect, it } from 'vitest';
import {
  SHARE_HASHTAG,
  buildShareCard,
  localizedFor,
  normalizeSiteUrl,
  shareFileName,
  siteUrl,
} from '../../../src/app/share/data';
import { makeResult, makeScenario } from './fixtures';

const base = {
  scenario: makeScenario(),
  result: makeResult(),
  lang: 'ja' as const,
  roleLabel: '経営者',
  productName: 'じゃ、あなたがやってみて',
  url: 'https://example.com/ytcdb/',
  illustrationBase: './',
};

describe('localizedFor', () => {
  it('今の言語、無ければ日本語、英語の順に使う', () => {
    expect(localizedFor({ ja: 'あ', en: 'A' }, 'en')).toBe('A');
    expect(localizedFor({ ja: 'あ', en: '' }, 'en')).toBe('あ');
    expect(localizedFor({ ja: '', en: 'A' }, 'ja')).toBe('A');
    expect(localizedFor({ ja: '', en: '' }, 'ja')).toBe('');
    expect(localizedFor(undefined, 'ja')).toBe('');
  });
});

describe('normalizeSiteUrl', () => {
  it('末尾のスラッシュを落とす', () => {
    expect(normalizeSiteUrl('https://example.com/ytcdb//')).toBe('https://example.com/ytcdb');
  });

  it('http(s) 以外と空白入りは使わない', () => {
    expect(normalizeSiteUrl('javascript:alert(1)')).toBe('');
    expect(normalizeSiteUrl('https://example.com/a b')).toBe('');
    expect(normalizeSiteUrl('  ')).toBe('');
    expect(normalizeSiteUrl(undefined)).toBe('');
  });
});

describe('siteUrl', () => {
  it('設定されたURLを優先する', () => {
    expect(siteUrl('https://example.com/ytcdb/')).toBe('https://example.com/ytcdb');
  });

  it('未設定なら空文字（画面が無い環境）', () => {
    expect(siteUrl('')).toBe('');
    expect(siteUrl('not a url')).toBe('');
  });
});

describe('buildShareCard', () => {
  it('題名・ロール・ランク・スコア・回数・URLをまとめる', () => {
    const card = buildShareCard(base);
    expect(card.lang).toBe('ja');
    expect(card.scenarioId).toBe('no01-nebula');
    expect(card.title).toBe('ネビュラクラウド');
    expect(card.role).toBe('経営者');
    expect(card.rank).toBe('A');
    expect(card.score).toBe(800);
    expect(card.playCount).toBe(2);
    expect(card.url).toBe('https://example.com/ytcdb');
    expect(card.hashtag).toBe(SHARE_HASHTAG);
    expect(card.illustrationUrl).toBe('./illustrations/no01-nebula-key.webp');
  });

  it('英語では英語の題名を使う', () => {
    const card = buildShareCard({ ...base, lang: 'en' });
    expect(card.title).toBe('Nebula Cloud');
  });

  it('見出しと称号は任意。空なら項目ごと持たない', () => {
    const empty = buildShareCard(base);
    expect('headline' in empty).toBe(false);
    expect('achievement' in empty).toBe(false);
    expect(Object.keys(empty)).not.toContain('headline');
  });

  it('渡された見出しと称号は前後の空白を落として使う', () => {
    const card = buildShareCard({ ...base, headline: '  大障害  ', achievement: ' 初動の達人 ' });
    expect(card.headline).toBe('大障害');
    expect(card.achievement).toBe('初動の達人');
  });

  it('プロローグや記録など個人の入力を持ち込まない', () => {
    const json = JSON.stringify(buildShareCard(base));
    expect(json).not.toContain('社外秘の顧客名簿');
    expect(json).not.toContain('個人情報のメモ');
    expect(json).not.toContain('prologue');
    expect(json).not.toContain('notes');
  });

  it('挿絵の置き場所を差し替えられる', () => {
    const card = buildShareCard({ ...base, illustrationBase: '/sub/' });
    expect(card.illustrationUrl).toBe('/sub/illustrations/no01-nebula-key.webp');
  });
});

describe('shareFileName', () => {
  it('シナリオ・ロール・ランクから安全なPNG名を作る', () => {
    expect(shareFileName(buildShareCard(base))).toBe('ytcdb-no01-nebula-play-a.png');
  });

  it('英語のロール名はそのまま使える', () => {
    const card = buildShareCard({ ...base, lang: 'en', roleLabel: 'Executive' });
    expect(shareFileName(card)).toBe('ytcdb-no01-nebula-executive-a.png');
  });
});
