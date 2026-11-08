// 画面 S01〜S04, S10, S11, ErrorScreen の静的な確認。
// 実行時 DOM は使わず、Svelte コンパイルが通ること・文言キーの揃い・禁止記法の不在を見る。
import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { parse } from 'yaml';
// @ts-ignore -- @types/node は入れていない（依存追加禁止）。Vitest は Node 上で動く。
import { readFileSync } from 'node:fs';

const screenSources = import.meta.glob('/src/app/screens/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const localeSources = import.meta.glob('/locales/*/ui/screens-a.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const css = readFileSync(new URL('../../../src/app/styles/base.css', import.meta.url).pathname, 'utf8') as string;

const ownScreens = [
  'S01Title',
  'S02Prologue',
  'S03ScenarioSelect',
  'S04RoleSelect',
  'S10Settings',
  'S11Credits',
  'ErrorScreen',
] as const;

function source(name: string): string {
  const key = `/src/app/screens/${name}.svelte`;
  const text = screenSources[key];
  if (text === undefined) throw new Error(`missing ${key}`);
  return text;
}

function readYaml(path: string): Record<string, string> {
  const text = localeSources[path];
  if (text === undefined) throw new Error(`missing ${path}`);
  const parsed = parse(text);
  if (parsed === null || typeof parsed !== 'object') throw new Error(`invalid yaml: ${path}`);
  return parsed as Record<string, string>;
}

const ja = readYaml('/locales/ja/ui/screens-a.yaml');
const en = readYaml('/locales/en/ui/screens-a.yaml');

describe('Svelte コンパイル', () => {
  for (const name of ownScreens) {
    it(`${name} がコンパイルできる`, () => {
      const text = source(name);
      const result = compile(text, { filename: `${name}.svelte`, generate: 'client' });
      expect(result.js.code.length).toBeGreaterThan(0);
    });
  }

  it('担当画面に data-screen がある', () => {
    for (const name of ownScreens) {
      expect(source(name)).toContain('data-screen=');
    }
  });
});

describe('Svelte 5 の書き方', () => {
  const forbidden: [string, RegExp][] = [
    ['on:click などの旧イベント記法', /\son:[a-z]+=/],
    ['export let', /\bexport\s+let\b/],
    ['$: のリアクティブ文', /(^|\n)\s*\$:/],
    ['{@html}', /\{@html\b/],
    ['Math.random', /\bMath\.random\b/],
    ['Date.now', /\bDate\.now\b/],
    ['fetch', /\bfetch\s*\(/],
    ['new Function', /\bnew\s+Function\b/],
    ['eval', /\beval\s*\(/],
    ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ];

  for (const name of ownScreens) {
    for (const [label, pattern] of forbidden) {
      it(`${name} は ${label} を使わない`, () => {
        expect(pattern.test(source(name))).toBe(false);
      });
    }
  }
});

describe('UI 文言', () => {
  it('日本語と英語のキーが一致する', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it('キーはすべて sa. で始まり、値が空でない', () => {
    for (const [key, value] of Object.entries(ja)) {
      expect(key.startsWith('sa.'), key).toBe(true);
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(en)) {
      expect(key.startsWith('sa.'), key).toBe(true);
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('画面が参照する静的な t("sa...") キーが両言語に存在する', () => {
    const used = new Set<string>();
    for (const name of ownScreens) {
      const text = source(name);
      for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g)) {
        if (m[1] !== undefined) used.add(m[1]);
      }
      // テンプレートリテラルのうち、埋め込みのないものだけを対象にする
      for (const m of text.matchAll(/\bt\(\s*`([^`$]+)`/g)) {
        if (m[1] !== undefined) used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(20);
    for (const key of used) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
    }
  });

  it('動的に組み立てるキーの候補がそろっている', () => {
    const dynamic = [
      'sa.scenarios.status.latest',
      'sa.scenarios.status.standard',
      'sa.scenarios.status.retired',
      'sa.roles.role.executive',
      'sa.roles.role.officer',
      'sa.roles.role.lead',
      'sa.roles.role.analyst',
      'sa.roles.info.executive',
      'sa.roles.info.officer',
      'sa.roles.info.lead',
      'sa.roles.info.analyst',
      'sa.credits.kind.bgm',
      'sa.credits.kind.se',
      'sa.credits.kind.ambience',
    ];
    for (const key of dynamic) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
    }
  });

  it('t() の置き換え変数が日本語と英語で同じ', () => {
    const vars = (text: string) => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(ja)) {
      expect(vars(ja[key] ?? ''), key).toEqual(vars(en[key] ?? ''));
    }
  });
});

describe('base.css', () => {
  it('文字サイズ3段階を定義している', () => {
    expect(css).toContain('.font-small');
    expect(css).toContain('.font-medium');
    expect(css).toContain('.font-large');
  });

  it('640px未満のレイアウトを持つ', () => {
    expect(css).toContain('max-width: 640px');
  });

  it('フォーカスを見えるようにしている', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline');
  });

  it('外部フォントを読み込まない', () => {
    expect(css).not.toMatch(/@import\s+url/);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });
});
