import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createProject, validateFixture } from '../validate/helpers.ts';
import type { TestFiles } from '../validate/helpers.ts';
import { validateProject } from '../../../tools/validate/checks.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

type Deny = NonNullable<TestFiles['denylist']>;

/** 最低件数を満たす無害な既定リスト（各テストは必要なキーだけ差し替える） */
function deny(overrides: Partial<Deny> = {}): Deny {
  return {
    companies: ['ZZ企業1', 'ZZ企業2', 'ZZ企業3', 'ZZ企業4', 'ZZ企業5'],
    services: ['ZZサービス1', 'ZZサービス2', 'ZZサービス3', 'ZZサービス4', 'ZZサービス5'],
    people: [],
    countries: ['ZZ国1', 'ZZ国2', 'ZZ国3', 'ZZ国4', 'ZZ国5'],
    comparisons: ['ZZ比較表現'],
    ...overrides,
  };
}

describe('denylist の fail-closed', () => {
  it('denylist が無いときは同梱の既定リストで検査し、警告を出す', () => {
    const project = validateFixture((files) => {
      files.denylist = null;
      files.scenario.tagline = { ja: 'GMO のようだ', en: 'x' };
    });
    cleanups.push(project.cleanup);
    expect(project.result.errors.map((e) => e.code)).toContain('C16');
    expect(project.result.warnings.some((w) => w.code === 'C16' && w.message.includes('同梱'))).toBe(true);
  });

  it('各キーが配列でなければエラー', () => {
    const project = validateFixture((files) => {
      files.denylist = deny({ services: 'Apache Struts' as unknown as string[] });
    });
    cleanups.push(project.cleanup);
    expect(project.result.errors.some((e) => e.code === 'C16' && e.message.includes('配列'))).toBe(true);
  });

  it('壊れた YAML はエラー', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    mkdirSync(join(project.root, 'tools', 'validate'), { recursive: true });
    writeFileSync(join(project.root, 'tools', 'validate', 'denylist.yaml'), 'companies: [\n');
    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(result.errors.some((e) => e.code === 'C16')).toBe(true);
  });

  it('comparisons の不正な正規表現はエラー', () => {
    const project = validateFixture((files) => {
      files.denylist = deny({ comparisons: ['('] });
    });
    cleanups.push(project.cleanup);
    expect(project.result.errors.some((e) => e.code === 'C20' && e.message.includes('正規表現'))).toBe(true);
  });

  it('正しい denylist はエラーなし', () => {
    const project = validateFixture((files) => {
      files.denylist = deny({ companies: ['GMO', 'ZZ企業1', 'ZZ企業2', 'ZZ企業3', 'ZZ企業4'],
        comparisons: ['社より(?:も)?(?:早|遅)'] });
    });
    cleanups.push(project.cleanup);
    expect(project.result.errors).toEqual([]);
  });

  it('最低件数を下回る配列はエラー', () => {
    const project = validateFixture((files) => {
      files.denylist = deny({ companies: ['GMO'] });
    });
    cleanups.push(project.cleanup);
    expect(project.result.errors.some((e) => e.code === 'C16' && e.message.includes('companies'))).toBe(true);
  });
});
