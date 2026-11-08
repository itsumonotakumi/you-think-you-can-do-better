import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProject } from '../validate/helpers.ts';
import {
  assertSafeScenarioId,
  buildData,
  isPathInside,
  SCENARIO_ID_RE,
} from '../../../tools/build-data/build.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('build-data のシナリオ id 検証', () => {
  it('安全な id だけを通す', () => {
    expect(SCENARIO_ID_RE.test('no04-goride')).toBe(true);
    expect(SCENARIO_ID_RE.test('goride')).toBe(true);
    expect(SCENARIO_ID_RE.test('no4-goride')).toBe(true); // 接頭辞なしの枝で通る
    expect(SCENARIO_ID_RE.test('No04-Goride')).toBe(false);
    expect(SCENARIO_ID_RE.test('../evil')).toBe(false);
    expect(SCENARIO_ID_RE.test('no04/goride')).toBe(false);
  });

  it('.. やフォルダ名との不一致を拒否する', () => {
    expect(() => assertSafeScenarioId('../evil', '../evil')).toThrow();
    expect(() => assertSafeScenarioId('no04-goride', 'no05-kogane')).toThrow();
    expect(() => assertSafeScenarioId(undefined, 'no04-goride')).toThrow();
  });

  it('パスが出力フォルダの外に出ないことを確認できる', () => {
    expect(isPathInside('/tmp/out', '/tmp/out/index.json')).toBe(true);
    expect(isPathInside('/tmp/out', '/tmp/out/scenarios/a.json')).toBe(true);
    expect(isPathInside('/tmp/out', '/tmp/out/../evil.json')).toBe(false);
    expect(isPathInside('/tmp/out', '/tmp/outside.json')).toBe(false);
  });

  it('フォルダ名と一致しても書式が不正な id では書き出さない', () => {
    const project = createProject((files) => {
      files.scenario.id = 'No04-Goride';
    });
    cleanups.push(project.cleanup);
    const out = join(project.root, 'out');
    expect(() => buildData({ root: project.root, outDir: out })).toThrow(/シナリオID/);
    expect(existsSync(join(out, 'index.json'))).toBe(false);
  });
});

describe('build-data の検査', () => {
  it('検査エラーがあれば書き出さない', () => {
    const project = createProject((files) => {
      delete files.scenario.version;
    });
    cleanups.push(project.cleanup);
    const out = join(project.root, 'out');
    expect(() => buildData({ root: project.root, outDir: out })).toThrow(/C01/);
    expect(existsSync(join(out, 'index.json'))).toBe(false);
  });

  it('C16（禁止語）でも書き出さない', () => {
    const project = createProject((files) => {
      files.scenario.tagline = { ja: 'GMO より早い', en: 'x' };
    });
    cleanups.push(project.cleanup);
    const out = join(project.root, 'out');
    expect(() => buildData({ root: project.root, outDir: out })).toThrow(/C16/);
    expect(existsSync(join(out, 'index.json'))).toBe(false);
  });

  it('検査に通れば JSON を書き出す', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    const out = join(project.root, 'out');
    const result = buildData({ root: project.root, outDir: out });
    expect(result.scenarios).toEqual(['no04-goride']);
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    expect(index[0].id).toBe('no04-goride');
  });
});
