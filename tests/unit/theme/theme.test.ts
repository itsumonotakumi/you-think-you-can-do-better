// 配色（白背景が既定・ダークに切り替え）の確認。
// 実行時 DOM は使わず、設定の読み書きと Svelte / CSS の配線を見る。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { STORAGE_KEYS } from '../../../src/engine/types';
// @ts-ignore -- @types/node は入れていない（依存追加禁止）。Vitest は Node 上で動く。
import { readFileSync } from 'node:fs';

type StorageModule = typeof import('../../../src/storage/index.ts');

class FakeStorage implements Storage {
  readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const appSources = import.meta.glob<string>('/src/{main.ts,app/App.svelte,app/screens/S10Settings.svelte}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const localeSources = import.meta.glob<string>('/locales/*/ui/screens-a.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function source(key: string): string {
  const text = appSources[key];
  if (text === undefined) throw new Error(`missing ${key}`);
  return text;
}

function readYaml(key: string): Record<string, string> {
  const text = localeSources[key];
  if (text === undefined) throw new Error(`missing ${key}`);
  const parsed = parse(text);
  if (parsed === null || typeof parsed !== 'object') throw new Error(`invalid yaml: ${key}`);
  return parsed as Record<string, string>;
}

const app = source('/src/app/App.svelte');
const main = source('/src/main.ts');
const settingsScreen = source('/src/app/screens/S10Settings.svelte');
const css = readFileSync(
  new URL('../../../src/app/styles/base.css', import.meta.url).pathname,
  'utf8',
) as string;

let fake: FakeStorage;
let storage: StorageModule;

beforeEach(async () => {
  vi.resetModules();
  fake = new FakeStorage();
  vi.stubGlobal('localStorage', fake);
  storage = await import('../../../src/storage/index.ts');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('設定の theme', () => {
  it('既定は light', () => {
    expect(storage.DEFAULT_SETTINGS.theme).toBe('light');
    expect(storage.loadSettings().theme).toBe('light');
  });

  it('dark を保存して読み戻せる', () => {
    storage.saveSettings({ ...storage.DEFAULT_SETTINGS, theme: 'dark' });
    expect(storage.loadSettings().theme).toBe('dark');
  });

  it('light を保存して読み戻せる', () => {
    storage.saveSettings({ ...storage.DEFAULT_SETTINGS, theme: 'light' });
    expect(storage.loadSettings().theme).toBe('light');
  });

  it('不正値は light に落とす', () => {
    fake.data.set(STORAGE_KEYS.settings, JSON.stringify({ theme: 'blue' }));
    expect(storage.loadSettings().theme).toBe('light');

    fake.data.set(STORAGE_KEYS.settings, JSON.stringify({ theme: 1 }));
    expect(storage.loadSettings().theme).toBe('light');

    fake.data.set(STORAGE_KEYS.settings, JSON.stringify({ theme: null }));
    expect(storage.loadSettings().theme).toBe('light');
  });
});

describe('テーマの適用', () => {
  it('設定変更で html の data-theme を更新する', () => {
    expect(app).toMatch(/document\.documentElement\.dataset\.theme\s*=\s*\$settings\.theme/);
  });

  it('起動時はマウント前に適用する', () => {
    const applyAt = main.indexOf('dataset.theme');
    const mountAt = main.indexOf('mount(App');
    expect(applyAt).toBeGreaterThan(-1);
    expect(mountAt).toBeGreaterThan(-1);
    expect(applyAt).toBeLessThan(mountAt);
    expect(main).toMatch(/dataset\.theme\s*=\s*s\.theme/);
  });
});

describe('設定画面', () => {
  it('画面の色の選択欄がある', () => {
    expect(settingsScreen).toContain('id="set-theme"');
    expect(settingsScreen).toContain('value="light"');
    expect(settingsScreen).toContain('value="dark"');
    expect(settingsScreen).toMatch(/apply\(\{\s*theme:/);
  });

  it('文言キーが日本語と英語に揃っている', () => {
    const ja = readYaml('/locales/ja/ui/screens-a.yaml');
    const en = readYaml('/locales/en/ui/screens-a.yaml');
    expect(ja['sa.settings.theme']).toBe('画面の色');
    expect(ja['sa.settings.themeLight']).toBe('白（既定）');
    expect(ja['sa.settings.themeDark']).toBe('ダーク');
    expect(en['sa.settings.theme']).toBe('Color theme');
    expect(en['sa.settings.themeLight']).toBe('Light (default)');
    expect(en['sa.settings.themeDark']).toBe('Dark');
  });
});

describe('CSS', () => {
  it('既定（:root）はライト', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme=\'dark\']'));
    expect(root).toContain('color-scheme: light');
    expect(root).toContain('--bg: #ffffff');
  });

  it('ダークは data-theme で切り替える', () => {
    expect(css).toContain(":root[data-theme='dark']");
    const dark = css.slice(css.indexOf(":root[data-theme='dark']"));
    expect(dark).toContain('color-scheme: dark');
  });

  it('部品から参照する色の変数がライトとダークの両方にある', () => {
    const names = ['--bg', '--bg-soft', '--panel', '--panel-hover', '--line', '--line-strong',
      '--text', '--text-soft', '--muted', '--accent', '--accent-strong', '--accent-dim',
      '--on-accent', '--danger', '--danger-dim', '--warn', '--warn-dim', '--ok', '--focus',
      '--overlay', '--fx-stripe'];
    const light = css.slice(0, css.indexOf(":root[data-theme='dark']"));
    const dark = css.slice(css.indexOf(":root[data-theme='dark']"));
    for (const name of names) {
      expect(light, `light: ${name}`).toContain(`${name}:`);
      expect(dark, `dark: ${name}`).toContain(`${name}:`);
    }
  });
});
