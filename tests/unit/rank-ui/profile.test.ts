import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../../../src/engine/types';
import {
  NICKNAME_MAX, createClientId, ensureRankingProfile, isValidNickname, loadRankingProfile,
  normalizeNickname, saveRankingProfile,
} from '../../../src/app/ranking/profile';
import type { RankingStore } from '../../../src/app/ranking/profile';

class FakeStore implements RankingStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('ニックネーム', () => {
  it('前後の空白と制御文字を落とす', () => {
    expect(normalizeNickname('  たろう  ')).toBe('たろう');
    expect(normalizeNickname('a\nb\tc')).toBe('abc');
  });

  it('16文字までにする', () => {
    const long = 'あ'.repeat(NICKNAME_MAX + 5);
    expect(Array.from(normalizeNickname(long))).toHaveLength(NICKNAME_MAX);
  });

  it('1〜16文字だけ受け付ける', () => {
    expect(isValidNickname('たろう')).toBe(true);
    expect(isValidNickname('   ')).toBe(false);
    expect(isValidNickname('')).toBe(false);
    expect(isValidNickname('あ'.repeat(NICKNAME_MAX))).toBe(true);
    expect(isValidNickname('あ'.repeat(NICKNAME_MAX + 1))).toBe(false);
  });
});

describe('保存', () => {
  it('3つの項目だけを STORAGE_KEYS.ranking に保存する', () => {
    const store = new FakeStore();
    saveRankingProfile({ nickname: '  たろう ', consent: true, clientId: ' client-1 ' }, store);
    const raw = store.getItem(STORAGE_KEYS.ranking);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '{}')).toEqual({
      nickname: 'たろう',
      consent: true,
      clientId: 'client-1',
    });
  });

  it('壊れた保存値は空の設定に戻す', () => {
    const store = new FakeStore();
    store.setItem(STORAGE_KEYS.ranking, '{not json');
    expect(loadRankingProfile(store)).toEqual({ nickname: '', consent: false, clientId: '' });
    store.setItem(STORAGE_KEYS.ranking, JSON.stringify({ nickname: 3, consent: 'yes', clientId: [] }));
    expect(loadRankingProfile(store)).toEqual({ nickname: '', consent: false, clientId: '' });
  });

  it('古い形（一部だけ）でも読める', () => {
    const store = new FakeStore();
    store.setItem(STORAGE_KEYS.ranking, JSON.stringify({ nickname: 'はなこ' }));
    expect(loadRankingProfile(store)).toEqual({ nickname: 'はなこ', consent: false, clientId: '' });
  });
});

describe('端末 ID', () => {
  it('空でない ID を作る', () => {
    const id = createClientId();
    expect(id.length).toBeGreaterThan(0);
  });

  it('無ければ作って保存する', () => {
    const store = new FakeStore();
    const first = ensureRankingProfile(store);
    expect(first.clientId).not.toBe('');
    const second = ensureRankingProfile(store);
    expect(second.clientId).toBe(first.clientId);
  });

  it('保存済みの ID は変えない', () => {
    const store = new FakeStore();
    saveRankingProfile({ nickname: 'たろう', consent: true, clientId: 'fixed' }, store);
    expect(ensureRankingProfile(store).clientId).toBe('fixed');
  });
});
