// denylist の最低件数（companies/services/countries は5件、comparisons は1件）。
import { describe, it, expect, afterEach } from 'vitest';
import { validateFixture } from '../validate/helpers.ts';
import type { TestFiles, ValidatedProject } from '../validate/helpers.ts';
import { DENYLIST_MIN } from '../../../tools/validate/project.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

type Deny = NonNullable<TestFiles['denylist']>;

function terms(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

function valid(overrides: Partial<Deny> = {}): Deny {
  return {
    companies: terms('ZZ企業', 5),
    services: terms('ZZサービス', 5),
    people: [],
    countries: terms('ZZ国', 5),
    comparisons: ['ZZ比較'],
    ...overrides,
  };
}

function run(denylist: Deny): ValidatedProject {
  const project = validateFixture((files) => {
    files.denylist = denylist;
  });
  cleanups.push(project.cleanup);
  return project;
}

function messages(project: ValidatedProject): string[] {
  return project.result.errors.map((issue) => issue.message);
}

describe('denylist の最低件数', () => {
  it('最低件数ちょうどならエラーなし（people は空でよい）', () => {
    const project = run(valid());
    expect(project.result.errors).toEqual([]);
    expect(DENYLIST_MIN.people).toBe(0);
  });

  it('companies が5件未満ならエラー', () => {
    const project = run(valid({ companies: terms('ZZ企業', 4) }));
    expect(messages(project).some((m) => m.includes('companies は 5 件以上'))).toBe(true);
  });

  it('services が5件未満ならエラー', () => {
    const project = run(valid({ services: [] }));
    expect(messages(project).some((m) => m.includes('services は 5 件以上'))).toBe(true);
  });

  it('countries が5件未満ならエラー', () => {
    const project = run(valid({ countries: terms('ZZ国', 3) }));
    expect(messages(project).some((m) => m.includes('countries は 5 件以上'))).toBe(true);
  });

  it('comparisons が空ならエラー', () => {
    const project = run(valid({ comparisons: [] }));
    expect(messages(project).some((m) => m.includes('comparisons は 1 件以上'))).toBe(true);
  });
});
