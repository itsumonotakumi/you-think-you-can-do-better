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

function deny(overrides: Partial<Deny> = {}): Deny {
  return {
    companies: [],
    services: [],
    people: [],
    countries: [],
    comparisons: [],
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
      files.denylist = deny({ companies: ['GMO'], comparisons: ['社より(?:も)?(?:早|遅)'] });
    });
    cleanups.push(project.cleanup);
    expect(project.result.errors).toEqual([]);
  });
});
