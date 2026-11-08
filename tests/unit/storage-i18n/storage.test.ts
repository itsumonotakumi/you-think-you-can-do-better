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

class BrokenStorage implements Storage {
  get length(): number { throw new Error('blocked'); }
  clear(): void { throw new Error('blocked'); }
  getItem(): string | null { throw new Error('blocked'); }
  key(): string | null { throw new Error('blocked'); }
  removeItem(): void { throw new Error('blocked'); }
  setItem(): void { throw new Error('blocked'); }
}

function state(): PlayState {
  return {
    scenarioId: 'fixture', scenarioVersion: '1.0.0', role: 'executive', playCount: 1,
    clock: { day: 0, minutes: 540 }, phase: 'detect', pointId: 'p1',
    gauges: { damage: 20, flame: 0, trust: 70, stamina: 100 },
    cowardStreak: 0, rawScore: 0, fatal: false,
    history: [], itemsEarned: [], itemsMissed: [], delayed: [], voicesShown: [],
    notes: [], deadlines: [], flags: {}, press: null,
    prologue: { comment: '', predictedHours: null },
    startedAt: '2026-11-08T00:00:00Z', pendingDraft: null, finished: false,
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

describe('設定', () => {
  it('保存が空なら既定値', () => {
    expect(storage.loadSettings()).toEqual(storage.DEFAULT_SETTINGS);
    expect(storage.memoryOnly).toBe(false);
  });

  it('保存して読み戻せる', () => {
    const settings = { ...storage.DEFAULT_SETTINGS, lang: 'en' as const, bgmVolume: 0.2, pressTimeScale: 2 as const };
    storage.saveSettings(settings);
    expect(storage.loadSettings()).toEqual(settings);
    expect(fake.data.has(STORAGE_KEYS.settings)).toBe(true);
  });

  it('壊れた値は既定値で補う', () => {
    fake.data.set(STORAGE_KEYS.settings, JSON.stringify({
      lang: 'fr', fontSize: 'huge', bgmVolume: 5, seVolume: -1,
      muted: 'yes', pressTimeScale: 3, soundNoticeShown: 1,
    }));
    expect(storage.loadSettings()).toEqual(storage.DEFAULT_SETTINGS);
  });

  it('正しい項目だけ残して壊れた項目を既定値にする', () => {
    fake.data.set(STORAGE_KEYS.settings, JSON.stringify({ lang: 'en', muted: true, bgmVolume: 9 }));
    expect(storage.loadSettings()).toEqual({
      ...storage.DEFAULT_SETTINGS, lang: 'en', muted: true,
    });
  });

  it('JSON として壊れていたら既定値', () => {
    fake.data.set(STORAGE_KEYS.settings, '{oops');
    expect(storage.loadSettings()).toEqual(storage.DEFAULT_SETTINGS);
  });

  it('localStorage が無ければ memoryOnly でメモリ上に保存する', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(storage.loadSettings()).toEqual(storage.DEFAULT_SETTINGS);
    expect(storage.memoryOnly).toBe(true);
    storage.saveSettings({ ...storage.DEFAULT_SETTINGS, lang: 'en' });
    expect(storage.loadSettings().lang).toBe('en');
  });

  it('localStorage が例外を投げても memoryOnly で動く', () => {
    vi.stubGlobal('localStorage', new BrokenStorage());
    storage.saveSettings({ ...storage.DEFAULT_SETTINGS, seVolume: 0.3 });
    expect(storage.memoryOnly).toBe(true);
    expect(storage.loadSettings().seVolume).toBe(0.3);
  });
});

describe('プレイ回数と記録', () => {
  it('回数は1始まりで増える', () => {
    expect(storage.nextPlayCount('fixture', 'executive')).toBe(1);
    expect(storage.registerPlayStart('fixture', 'executive')).toBe(1);
    expect(storage.nextPlayCount('fixture', 'executive')).toBe(2);
    expect(storage.registerPlayStart('fixture', 'executive')).toBe(2);
    expect(storage.loadPlays()['fixture/executive']?.count).toBe(2);
  });

  it('first は初回だけ、best は公式スコア最大を記録する', () => {
    storage.registerPlayStart('fixture', 'executive');
    storage.recordResult('fixture', 'executive', {
      rank: 'A', score: 800, raw: 900, playCount: 1, at: '2026-11-08T10:00:00Z',
    });
    let rec = storage.loadPlays()['fixture/executive'];
    expect(rec?.first).toEqual({ rank: 'A', score: 800, raw: 900, at: '2026-11-08T10:00:00Z' });
    expect(rec?.best).toEqual({ rank: 'A', score: 800, count: 1 });

    storage.registerPlayStart('fixture', 'executive');
    storage.recordResult('fixture', 'executive', {
      rank: 'B', score: 500, raw: 600, playCount: 2, at: '2026-11-08T11:00:00Z',
    });
    rec = storage.loadPlays()['fixture/executive'];
    expect(rec?.first?.rank).toBe('A');
    expect(rec?.best).toEqual({ rank: 'A', score: 800, count: 1 });

    storage.registerPlayStart('fixture', 'executive');
    storage.recordResult('fixture', 'executive', {
      rank: 'S', score: 1300, raw: 1500, playCount: 3, at: '2026-11-08T12:00:00Z',
    });
    rec = storage.loadPlays()['fixture/executive'];
    expect(rec?.first?.rank).toBe('A');
    expect(rec?.best).toEqual({ rank: 'S', score: 1300, count: 3 });
    expect(rec?.count).toBe(3);
  });

  it('開始登録なしでも recordResult の回数を受け取る', () => {
    storage.recordResult('fixture', 'lead', {
      rank: 'C', score: 10, raw: 20, playCount: 4, at: '2026-11-08T10:00:00Z',
    });
    expect(storage.loadPlays()['fixture/lead']?.count).toBe(4);
  });

  it('壊れた保存は捨てて、正しい項目だけ読む', () => {
    fake.data.set(STORAGE_KEYS.plays, JSON.stringify({
      good: { count: 2, first: null, best: null },
      bad: { count: 'x' },
    }));
    expect(storage.loadPlays()).toEqual({ good: { count: 2, first: null, best: null } });
  });

  it('JSON として壊れていたら空', () => {
    fake.data.set(STORAGE_KEYS.plays, '[]');
    expect(storage.loadPlays()).toEqual({});
  });
});

describe('進行中プレイとプロローグ', () => {
  it('進行中プレイを保存して読み戻せる', () => {
    const s = state();
    storage.saveProgress(s);
    expect(storage.loadProgress()).toEqual(s);
    storage.saveProgress(null);
    expect(storage.loadProgress()).toBeNull();
  });

  it('形が壊れた進行中プレイは null', () => {
    fake.data.set(STORAGE_KEYS.progress, JSON.stringify({ scenarioId: 'fixture' }));
    expect(storage.loadProgress()).toBeNull();
    const s = state();
    fake.data.set(STORAGE_KEYS.progress, JSON.stringify({ ...s, role: 'nobody' }));
    expect(storage.loadProgress()).toBeNull();
  });

  it('プロローグを保存して読み戻せる', () => {
    storage.savePrologue({ comment: 'ひどい', predictedHours: 48 });
    expect(storage.loadPrologue()).toEqual({ comment: 'ひどい', predictedHours: 48 });
  });

  it('壊れたプロローグは null', () => {
    fake.data.set(STORAGE_KEYS.prologue, JSON.stringify({ comment: 3 }));
    expect(storage.loadPrologue()).toBeNull();
  });
});

describe('全消去', () => {
  it('設定・回数・進行・プロローグをすべて消す', () => {
    storage.saveSettings({ ...storage.DEFAULT_SETTINGS, lang: 'en' });
    storage.registerPlayStart('fixture', 'executive');
    storage.saveProgress(state());
    storage.savePrologue({ comment: 'x', predictedHours: null });

    storage.clearAll();

    expect(storage.loadSettings()).toEqual(storage.DEFAULT_SETTINGS);
    expect(storage.loadPlays()).toEqual({});
    expect(storage.loadProgress()).toBeNull();
    expect(storage.loadPrologue()).toBeNull();
    for (const key of Object.values(STORAGE_KEYS)) expect(fake.data.has(key)).toBe(false);
  });
});
