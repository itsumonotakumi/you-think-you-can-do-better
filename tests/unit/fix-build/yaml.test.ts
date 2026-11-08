import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAX_YAML_BYTES, parseYamlText, readYaml } from '../../../tools/validate/source.ts';
import { createProject } from '../validate/helpers.ts';
import { validateProject } from '../../../tools/validate/checks.ts';
import { checkC16, normalizeForMatch } from '../../../tools/validate/checks.ts';
import type { Project } from '../../../tools/validate/project.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const ALIAS_BOMB = [
  'a: &a [1]',
  'b: &b [' + Array(10).fill('*a').join(',') + ']',
  'c: &c [' + Array(10).fill('*b').join(',') + ']',
  'd: &d [' + Array(10).fill('*c').join(',') + ']',
  '',
].join('\n');

describe('YAML の安全な読み込み', () => {
  it('2MB を超えるファイルは読まない', () => {
    const root = mkdtempSync(join(tmpdir(), 'ytcdb-yaml-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'data'), { recursive: true });
    writeFileSync(join(root, 'data', 'big.yaml'), `a: ${'x'.repeat(MAX_YAML_BYTES)}\n`);
    const source = readYaml(root, 'data/big.yaml');
    expect(source).not.toBeNull();
    expect(source!.errors.length).toBeGreaterThan(0);
    expect(source!.errors[0]!.message).toContain('大きすぎる');
  });

  it('アンカーの展開回数に上限を設ける', () => {
    const source = parseYamlText('bomb.yaml', ALIAS_BOMB);
    expect(source.errors.some((e) => /alias/i.test(e.message))).toBe(true);
  });

  it('循環参照でも無限再帰しない', () => {
    const source = parseYamlText('cycle.yaml', 'a: &a\n  b: *a\n');
    expect(source.errors).toEqual([]);
    const data = source.data as { a: unknown };
    expect(data.a).toBeDefined();
  });

  it('doc.warnings を拾う', () => {
    const source = parseYamlText('warn.yaml', 'a: !!unknown 1\n');
    expect(source.warnings.length).toBeGreaterThan(0);
  });

  it('警告は C17 として validate に出る', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    writeFileSync(join(project.root, 'locales', 'ja', 'notices.yaml'), 'criminal: !!unknown 悪い\n');
    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(result.errors.some((e) => e.code === 'C17' && e.message.includes('YAML の警告'))).toBe(true);
  });

  it('循環したシナリオ YAML でも validate が止まらない', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    writeFileSync(
      join(project.root, 'scenarios', 'no04-goride', 'scenario.yaml'),
      'id: no04-goride\nself: &a\n  loop: *a\n',
    );
    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

describe('照合用の正規化', () => {
  it('NFKC・空白・ゼロ幅をそろえる', () => {
    expect(normalizeForMatch('Ｇ Ｍ\u200bＯ')).toBe('gmo');
    expect(normalizeForMatch('You Think You Can Do Better?')).toBe('youthinkyoucandobetter?');
  });

  it('循環したオブジェクトを走査しても止まらない', () => {
    const cyclic: Record<string, unknown> = { title: { ja: 'gmo' } };
    cyclic.self = cyclic;
    const project = {
      scenarios: [{ id: 'x', dir: 'x', file: 'x', scenario: cyclic }],
      locales: {},
      audioManifest: null,
      denylist: { companies: ['GMO'], services: [], people: [], countries: [], comparisons: [] },
    } as unknown as Project;
    const issues = checkC16(project);
    expect(issues.length).toBe(1);
  });
});
