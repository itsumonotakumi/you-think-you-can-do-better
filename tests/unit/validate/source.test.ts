import { describe, it, expect } from 'vitest';
import { parseYamlText, locate } from '../../../tools/validate/source.ts';

describe('source（行番号）', () => {
  it('マップの値と配列の要素の行を返す', () => {
    const source = parseYamlText('x.yaml', 'a: 1\nb:\n  - one\n  - two\n');
    const data = source.data as { a: number; b: string[] };
    expect(locate(data, 'a')?.line).toBe(1);
    expect(locate(data.b, 0)?.line).toBe(3);
    expect(locate(data.b, 1)?.line).toBe(4);
    expect(locate(data.b, 1)?.file).toBe('x.yaml');
  });

  it('構文エラーの行を返す', () => {
    const source = parseYamlText('bad.yaml', 'a: [1\n');
    expect(source.errors.length).toBeGreaterThan(0);
    expect(source.errors[0]?.line).toBe(2);
  });
});
