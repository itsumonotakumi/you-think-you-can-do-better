// C20（実在企業との比較）の正規表現の長さ制限と、照合対象の文字数上限。
import { describe, it, expect, afterEach } from 'vitest';
import { validateFixture } from '../validate/helpers.ts';
import type { TestFiles, ValidatedProject } from '../validate/helpers.ts';
import { isRiskyComparison, MAX_COMPARISON_PATTERN } from '../../../tools/validate/project.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function deny(comparisons: string[]): NonNullable<TestFiles['denylist']> {
  return {
    companies: ['ZZ企業1', 'ZZ企業2', 'ZZ企業3', 'ZZ企業4', 'ZZ企業5'],
    services: ['ZZサービス1', 'ZZサービス2', 'ZZサービス3', 'ZZサービス4', 'ZZサービス5'],
    people: [],
    countries: ['ZZ国1', 'ZZ国2', 'ZZ国3', 'ZZ国4', 'ZZ国5'],
    comparisons,
  };
}

function run(mutate: (files: TestFiles) => void): ValidatedProject {
  const project = validateFixture(mutate);
  cleanups.push(project.cleanup);
  return project;
}

describe('comparisons の上限', () => {
  it('200 文字を超える正規表現はエラー', () => {
    const project = run((files) => {
      files.denylist = deny(['a'.repeat(MAX_COMPARISON_PATTERN + 1)]);
    });
    expect(project.result.errors.some((e) => e.code === 'C20' && e.message.includes('文字以内'))).toBe(true);
  });

  it('指数的に評価されうる形はエラー', () => {
    const project = run((files) => {
      files.denylist = deny(['(a+)+$']);
    });
    expect(project.result.errors.some((e) => e.code === 'C20' && e.message.includes('指数的'))).toBe(true);
    expect(isRiskyComparison('(a+)+$')).toBe(true);
    expect(isRiskyComparison('社より(?:も)?(?:早|遅|まし|ひど)')).toBe(false);
  });

  it('1万文字を超える文字列は先頭1万文字までで照合する', () => {
    const text = 'a'.repeat(20_000);
    const project = run((files) => {
      files.denylist = deny(['a{15000}']);
      files.scenario.tagline = { ja: text, en: '' };
    });
    // 先頭1万文字には a{15000} が無いので C20 にならない
    expect(project.result.errors.some((e) => e.code === 'C20')).toBe(false);
  });
});
