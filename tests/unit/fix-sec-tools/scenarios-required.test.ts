// scenarios フォルダの不在・0件はエラー。0件でも共通データは検査する。
import { describe, it, expect, afterEach } from 'vitest';
import { renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createProject } from '../validate/helpers.ts';
import { validateProject } from '../../../tools/validate/checks.ts';
import { buildData } from '../../../tools/build-data/build.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('scenarios の不在・0件', () => {
  it('フォルダごと消すと C17 エラー', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    rmSync(join(project.root, 'scenarios'), { recursive: true, force: true });
    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(result.errors.some((e) => e.code === 'C17' && e.message.includes('scenarios'))).toBe(true);
    expect(() => buildData({ root: project.root, outDir: join(project.root, 'out') })).toThrow(/C17/);
  });

  it('_ 始まりに改名して0件になってもエラー', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    renameSync(
      join(project.root, 'scenarios', project.files.scenario.id),
      join(project.root, 'scenarios', `_${project.files.scenario.id}`),
    );
    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(result.errors.some((e) => e.code === 'C17' && e.message.includes('シナリオが0件'))).toBe(true);
  });

  it('0件でも references・locales・audio の誤りを報告する', () => {
    const project = createProject((files) => {
      files.references[1]!.deadlineHours = -1;
      delete files.notices.ja.criminal;
      files.audioManifest = [
        {
          id: 'click',
          kind: 'se',
          file: 'se/missing.mp3',
          loop: false,
          title: 'クリック',
          author: '作者',
          site: '配布サイト',
          url: 'https://example.com/click',
          termsUrl: 'https://example.com/terms',
          termsCheckedAt: '2026-11-01',
          conditions: {
            game: true,
            free: true,
            modify: true,
            creditRequired: false,
            themeOk: true,
            redistribution: 'embedded-only',
          },
        },
      ];
    });
    cleanups.push(project.cleanup);
    rmSync(join(project.root, 'scenarios'), { recursive: true, force: true });

    const result = validateProject({ root: project.root, today: '2026-11-08' });
    const codes = result.errors.map((issue) => issue.code);
    expect(codes).toContain('C15'); // 根拠データ
    expect(codes).toContain('C14'); // 注記（locales）
    expect(codes).toContain('C22'); // 音素材
    expect(() => buildData({ root: project.root, outDir: join(project.root, 'out') })).toThrow(/\[C\d{2}\]/);
  });
});
