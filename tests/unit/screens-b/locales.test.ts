import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { PHASES, SE_IDS } from '../../../src/engine/types';

// Node の型に依存しないよう、Vite の raw import で YAML を読む
const yamlSources = import.meta.glob<string>('../../../locales/*/ui/screens-b.yaml', {
  query: '?raw', import: 'default', eager: true,
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
  const source = yamlSources[path];
  if (source === undefined) throw new Error(`locale is empty: ${lang}`);
  return flatten(parse(source));
}

const ja = load('ja');
const en = load('en');

const DYNAMIC_KEYS = [
  ...['sns', 'news', 'board', 'chat', 'boss', 'vendor', 'attacker'].map((m) => `sb.media.${m}`),
  ...PHASES.map((p) => `sb.phase.${p}`),
  ...['damage', 'flame', 'trust', 'stamina'].map((g) => `sb.gauge.${g}`),
  ...SE_IDS.map((id) => `sb.caption.se.${id}`),
  'sb.caption.se.default',
  ...['minor', 'caution', 'serious', 'severe'].map((l) => `sb.level.damage.${l}`),
  ...['calm', 'caution', 'danger', 'outbreak'].map((l) => `sb.level.flame.${l}`),
  ...['fragile', 'thin', 'normal', 'strong'].map((l) => `sb.level.trust.${l}`),
  ...['exhausted', 'tired', 'normal', 'full'].map((l) => `sb.level.stamina.${l}`),
];

const appSources = import.meta.glob<string>('../../../src/app/**/*.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const logicSource = import.meta.glob<string>('../../../src/app/parts/logic.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/** 自分の担当画面と部品のソース */
function sourceFiles(): string[] {
  return [
    ...Object.entries(appSources)
      .filter(([path]) => path.includes('/screens/S05Main.svelte') || path.includes('/screens/S06Draft.svelte')
        || path.includes('/app/parts/'))
      .map(([, source]) => source),
    ...Object.values(logicSource),
  ];
}

/** ソース中の sb.* の参照を、静的キーと接頭辞に分ける */
function referencedKeys(): Set<string> {
  const found = new Set<string>();
  for (const source of sourceFiles()) {
    for (const match of source.matchAll(/sb\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*/g)) {
      found.add(match[0]);
    }
  }
  return found;
}

describe('画面文言（screens-b.yaml）', () => {
  it('日英で同じキーを持つ', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it('空の文言がない', () => {
    for (const [key, value] of [...Object.entries(ja), ...Object.entries(en)]) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('キーは sb. で始まる', () => {
    for (const key of Object.keys(ja)) expect(key.startsWith('sb.')).toBe(true);
  });

  it('動的に組み立てるキーがすべて揃っている', () => {
    for (const key of DYNAMIC_KEYS) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
    }
  });

  it('ソースが参照する sb.* がすべて定義されている', () => {
    const missing: string[] = [];
    for (const key of referencedKeys()) {
      if (ja[key] !== undefined) continue;
      // sb.phase / sb.gauge / sb.media / sb.caption.se のような接頭辞は、子キーがあればよい
      if (Object.keys(ja).some((defined) => defined.startsWith(`${key}.`))) continue;
      missing.push(key);
    }
    expect(missing).toEqual([]);
  });
});
