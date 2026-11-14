// 削除用の鍵（#7）。32 バイトの乱数を作り、localStorage に保存する。
import { describe, expect, it } from 'vitest';
import {
  DELETE_KEY_BYTES, DELETE_KEY_STORAGE, createDeleteKey, ensureDeleteKey, isValidDeleteKey,
  loadDeleteKey, saveDeleteKey,
} from '../../../src/app/ranking/delete-key';
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

describe('削除用の鍵', () => {
  it('32 バイトの乱数を 16 進 64 文字で作る', () => {
    const key = createDeleteKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key.length).toBe(DELETE_KEY_BYTES * 2);
  });

  it('毎回ちがう値になる（推測できない）', () => {
    expect(createDeleteKey()).not.toBe(createDeleteKey());
  });

  it('乱数が使えない環境では空文字を返す', () => {
    const broken = {} as Crypto;
    expect(createDeleteKey(broken)).toBe('');
  });

  it('32〜64 文字の英数字だけを受け付ける', () => {
    expect(isValidDeleteKey('a'.repeat(32))).toBe(true);
    expect(isValidDeleteKey('a'.repeat(64))).toBe(true);
    expect(isValidDeleteKey('a'.repeat(31))).toBe(false);
    expect(isValidDeleteKey('a'.repeat(65))).toBe(false);
    expect(isValidDeleteKey('a b')).toBe(false);
    expect(isValidDeleteKey(123)).toBe(false);
  });
});

describe('保存', () => {
  it('専用のキーに保存する', () => {
    const store = new FakeStore();
    const key = 'b'.repeat(64);
    saveDeleteKey(key, store);
    expect(store.getItem(DELETE_KEY_STORAGE)).toBe(key);
    expect(loadDeleteKey(store)).toBe(key);
  });

  it('壊れた保存値は無いものとして扱う', () => {
    const store = new FakeStore();
    store.setItem(DELETE_KEY_STORAGE, 'short');
    expect(loadDeleteKey(store)).toBe('');
  });

  it('保存済みなら同じ鍵を返し、無ければ作って保存する', () => {
    const store = new FakeStore();
    const created = ensureDeleteKey(store);
    expect(created).toMatch(/^[0-9a-f]{64}$/);
    expect(loadDeleteKey(store)).toBe(created);
    expect(ensureDeleteKey(store)).toBe(created);
  });

  it('保存に失敗しても、その場では同じ鍵を使える', () => {
    const store: RankingStore = {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
    };
    const created = ensureDeleteKey(store);
    expect(created).toMatch(/^[0-9a-f]{64}$/);
    expect(ensureDeleteKey(store)).toBe(created);
  });
});
