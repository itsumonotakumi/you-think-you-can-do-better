// サイズ上限は読む前に statSync で判定する。読めないファイルは例外にせず C17 にする。
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createProject } from '../validate/helpers.ts';
import { readYaml, MAX_YAML_BYTES } from '../../../tools/validate/source.ts';
import { validateProject } from '../../../tools/validate/checks.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('YAML の読み込み', () => {
  it('上限を超えるファイルは読む前のサイズ判定でエラー', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    const rel = 'scenarios/no04-goride/big.yaml';
    writeFileSync(join(project.root, rel), 'a'.repeat(MAX_YAML_BYTES + 1));
    const source = readYaml(project.root, rel);
    expect(source?.errors[0]?.message).toContain('大きすぎる');
    expect(source?.data).toBeNull();
  });

  it('フォルダになっているパスは例外にせずエラーを返す', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    const rel = 'scenarios/no04-goride/dir.yaml';
    mkdirSync(join(project.root, rel), { recursive: true });
    const source = readYaml(project.root, rel);
    expect(source?.errors[0]?.message).toContain('フォルダ');
  });

  it('validateProject は読めないファイルでも例外を投げない', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    mkdirSync(join(project.root, 'scenarios', 'broken', 'scenario.yaml'), { recursive: true });
    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(result.errors.some((e) => e.code === 'C17')).toBe(true);
  });
});

describe('validate の CLI', () => {
  it('読み込みエラーは「ファイル: [C17] 理由」で exit 1', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    const scenarioYaml = join(project.root, 'scenarios', project.files.scenario.id, 'scenario.yaml');
    // scenario.yaml をフォルダに置き換える
    rmSync(scenarioYaml, { force: true });
    mkdirSync(scenarioYaml, { recursive: true });

    const cli = join(process.cwd(), 'tools', 'validate', 'index.ts');
    const result = spawnSync(process.argv[0] ?? 'node', ['--experimental-strip-types', cli], {
      cwd: project.root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/\[C17\]/);
    expect(result.stderr).toMatch(/scenario\.yaml|scenarios/);
  });
});
