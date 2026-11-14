// 削除用の鍵（#7）。端末で 32 バイトの乱数を作って localStorage に保存する。
// サーバーには SHA-256 のハッシュだけを保存するので、DB が漏れても削除はできない。
import { rankingStore, type RankingStore } from './profile';

/** STORAGE_KEYS には足さない（共有契約を変えない）。ランキング専用の鍵 */
export const DELETE_KEY_STORAGE = 'ytcdb:v1:ranking:delete-key';

/** 32 バイト。16 進で 64 文字 */
export const DELETE_KEY_BYTES = 32;

/** サーバー側と同じ範囲。hex のほか base64url も将来使えるようにする */
export const DELETE_KEY_RE = /^[A-Za-z0-9_-]{32,64}$/;

/** 保存できなかった値（保存先ごと）。古い localStorage より優先する */
const fallback = new WeakMap<RankingStore, string>();
let fallbackWithoutStore = '';

function storeOf(store?: RankingStore | null): RankingStore | null {
  return store === undefined ? rankingStore() : store;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 推測できない削除用の鍵を作る。乱数が使えない環境では空文字 */
export function createDeleteKey(cryptoObj?: Crypto): string {
  const c = cryptoObj ?? (globalThis as { crypto?: Crypto }).crypto;
  try {
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(DELETE_KEY_BYTES);
      c.getRandomValues(bytes);
      return toHex(bytes);
    }
  } catch {
    // 乱数が使えない環境では削除できない（登録はできる）
  }
  return '';
}

export function isValidDeleteKey(value: unknown): value is string {
  return typeof value === 'string' && DELETE_KEY_RE.test(value);
}

export function loadDeleteKey(store?: RankingStore | null): string {
  const target = storeOf(store);
  if (target) {
    const saved = fallback.get(target);
    if (saved !== undefined) return saved;
    try {
      const raw = target.getItem(DELETE_KEY_STORAGE);
      if (raw !== null) return isValidDeleteKey(raw) ? raw : '';
    } catch {
      return '';
    }
    return '';
  }
  return isValidDeleteKey(fallbackWithoutStore) ? fallbackWithoutStore : '';
}

export function saveDeleteKey(key: string, store?: RankingStore | null): void {
  if (!isValidDeleteKey(key)) return;
  const target = storeOf(store);
  if (target) {
    fallback.delete(target);
    try {
      target.setItem(DELETE_KEY_STORAGE, key);
      return;
    } catch {
      // 保存できなくてもメモリへ退避して、この画面では削除できるようにする
    }
  }
  if (target) fallback.set(target, key);
  else fallbackWithoutStore = key;
}

/** 保存済みの鍵を返す。無ければ作って保存する */
export function ensureDeleteKey(store?: RankingStore | null): string {
  const saved = loadDeleteKey(store);
  if (saved !== '') return saved;
  const created = createDeleteKey();
  if (created !== '') saveDeleteKey(created, store);
  return created;
}
