import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import jaNoticesRaw from '../../../locales/ja/notices.yaml?raw';
import enNoticesRaw from '../../../locales/en/notices.yaml?raw';
import jaCommonRaw from '../../../locales/ja/ui/common.yaml?raw';
import enCommonRaw from '../../../locales/en/ui/common.yaml?raw';

const NOTICE_IDS = ['criminal', 'fiction', 'score', 'purpose', 'voices', 'replay'];
const REQUIRED_COMMON = [
  'common.start', 'common.continue', 'common.restart', 'common.back', 'common.next',
  'common.confirm', 'common.settings', 'common.credits', 'common.close', 'common.untranslated',
  'common.saveDisabledNotice', 'common.loadFailed', 'common.playCount',
  'common.gauge.damage', 'common.gauge.flame', 'common.gauge.trust', 'common.gauge.stamina',
  'common.role.executive', 'common.role.officer', 'common.role.lead', 'common.role.analyst',
  'common.phase.detect', 'common.phase.contain', 'common.phase.organize', 'common.phase.investigate',
  'common.phase.notify', 'common.phase.recover', 'common.phase.after',
  'common.rank.S', 'common.rank.A', 'common.rank.B', 'common.rank.C', 'common.rank.D',
];

const jaNotices = parse(jaNoticesRaw) as Record<string, string>;
const enNotices = parse(enNoticesRaw) as Record<string, string>;
const jaCommon = parse(jaCommonRaw) as Record<string, string>;
const enCommon = parse(enCommonRaw) as Record<string, string>;

describe('notices.yaml', () => {
  it('6つの注記を日英とも持つ', () => {
    for (const id of NOTICE_IDS) {
      expect(jaNotices[id], `ja: ${id}`).toBeTypeOf('string');
      expect(enNotices[id], `en: ${id}`).toBeTypeOf('string');
      expect(jaNotices[id]?.length, `ja: ${id}`).toBeGreaterThan(0);
      expect(enNotices[id]?.length, `en: ${id}`).toBeGreaterThan(0);
    }
  });

  it('日英のキーが一致する', () => {
    expect(Object.keys(enNotices).sort()).toEqual(Object.keys(jaNotices).sort());
  });
});

describe('common.yaml', () => {
  it('必須の文言を日英とも持つ', () => {
    for (const key of REQUIRED_COMMON) {
      expect(jaCommon[key], `ja: ${key}`).toBeTypeOf('string');
      expect(enCommon[key], `en: ${key}`).toBeTypeOf('string');
    }
  });

  it('キーはすべて common. で始まる', () => {
    for (const key of [...Object.keys(jaCommon), ...Object.keys(enCommon)]) {
      expect(key.startsWith('common.'), key).toBe(true);
    }
  });

  it('日英のキーが一致する', () => {
    expect(Object.keys(enCommon).sort()).toEqual(Object.keys(jaCommon).sort());
  });

  it('空の文言がない', () => {
    for (const [key, value] of Object.entries(jaCommon)) {
      expect(value.length, `ja: ${key}`).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(enCommon)) {
      expect(value.length, `en: ${key}`).toBeGreaterThan(0);
    }
  });

  it('n回目は {n} を持つ', () => {
    expect(jaCommon['common.playCount']).toContain('{n}');
    expect(enCommon['common.playCount']).toContain('{n}');
  });

  it('未翻訳の表示が言語に合っている', () => {
    expect(jaCommon['common.untranslated']).toBe('未翻訳');
    expect(enCommon['common.untranslated']).toBe('Untranslated');
  });
});
