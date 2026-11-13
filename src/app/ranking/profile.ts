// ランキングの同意・ニックネーム・端末 ID の保存（#7）。STORAGE_KEYS.ranking を使う。
// 壊れた保存値は既定値に戻す（後方互換）。保存できない環境ではメモリ上で動く。
import { STORAGE_KEYS } from '../../engine/types';

export interface RankingProfile {
  nickname: string;
  consent: boolean;
  /** 端末ごとの乱数 ID。個人情報ではない */
  clientId: string;
}

/** テストで差し替えられる最小の保存先 */
export interface RankingStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const NICKNAME_MAX = 16;

const memory = new Map<string, string>();
const EMPTY: RankingProfile = { nickname: '', consent: false, clientId: '' };

function defaultStore(): RankingStore | null {
  try {
    const store = (globalThis as { localStorage?: RankingStore }).localStorage;
    if (store && typeof store.getItem === 'function' && typeof store.setItem === 'function') return store;
  } catch {
    // localStorage が無い・触れない環境ではメモリへ
  }
  return null;
}

function readRaw(store: RankingStore | null): string | null {
  if (store) {
    try {
      return store.getItem(STORAGE_KEYS.ranking);
    } catch {
      return null;
    }
  }
  return memory.get(STORAGE_KEYS.ranking) ?? null;
}

function writeRaw(store: RankingStore | null, value: string): void {
  if (store) {
    try {
      store.setItem(STORAGE_KEYS.ranking, value);
      return;
    } catch {
      // 保存できなくてもメモリへ退避する
    }
  }
  memory.set(STORAGE_KEYS.ranking, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** ニックネームから制御文字を除き、前後の空白を落とす */
export function normalizeNickname(raw: string): string {
  if (typeof raw !== 'string') return '';
  return Array.from(raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, NICKNAME_MAX).join('');
}

/** 1〜16文字。空白だけは不可 */
export function isValidNickname(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const length = Array.from(trimmed).length;
  return length >= 1 && length <= NICKNAME_MAX;
}

/** 端末 ID を作る。乱数は暗号論的なものだけを使う（Math.random は使わない） */
export function createClientId(cryptoObj?: Crypto): string {
  const c = cryptoObj ?? (globalThis as { crypto?: Crypto }).crypto;
  try {
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // 乱数が使えない環境では空 ID を返し、サーバー側で新規として扱わせる
  }
  return '';
}

export function sanitizeRankingProfile(value: unknown): RankingProfile {
  if (!isRecord(value)) return { ...EMPTY };
  const nickname = typeof value.nickname === 'string' ? normalizeNickname(value.nickname) : '';
  const consent = value.consent === true;
  const clientId = typeof value.clientId === 'string' ? value.clientId.trim().slice(0, 64) : '';
  return { nickname, consent, clientId };
}

export function loadRankingProfile(store?: RankingStore | null): RankingProfile {
  const target = store ?? defaultStore();
  const raw = readRaw(target);
  if (raw === null) return { ...EMPTY };
  try {
    return sanitizeRankingProfile(JSON.parse(raw) as unknown);
  } catch {
    return { ...EMPTY };
  }
}

export function saveRankingProfile(profile: RankingProfile, store?: RankingStore | null): void {
  const clean = sanitizeRankingProfile(profile);
  writeRaw(store ?? defaultStore(), JSON.stringify({
    nickname: clean.nickname,
    consent: clean.consent,
    clientId: clean.clientId,
  }));
}

/** 送信に使うプロフィール。端末 ID が無ければ作って保存する */
export function ensureRankingProfile(store?: RankingStore | null): RankingProfile {
  const target = store ?? defaultStore();
  const profile = loadRankingProfile(target);
  if (profile.clientId !== '') return profile;
  const next = { ...profile, clientId: createClientId() };
  saveRankingProfile(next, target);
  return next;
}
