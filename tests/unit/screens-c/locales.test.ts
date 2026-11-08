import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { MISLEADING_TYPES } from '../../../src/engine/types';
import type { Axis } from '../../../src/engine/types';

const yamlSources = import.meta.glob<string>('/locales/*/ui/screens-c.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const screenSources = import.meta.glob<string>('/src/app/screens/*.svelte', {
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
  const text = yamlSources[path];
  if (text === undefined) throw new Error(`locale is empty: ${lang}`);
  return flatten(parse(text));
}

const ja = load('ja');
const en = load('en');

function ownScreenSources(): string[] {
  return Object.entries(screenSources)
    .filter(([path]) => /\/screens\/S0[789][A-Za-z]*\.svelte$/.test(path))
    .map(([, text]) => text);
}

function referencedKeys(): Set<string> {
  const found = new Set<string>();
  for (const text of ownScreenSources()) {
    for (const match of text.matchAll(/\bt\(\s*'(sc\.[^']+)'/g)) {
      if (match[1] !== undefined) found.add(match[1]);
    }
    for (const match of text.matchAll(/\bt\(\s*`(sc\.[^`$]+)`/g)) {
      if (match[1] !== undefined) found.add(match[1]);
    }
  }
  return found;
}

describe('画面文言（screens-c.yaml）', () => {
  it('日英で同じキーを持つ', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it('キーはすべて sc. で始まり、値が空でない', () => {
    for (const [key, value] of [...Object.entries(ja), ...Object.entries(en)]) {
      expect(key.startsWith('sc.'), key).toBe(true);
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('画面が参照する静的な t("sc...") キーが両言語に存在する', () => {
    const used = referencedKeys();
    expect(used.size).toBeGreaterThan(30);
    for (const key of used) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
    }
  });

  it('細目の軸の候補がそろっている', () => {
    for (const axis of ['time', 'order', 'wording', 'content', 'record', 'care'] as Axis[]) {
      const key = `sc.review.axis.${axis}`;
      expect(ja[key], key).toBeDefined();
      expect(en[key], key).toBeDefined();
    }
  });

  it('誘導の型の候補がそろっている', () => {
    for (const type of MISLEADING_TYPES) {
      const key = `sc.review.type.${type}`;
      expect(ja[key], key).toBeDefined();
      expect(en[key], key).toBeDefined();
    }
  });

  it('声の媒体の候補がそろっている', () => {
    for (const media of ['sns', 'news', 'board', 'chat', 'boss', 'vendor', 'attacker']) {
      const key = `sc.media.${media}`;
      expect(ja[key], key).toBeDefined();
      expect(en[key], key).toBeDefined();
    }
  });

  it('t() の置き換え変数が日本語と英語で同じ', () => {
    const vars = (text: string) => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
      .map((match) => match[1]).sort();
    for (const key of Object.keys(ja)) {
      expect(vars(ja[key] ?? ''), key).toEqual(vars(en[key] ?? ''));
    }
  });
});
