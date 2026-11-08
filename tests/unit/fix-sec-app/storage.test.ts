// 保存データの検証: pendingDraft と flags のキー（危険キー対策）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../../src/engine/types';
import type { PlayState } from '../../../src/engine/types';

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

function state(patch: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: 'fixture', scenarioVersion: '1.0.0', role: 'executive', playCount: 1,
    clock: { day: 1, minutes: 600 }, phase: 'contain', pointId: 'p1',
    gauges: { damage: 20, flame: 30, trust: 70, stamina: 100 },
    cowardStreak: 0, rawScore: 100, fatal: false,
    history: [], itemsEarned: [], itemsMissed: [], delayed: [], voicesShown: [],
    notes: [], deadlines: [], flags: {}, press: null,
    prologue: { comment: '', predictedHours: null },
    startedAt: '2026-11-08T00:00:00Z', pendingDraft: null, finished: false,
    ...patch,
  };
}

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

describe('pendingDraft の検証', () => {
  it('draft 名の形なら読み戻せる', () => {
    const saved = state({ pendingDraft: 'draft-first-report' });
    storage.saveProgress(saved);
    expect(storage.loadProgress()?.pendingDraft).toBe('draft-first-report');
  });

  for (const key of ['constructor', 'prototype', '__proto__', 'Draft', 'draft_1', 'draft 1', '']) {
    it(`危険・不正なキー ${JSON.stringify(key)} は捨てる`, () => {
      fake.data.set(STORAGE_KEYS.progress, JSON.stringify(state({ pendingDraft: key })));
      expect(storage.loadProgress()).toBeNull();
    });
  }
});

describe('flags の検証', () => {
  it('camelCase とイベント記録のキーは読み戻せる', () => {
    const saved = state({ flags: { contained: true, 'ev:ev-news': true, ppcPrelimFiled: false } });
    storage.saveProgress(saved);
    expect(storage.loadProgress()?.flags).toEqual({
      contained: true, 'ev:ev-news': true, ppcPrelimFiled: false,
    });
  });

  it('__proto__ などの危険キーを含む旗は捨てる', () => {
    fake.data.set(STORAGE_KEYS.progress, JSON.stringify(state()).replace('"flags":{}',
      '"flags":{"__proto__":true,"constructor":true,"prototype":true,"ok":true}'));
    expect(storage.loadProgress()).toBeNull();
  });

  it('記号を含むキーは捨てる', () => {
    fake.data.set(STORAGE_KEYS.progress, JSON.stringify(state()).replace('"flags":{}',
      '"flags":{"bad key":true}'));
    expect(storage.loadProgress()).toBeNull();
  });
});
