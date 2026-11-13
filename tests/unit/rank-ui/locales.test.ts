// ランキング画面の文言（#7）。ranking.yaml のキーが両言語にそろっているかを見る。
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { RANKING_KEYS } from '../../../src/app/ranking/i18n';

const yamlSources = import.meta.glob<string>('/locales/*/ui/ranking.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const screenSources = import.meta.glob<string>('/src/app/screens/S12Ranking.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[full] = child;
    else Object.assign(out, flatten(child, full));
  }
  return out;
}

function load(lang: 'ja' | 'en'): Record<string, string> {
  const path = Object.keys(yamlSources).find((key) => key.includes(`/locales/${lang}/`));
  if (!path) throw new Error(`locale not found: ${lang}`);
  return flatten(parse(yamlSources[path] ?? ''));
}

const ja = load('ja');
const en = load('en');

describe('ランキングの文言', () => {
  it('日英で同じキーを持つ', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it('キーは rk. で始まり、値が空でない', () => {
    for (const [key, value] of [...Object.entries(ja), ...Object.entries(en)]) {
      expect(key.startsWith('rk.'), key).toBe(true);
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('画面が参照する静的なキーが両言語に存在する', () => {
    const text = screenSources['/src/app/screens/S12Ranking.svelte'];
    expect(text).toBeDefined();
    const used = new Set<string>();
    for (const m of (text ?? '').matchAll(/\bt\(\s*'([^']+)'/g)) {
      if (m[1] !== undefined) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    for (const key of used) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
    }
  });

  it('ほかの画面が使うキーもそろっている', () => {
    for (const key of Object.values(RANKING_KEYS)) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
    }
  });

  it('選択率の行には割合の差し込みがある', () => {
    expect(ja[RANKING_KEYS.reviewLine]).toContain('{percent}');
    expect(en[RANKING_KEYS.reviewLine]).toContain('{percent}');
  });
});
