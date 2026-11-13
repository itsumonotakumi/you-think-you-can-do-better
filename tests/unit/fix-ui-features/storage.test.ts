// レビュー指摘 #5（保存失敗後にメモリへ退避した値を読めない）の確認。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EndingResult, PlayState } from '../../../src/engine/types';
import { STORAGE_KEYS } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import {
  NICKNAME_MAX, createClientId, ensureRankingProfile, loadRankingProfile, saveRankingProfile,
} from '../../../src/app/ranking/profile';
import type { RankingProfile, RankingStore } from '../../../src/app/ranking/profile';

/** 書き込みだけ失敗する保存先（容量超過・プライベートブラウズの再現） */
class WriteFailingStore implements RankingStore {
  readonly data = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded');
    this.data.set(key, value);
  }
}

describe('ランキング設定の退避', () => {
  it('保存に失敗したら、次はメモリ上の値を返す', () => {
    const store = new WriteFailingStore();
    saveRankingProfile({ nickname: 'もとの名前', consent: false, clientId: 'old' }, store);
    store.failWrites = true;

    const next: RankingProfile = { nickname: 'あたらしい', consent: true, clientId: 'new' };
    saveRankingProfile(next, store);
    // localStorage には古い値が残っている
    expect(JSON.parse(store.data.get(STORAGE_KEYS.ranking) ?? '{}').nickname).toBe('もとの名前');
    expect(loadRankingProfile(store)).toEqual(next);
  });

  it('端末 ID も退避した値を読み、作り直さない', () => {
    const store = new WriteFailingStore();
    store.failWrites = true;
    const first = ensureRankingProfile(store);
    expect(first.clientId).not.toBe('');
    expect(ensureRankingProfile(store).clientId).toBe(first.clientId);
  });

  it('保存に成功し直したら localStorage を読み直す', () => {
    const store = new WriteFailingStore();
    store.failWrites = true;
    saveRankingProfile({ nickname: '退避', consent: true, clientId: 'x' }, store);
    store.failWrites = false;
    saveRankingProfile({ nickname: '保存', consent: true, clientId: 'x' }, store);
    expect(loadRankingProfile(store).nickname).toBe('保存');
    expect(JSON.parse(store.data.get(STORAGE_KEYS.ranking) ?? '{}').nickname).toBe('保存');
  });
});

describe('称号の退避', () => {
  const store = new Map<string, string>();
  let failing = false;

  function stubStorage(): void {
    vi.stubGlobal('localStorage', {
      get length() { return store.size; },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => [...store.keys()][index] ?? null,
      removeItem: (key: string) => { store.delete(key); },
      setItem: (key: string, value: string) => {
        if (failing) throw new Error('quota exceeded');
        store.set(key, value);
      },
    });
  }

  function playState(): PlayState {
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
    };
  }

  const result: EndingResult = {
    raw: 300, multiplier: 1, official: 300, rank: 'B', sales: 100, fatal: false, playCount: 1,
  };
  const AT = '2026-11-13T00:00:00.000Z';

  beforeEach(async () => {
    store.clear();
    failing = false;
    stubStorage();
    vi.resetModules();
  });

  it('保存に失敗したら、古い保存値ではなくメモリ上の値を使う', async () => {
    const achievements = await import('../../../src/app/achievements/index.ts');
    achievements.saveAchievements({ 'rank-s': { at: AT, scenarioId: 'old', role: 'lead' } });

    failing = true;
    achievements.saveAchievements({ 'rank-s': { at: AT, scenarioId: 'new', role: 'executive' } });
    // localStorage には古い記録が残る
    expect(JSON.parse(store.get(STORAGE_KEYS.achievements) ?? '{}')['rank-s'].scenarioId).toBe('old');
    expect(achievements.loadAchievements()['rank-s']?.scenarioId).toBe('new');
  });

  it('保存できたことを確認できないときは、その値を優先し続ける', async () => {
    const achievements = await import('../../../src/app/achievements/index.ts');
    failing = true;
    achievements.saveAchievements({ 'notes-3': { at: AT, scenarioId: 'x', role: 'analyst' } });
    expect(achievements.loadAchievements()['notes-3']?.role).toBe('analyst');
  });
});

describe('既存の定数', () => {
  it('ニックネームの上限と端末 ID は変わらない', () => {
    expect(NICKNAME_MAX).toBe(16);
    expect(createClientId().length).toBeGreaterThan(0);
  });
});
