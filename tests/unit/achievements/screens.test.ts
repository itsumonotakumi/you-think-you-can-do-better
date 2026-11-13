import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { parse } from 'yaml';
import { render } from 'svelte/server';
import { initI18n, setLang } from '../../../src/i18n';
import { STORAGE_KEYS } from '../../../src/engine/types';
import S13Achievements from '../../../src/app/screens/S13Achievements.svelte';

const screenSources = import.meta.glob<string>('/src/app/screens/*.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const localeSources = import.meta.glob<string>('/locales/*/ui/achievements.yaml', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

function source(name: string): string {
  const key = `/src/app/screens/${name}.svelte`;
  const text = screenSources[key];
  if (text === undefined) throw new Error(`missing ${key}`);
  return text;
}

function strings(lang: 'ja' | 'en'): Record<string, string> {
  const text = localeSources[`/locales/${lang}/ui/achievements.yaml`];
  if (text === undefined) throw new Error(`missing achievements.yaml: ${lang}`);
  return parse(text) as Record<string, string>;
}

const ja = strings('ja');
const en = strings('en');

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  get length() { return store.size; },
  clear: () => store.clear(),
  getItem: (key: string) => store.get(key) ?? null,
  key: (index: number) => [...store.keys()][index] ?? null,
  removeItem: (key: string) => { store.delete(key); },
  setItem: (key: string, value: string) => { store.set(key, value); },
});

initI18n({
  ja: { strings: ja, notices: {} },
  en: { strings: en, notices: {} },
} as unknown as Parameters<typeof initI18n>[0]);
setLang('ja');

beforeEach(() => {
  store.clear();
});

describe('Svelte コンパイル', () => {
  for (const name of ['S13Achievements', 'S08Ending', 'S01Title']) {
    it(`${name} がコンパイルできる`, () => {
      const result = compile(source(name), { filename: `${name}.svelte`, generate: 'server' });
      expect(result.js.code.length).toBeGreaterThan(0);
    });
  }

  it('S13 は data-screen を持つ', () => {
    expect(source('S13Achievements')).toContain('data-screen="S13Achievements"');
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
  ];

  for (const [label, pattern] of forbidden) {
    it(`S13 は ${label} を使わない`, () => {
      expect(pattern.test(source('S13Achievements'))).toBe(false);
    });
  }
});

describe('画面の導線', () => {
  it('タイトルから S13 を開ける', () => {
    const title = source('S01Title');
    expect(title).toContain('S13Achievements');
    expect(title).toContain('ACHIEVEMENTS_LABEL_KEY');
    // 文言は achievements.yaml 側に置く（screens-a.yaml を触らない）
    expect(title).not.toContain("t('ach.");
  });

  it('エンディングに「新しく獲得した称号」を出す', () => {
    const ending = source('S08Ending');
    expect(ending).toContain('grantAchievements');
    expect(ending).toContain('newAchievements');
    expect(ending).toContain("t('ach.newHeading')");
  });
});

describe('S13 の表示', () => {
  it('未獲得はぼかしたヒントだけを出す', () => {
    const { body } = render(S13Achievements);
    expect(body).toContain('称号一覧');
    expect(body).toContain('はじめての当事者');
    expect(body).toContain('最後までプレイする。');
    // 具体的な条件（説明）は出さない
    expect(body).not.toContain('はじめてエンディングまで到達した。');
    expect(body).toContain('未獲得');
  });

  it('獲得済みは条件と獲得日を出す', () => {
    store.set(STORAGE_KEYS.achievements, JSON.stringify({
      'rank-s': { at: '2026-11-13T10:00:00.000Z', scenarioId: 'no01-nebula', role: 'executive' },
    }));
    const { body } = render(S13Achievements);
    expect(body).toContain('ランクSを獲得した。');
    expect(body).toContain('2026-11-13');
    expect(body).toContain('1 / 22 獲得');
  });
});

describe('UI 文言', () => {
  it('日英のキーが一致する', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it('キーは ach. で始まり、値が空でない', () => {
    for (const [key, value] of [...Object.entries(ja), ...Object.entries(en)]) {
      expect(key.startsWith('ach.'), key).toBe(true);
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('置き換え変数が日英で同じ', () => {
    const vars = (text: string) => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(ja)) expect(vars(ja[key] ?? ''), key).toEqual(vars(en[key] ?? ''));
  });

  it('画面が使うキーがそろっている', () => {
    const used = ['ach.eyebrow', 'ach.title', 'ach.count', 'ach.scope.play', 'ach.scope.total',
      'ach.locked', 'ach.earnedAt', 'ach.back', 'ach.hintNote', 'ach.newHeading', 'ach.newNote', 'ach.open'];
    for (const key of used) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
    }
  });
});
