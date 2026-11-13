import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EndingResult, PlayState } from '../../../src/engine/types';
import { STORAGE_KEYS } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';

type AchievementsModule = typeof import('../../../src/app/achievements/index.ts');

const store = new Map<string, string>();

function stubStorage(): void {
  vi.stubGlobal('localStorage', {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, value); },
  });
}

function state(over: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 1,
    clock: { day: 0, minutes: 600 },
    phase: 'after',
    pointId: null,
    gauges: { damage: 20, flame: 30, trust: 60, stamina: 80 },
    cowardStreak: 0,
    rawScore: 0,
    fatal: false,
    history: [],
    itemsEarned: [],
    itemsMissed: [],
    delayed: [],
    voicesShown: [],
    notes: [],
    deadlines: [],
    flags: {},
    press: null,
    prologue: { comment: '', predictedHours: null },
    startedAt: '2026-11-08T00:00:00Z',
    pendingDraft: null,
    finished: true,
    ...over,
  };
}

const result: EndingResult = { raw: 300, multiplier: 1, official: 300, rank: 'B', sales: 100, fatal: false, playCount: 1 };
const AT = '2026-11-13T00:00:00.000Z';

let achievements: AchievementsModule;

beforeEach(async () => {
  store.clear();
  stubStorage();
  vi.resetModules();
  achievements = await import('../../../src/app/achievements/index.ts');
});

describe('保存と読み込み', () => {
  it('保存した記録をそのまま読み戻せる', () => {
    achievements.saveAchievements({ 'rank-s': { at: AT, scenarioId: fixture.id, role: 'executive' } });
    expect(achievements.loadAchievements()).toEqual({
      'rank-s': { at: AT, scenarioId: fixture.id, role: 'executive' },
    });
    expect(store.has(STORAGE_KEYS.achievements)).toBe(true);
  });

  it('壊れた JSON は空として扱う', () => {
    store.set(STORAGE_KEYS.achievements, '{not json');
    expect(achievements.loadAchievements()).toEqual({});
  });

  it('知らない id・危険なキー・不正なロールは捨てる', () => {
    store.set(STORAGE_KEYS.achievements, JSON.stringify({
      'rank-s': { at: AT, scenarioId: 's', role: 'executive' },
      'unknown-id': { at: AT, scenarioId: 's', role: 'executive' },
      ['__proto__']: { at: AT, scenarioId: 's', role: 'executive' },
      'flame-zero': { at: 3, scenarioId: 's', role: 'executive' },
      'coward-zero': { at: AT, scenarioId: 's', role: 'wizard' },
      'notes-3': { at: AT, scenarioId: 's', role: 'lead' },
    }));
    expect(achievements.loadAchievements()).toEqual({
      'rank-s': { at: AT, scenarioId: 's', role: 'executive' },
      'notes-3': { at: AT, scenarioId: 's', role: 'lead' },
    });
  });

  it('localStorage が無くても落ちず、メモリ上で読み書きできる', () => {
    vi.stubGlobal('localStorage', undefined);
    achievements.saveAchievements({ 'rank-s': { at: AT, scenarioId: fixture.id, role: 'lead' } });
    expect(achievements.loadAchievements()['rank-s']?.role).toBe('lead');
  });
});

describe('grantAchievements', () => {
  it('新しく獲得した称号だけを保存して返す', () => {
    const input = { state: state(), scenario: fixture, result, plays: {}, at: AT };
    const first = achievements.grantAchievements(input);
    expect(first.map((item) => item.id).sort())
      .toEqual(['coward-zero', 'damage-low', 'first-clear', 'no-fatal']);

    const saved = achievements.loadAchievements();
    expect(Object.keys(saved).sort()).toEqual(['coward-zero', 'damage-low', 'first-clear', 'no-fatal']);
    expect(saved['first-clear']).toEqual({ at: AT, scenarioId: fixture.id, role: 'executive' });

    expect(achievements.grantAchievements(input)).toEqual([]);
  });

  it('条件を満たさない称号は保存しない', () => {
    const input = { state: state({ finished: false }), scenario: fixture, result, plays: {}, at: AT };
    const granted = achievements.grantAchievements(input);
    expect(granted.map((item) => item.id)).not.toContain('first-clear');
    expect(achievements.loadAchievements()['first-clear']).toBeUndefined();
  });
});
