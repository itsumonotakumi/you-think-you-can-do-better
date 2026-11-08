// 起動の失敗を真っ白にせず、静的な案内を出す
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown) => void;

let handlers: Map<string, Handler>;
let target: { textContent: string };
let lang: { value: string };

beforeEach(() => {
  vi.resetModules();
  handlers = new Map();
  target = { textContent: '' };
  lang = { value: '' };
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: Handler): void => { handlers.set(type, fn); },
    removeEventListener: (): void => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
  vi.stubGlobal('document', {
    getElementById: () => target,
    documentElement: lang,
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
  });
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, value); },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('main.ts の例外境界', () => {
  it('mount の前に window の error / unhandledrejection を登録する', async () => {
    await import('../../../src/main.ts');
    expect(handlers.has('error')).toBe(true);
    expect(handlers.has('unhandledrejection')).toBe(true);
  });

  it('起動に失敗したら #app に日英の案内を出す', async () => {
    await import('../../../src/main.ts');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(target.textContent).toContain('読み込めませんでした。再読み込みしてください');
    expect(target.textContent).toContain('Failed to load');
  });

  it('起動中の例外ハンドラも同じ案内を出す', async () => {
    await import('../../../src/main.ts');
    target.textContent = '';
    handlers.get('error')?.(new Error('boom'));
    expect(target.textContent).toContain('読み込めませんでした。再読み込みしてください');
  });

  it('案内は textContent で入れ、HTML として解釈しない', () => {
    const sources = import.meta.glob<string>('/src/main.ts', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>;
    const source = Object.values(sources)[0] ?? '';
    expect(source).toContain('textContent');
    expect(source).not.toContain('innerHTML');
    expect(source).not.toContain('{@html');
  });
});
