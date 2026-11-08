import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createProject } from './helpers.ts';
import { buildData } from '../../../tools/build-data/build.ts';
import { validateProject } from '../../../tools/validate/checks.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('build-data', () => {
  it('index・scenario・references・locales・audio を書き出す', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    const out = join(project.root, 'out');
    const result = buildData({ root: project.root, outDir: out });

    expect(result.scenarios).toEqual(['no04-goride']);

    const index = readJson(join(out, 'index.json'));
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('no04-goride');
    expect(index[0].roles).toEqual([{ role: 'executive', estimateMinutes: 20 }]);

    const scenario = readJson(join(out, 'scenarios', 'no04-goride.json'));
    expect(scenario.roles.executive.points).toHaveLength(15);
    expect(scenario.title.ja).toBe('ゴーライド事件');
    expect(scenario.company.name.ja).toBe('株式会社ゴーライド');

    const references = readJson(join(out, 'references.json'));
    expect(references.map((ref: { id: string }) => ref.id)).toEqual(['ref-a', 'ref-prelim']);

    const locales = readJson(join(out, 'locales.json'));
    expect(locales.ja.strings['title.start']).toBe('はじめる');
    expect(locales.en.strings['title.start']).toBe('Start');
    expect(locales.ja.notices.criminal).toBe('悪いのは攻撃者です');

    expect(readJson(join(out, 'audio.json'))).toEqual([]);
  });

  it('retired は index に出さない', () => {
    const project = createProject((files) => {
      files.scenario.status = 'retired';
    });
    cleanups.push(project.cleanup);
    const out = join(project.root, 'out');
    buildData({ root: project.root, outDir: out });
    expect(readJson(join(out, 'index.json'))).toEqual([]);
  });

  it('シナリオが無いときは空の出力で検査も通る', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    rmSync(join(project.root, 'scenarios'), { recursive: true, force: true });
    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(result.errors).toEqual([]);

    const out = join(project.root, 'out');
    buildData({ root: project.root, outDir: out });
    expect(readJson(join(out, 'index.json'))).toEqual([]);
    expect(readJson(join(out, 'audio.json'))).toEqual([]);
  });
});
