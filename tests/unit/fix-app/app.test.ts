import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { render } from 'svelte/server';
import { initI18n, setLang } from '../../../src/i18n';
import { saveProgress } from '../../../src/storage';
import type { PlayState } from '../../../src/engine/types';
import ErrorScreen from '../../../src/app/screens/ErrorScreen.svelte';
import * as appModule from '../../../src/app/App.svelte';

const app = appModule as unknown as { reasonMessage: (reason: unknown) => string };

const appSources = import.meta.glob<string>('/src/app/App.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const localeSources = import.meta.glob<string>('/locales/ja/ui/*.yaml', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const noticeSources = import.meta.glob<string>('/locales/ja/notices.yaml', {
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

const strings: Record<string, string> = {};
for (const source of Object.values(localeSources)) Object.assign(strings, flatten(parse(source)));
const notices = parse(Object.values(noticeSources)[0] ?? '') as Record<string, string>;
initI18n({
  ja: { strings, notices },
  en: { strings: {}, notices },
} as unknown as Parameters<typeof initI18n>[0]);
setLang('ja');

// 進行中プレイを保存できる localStorage
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  get length() { return store.size; },
  clear: () => store.clear(),
  getItem: (key: string) => store.get(key) ?? null,
  key: (index: number) => [...store.keys()][index] ?? null,
  removeItem: (key: string) => { store.delete(key); },
  setItem: (key: string, value: string) => { store.set(key, value); },
});

function state(): PlayState {
  return {
    scenarioId: 'no01-nebula', scenarioVersion: '1.0.0', role: 'executive', playCount: 1,
    clock: { day: 0, minutes: 600 }, phase: 'contain', pointId: 'p1',
    gauges: { damage: 10, flame: 20, trust: 60, stamina: 90 },
    cowardStreak: 0, rawScore: 0, fatal: false,
    history: [], itemsEarned: [], itemsMissed: [], delayed: [], voicesShown: [],
    notes: [], deadlines: [], flags: {}, press: null,
    prologue: { comment: '', predictedHours: null },
    startedAt: '2026-11-08T00:00:00Z', pendingDraft: null, finished: false,
  };
}

describe('例外の文言', () => {
  it('Error は message、文字列はそのまま、それ以外は文字にする', () => {
    expect(app.reasonMessage(new Error('こわれた'))).toBe('こわれた');
    expect(app.reasonMessage('文字列')).toBe('文字列');
    expect(app.reasonMessage(undefined)).toBe('');
    expect(app.reasonMessage({ toString: () => 'obj' })).toBe('obj');
  });

  it('文字にできない値でも落ちない', () => {
    expect(() => app.reasonMessage(Object.create(null))).not.toThrow();
    expect(app.reasonMessage(Object.create(null))).toBe('');
  });
});

describe('App.svelte の例外境界', () => {
  const source = Object.values(appSources)[0] ?? '';

  it('svelte:boundary と failed スニペットを持つ', () => {
    expect(source).toContain('<svelte:boundary');
    expect(source).toMatch(/onerror=\{\(error\)/);
    expect(source).toContain('{#snippet failed');
  });

  it('window の error と unhandledrejection を拾う', () => {
    expect(source).toContain("addEventListener('error'");
    expect(source).toContain("addEventListener('unhandledrejection'");
  });

  it('保存してからエラー画面に移す', () => {
    expect(source).toContain('saveProgress(state)');
    expect(source).toContain("screen.set('error')");
    expect(source).toContain('errorMessage.set(');
  });

  it('{@html} を使わない', () => {
    expect(source).not.toContain('{@html');
  });
});

describe('ErrorScreen の戻り先', () => {
  it('保存した進行中プレイから「続きから」と「タイトルへ」を出す', () => {
    saveProgress(state());
    const { body } = render(ErrorScreen);
    expect(body).toContain('続きから');
    expect(body).toContain('タイトルへ');
  });

  it('保存が無ければ「続きから」は出さず「タイトルへ」だけ出す', () => {
    saveProgress(null);
    const { body } = render(ErrorScreen);
    expect(body).toContain('タイトルへ');
    expect(body).toContain('続きから再開できるデータがありません。');
  });
});
