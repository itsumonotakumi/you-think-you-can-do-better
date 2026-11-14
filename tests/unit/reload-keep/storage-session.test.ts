// 再読み込み用の保存（画面・最後のプレイ・処理済み・残り時間）の検証。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    clock: { day: 0, minutes: 540 }, phase: 'detect', pointId: 'p1',
    gauges: { damage: 20, flame: 0, trust: 70, stamina: 100 },
    cowardStreak: 0, rawScore: 0, fatal: false,
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

describe('画面の保存', () => {
  it('保存して読み戻せる', () => {
    const point = {
      screen: 'S09' as const, scenarioId: 'fixture', backTo: 'S01' as const,
      playRef: '2026-11-08T00:00:00Z', overlay: 'achievements' as const,
    };
    storage.saveResume(point);
    expect(storage.loadResume()).toEqual(point);
  });

  it('未知の画面・壊れた値は null（既定の項目だけ補う）', () => {
    fake.data.set(storage.SESSION_KEYS.screen, JSON.stringify({ screen: 'S99' }));
    expect(storage.loadResume()).toBeNull();

    fake.data.set(storage.SESSION_KEYS.screen, JSON.stringify({ screen: 'S05', backTo: 'S99' }));
    expect(storage.loadResume()).toEqual({
      screen: 'S05', scenarioId: null, backTo: 'S01', playRef: null, overlay: null,
    });

    fake.data.set(storage.SESSION_KEYS.screen, '{');
    expect(storage.loadResume()).toBeNull();
  });

  it('消去できる', () => {
    storage.saveResume({
      screen: 'S03', scenarioId: null, backTo: 'S01', playRef: null, overlay: null,
    });
    storage.clearResume();
    expect(storage.loadResume()).toBeNull();
  });
});

describe('最後に終えたプレイ', () => {
  it('終えたプレイだけを読み戻せる', () => {
    storage.saveLastPlay(state({ finished: false }));
    expect(storage.loadLastPlay()).toBeNull();

    const finished = state({ finished: true, pointId: null, rawScore: 300 });
    storage.saveLastPlay(finished);
    const loaded = storage.loadLastPlay();
    expect(loaded?.startedAt).toBe(finished.startedAt);
    expect(loaded?.scenarioId).toBe(finished.scenarioId);
    expect(loaded?.state).toEqual(finished);
  });

  it('シナリオ ID が状態と食い違う保存は捨てる', () => {
    fake.data.set(storage.SESSION_KEYS.lastPlay, JSON.stringify({
      scenarioId: 'other', state: state({ finished: true }),
    }));
    expect(storage.loadLastPlay()).toBeNull();
  });
});

describe('処理済みの記録', () => {
  it('同じ startedAt ではプレイ回数を数え直さない', () => {
    const first = storage.beginPlayOnce('fixture', 'executive', 'normal', 'at-1');
    expect(first).toBe(1);
    const again = storage.beginPlayOnce('fixture', 'executive', 'normal', 'at-1');
    expect(again).toBe(1);
    expect(storage.loadPlays()['fixture/executive']?.count).toBe(1);
  });

  it('新しい startedAt なら次の回数になる', () => {
    storage.beginPlayOnce('fixture', 'executive', 'normal', 'at-1');
    expect(storage.beginPlayOnce('fixture', 'executive', 'normal', 'at-2')).toBe(2);
    expect(storage.processedFor('at-1')).toBeNull();
  });

  it('記録・称号・ランキングの処理済みを startedAt ごとに残す', () => {
    storage.beginPlayOnce('fixture', 'executive', 'normal', 'at-1');
    storage.markRecorded('at-1');
    storage.markAchievements('at-1');
    storage.markRanking('at-1', 'attempted');
    let saved = storage.processedFor('at-1');
    expect(saved?.recorded).toBe(true);
    expect(saved?.achievements).toBe(true);
    expect(saved?.ranking).toBe('attempted');

    storage.markRanking('at-1', 'sent');
    saved = storage.processedFor('at-1');
    expect(saved?.ranking).toBe('sent');
    // 別のプレイの記録は混ざらない
    expect(storage.processedFor('at-2')).toBeNull();
  });

  it('壊れた保存は既定値で読み、未知のランキング状態は none', () => {
    fake.data.set(storage.SESSION_KEYS.processed, JSON.stringify({
      startedAt: 'at-1', playRegistered: 'yes', playCount: -3,
      recorded: 1, achievements: null, ranking: 'done',
    }));
    expect(storage.loadProcessed()).toEqual({
      startedAt: 'at-1', playRegistered: false, playCount: 0,
      recorded: false, achievements: false, ranking: 'none',
    });
  });
});

describe('残り時間', () => {
  it('保存して読み戻せる', () => {
    storage.saveTimer('S07', { key: 'q1', remaining: 12.5, total: 30 });
    expect(storage.loadTimer('S07')).toEqual({ key: 'q1', remaining: 12.5, total: 30 });
    expect(storage.loadTimer('S05')).toBeNull();
  });

  it('消去すると読めない', () => {
    storage.saveTimer('S05', { key: 'p1', remaining: 60, total: 60 });
    storage.clearTimer('S05');
    expect(storage.loadTimer('S05')).toBeNull();
  });

  it('壊れた値は捨てる', () => {
    fake.data.set(storage.SESSION_KEYS.timers, JSON.stringify({
      S05: { key: 'p1', remaining: -1, total: 60 },
      S07: { key: 'q1', remaining: 5, total: 30 },
    }));
    expect(storage.loadTimer('S05')).toBeNull();
    expect(storage.loadTimer('S07')?.remaining).toBe(5);
  });
});

describe('プロローグの下書き', () => {
  it('入力中の内容を保存して読み戻せる', () => {
    storage.savePrologueDraft({ comment: 'まだ途中', hours: '12' });
    expect(storage.loadPrologueDraft()).toEqual({ comment: 'まだ途中', hours: '12' });
    storage.clearPrologueDraft();
    expect(storage.loadPrologueDraft()).toBeNull();
  });

  it('長すぎる下書きは捨てる', () => {
    fake.data.set(storage.SESSION_KEYS.prologueDraft, JSON.stringify({
      comment: 'あ'.repeat(201), hours: '1',
    }));
    expect(storage.loadPrologueDraft()).toBeNull();
  });
});

describe('全消去', () => {
  it('再読み込み用のキーも消す', () => {
    storage.saveSettings({ ...storage.DEFAULT_SETTINGS });
    storage.saveResume({
      screen: 'S05', scenarioId: 'fixture', backTo: 'S01', playRef: null, overlay: null,
    });
    storage.saveLastPlay(state({ finished: true }));
    storage.saveTimer('S05', { key: 'p1', remaining: 10, total: 60 });

    storage.clearAll();

    expect(storage.loadResume()).toBeNull();
    expect(storage.loadLastPlay()).toBeNull();
    expect(storage.loadTimer('S05')).toBeNull();
    expect(storage.loadSettings()).toEqual(storage.DEFAULT_SETTINGS);
  });
});
