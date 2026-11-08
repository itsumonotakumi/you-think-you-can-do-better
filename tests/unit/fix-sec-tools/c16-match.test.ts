// C16 の照合：記号を除いた形での照合と、根拠データの summary の検査。
import { describe, it, expect, afterEach } from 'vitest';
import { validateFixture } from '../validate/helpers.ts';
import type { TestFiles, ValidatedProject } from '../validate/helpers.ts';
import { normalizeLoose } from '../../../tools/validate/checks.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function denyCompanies(): NonNullable<TestFiles['denylist']> {
  return {
    companies: ['GMO', 'ZZ企業1', 'ZZ企業2', 'ZZ企業3', 'ZZ企業4'],
    services: ['ZZサービス1', 'ZZサービス2', 'ZZサービス3', 'ZZサービス4', 'ZZサービス5'],
    people: [],
    countries: ['ZZ国1', 'ZZ国2', 'ZZ国3', 'ZZ国4', 'ZZ国5'],
    comparisons: ['ZZ比較'],
  };
}

function run(mutate: (files: TestFiles) => void): ValidatedProject {
  const project = validateFixture(mutate);
  cleanups.push(project.cleanup);
  return project;
}

function c16(project: ValidatedProject): string[] {
  return project.result.errors.filter((e) => e.code === 'C16').map((e) => e.message);
}

describe('記号を除いた照合', () => {
  it('normalizeLoose は記号を落とす', () => {
    expect(normalizeLoose('G.M.O')).toBe('gmo');
    expect(normalizeLoose('G・M・O')).toBe('gmo');
    expect(normalizeLoose('Ｇ－Ｍ＿Ｏ')).toBe('gmo');
  });

  it('G.M.O を検出する', () => {
    const project = run((files) => {
      files.denylist = denyCompanies();
      files.scenario.tagline = { ja: 'G.M.O の事件', en: '' };
    });
    expect(c16(project).length).toBeGreaterThan(0);
  });

  it('G・M・O を検出する', () => {
    const project = run((files) => {
      files.denylist = denyCompanies();
      files.scenario.tagline = { ja: 'G・M・O の事件', en: '' };
    });
    expect(c16(project).length).toBeGreaterThan(0);
  });

  it('英字に挟まれた偶然の一致（log:model）は検出しない', () => {
    const project = run((files) => {
      files.denylist = denyCompanies();
      files.scenario.tagline = { ja: 'log:model を確認', en: '' };
    });
    expect(c16(project)).toEqual([]);
  });
});

describe('参照データの summary', () => {
  it('summary の実名は C16 で検出する', () => {
    const project = run((files) => {
      files.denylist = denyCompanies();
      files.references[0]!.summary = { ja: 'GMO に確認した', en: '' };
    });
    expect(c16(project).some((m) => m.includes('ref-a'))).toBe(true);
  });

  it('title と issuer は対象外のまま', () => {
    const project = run((files) => {
      files.denylist = denyCompanies();
      files.references[0]!.title = { ja: 'GMO の資料', en: '' };
      files.references[0]!.issuer = { ja: 'GMO', en: '' };
    });
    expect(c16(project)).toEqual([]);
  });
});
