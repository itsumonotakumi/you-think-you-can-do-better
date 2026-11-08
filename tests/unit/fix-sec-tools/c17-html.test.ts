// C17 の HTML 検査：閉じの > が無いタグと実体参照も検出する。
import { describe, it, expect } from 'vitest';
import { checkC17 } from '../../../tools/validate/checks.ts';
import type { Project } from '../../../tools/validate/project.ts';

/** 1つの文言だけを持つ最小のプロジェクト（経路探索は走らせない） */
function c17(tagline: string): string[] {
  const project = {
    scenarios: [{ id: 'x', file: 'scenarios/x/scenario.yaml', scenario: { tagline: { ja: tagline, en: '' } } }],
    references: null,
    locales: {},
    audioManifest: null,
  } as unknown as Project;
  return checkC17(project).map((issue) => issue.message);
}

describe('C17 の HTML 検査', () => {
  it('閉じの > が無いタグを検出する', () => {
    expect(c17('<img src=x onerror=alert(1)')).not.toEqual([]);
    expect(c17('<script')).not.toEqual([]);
  });

  it('実体参照を検出する', () => {
    expect(c17('&lt;script&gt;alert(1)&lt;/script&gt;')).not.toEqual([]);
    expect(c17('&#60;img src=x&#62;')).not.toEqual([]);
  });

  it('不等号や普通の文章は対象外', () => {
    expect(c17('a < b の関係')).toEqual([]);
    expect(c17('1<2 は真')).toEqual([]);
    expect(c17('AとB & C')).toEqual([]);
  });
});
