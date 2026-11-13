// ランキングの有効判定（#7）。ビルド時の環境変数だけで決める。
// VITE_API_BASE が無いビルド（GitHub Pages 版）では、ランキング関連の UI を一切出さない。

/** 単体テスト用に env を差し替えられる形にしておく */
export interface RankingEnv {
  VITE_API_BASE?: string;
  VITE_TURNSTILE_SITEKEY?: string;
  DEV?: boolean;
}

/** 開発中の E2E だけが使う差し替え口。ビルドでは読まない */
export const DEV_API_BASE_KEY = '__YTCDB_API_BASE__';

/** 末尾のスラッシュを落とす。空文字は「未設定」のまま返す */
export function normalizeApiBase(raw: string | undefined): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  return trimmed.replace(/\/+$/, '') || '/';
}

/**
 * API のベース URL を決める。
 * 本番（DEV=false）は VITE_API_BASE だけを見る。開発時のみ E2E の差し替えを許す。
 */
export function resolveApiBase(env: RankingEnv, devOverride?: unknown): string {
  const fromEnv = normalizeApiBase(env.VITE_API_BASE);
  if (fromEnv) return fromEnv;
  if (env.DEV && typeof devOverride === 'string') return normalizeApiBase(devOverride);
  return '';
}

export function apiBase(): string {
  const env = import.meta.env as RankingEnv;
  const override = (globalThis as Record<string, unknown>)[DEV_API_BASE_KEY];
  return resolveApiBase(env, override);
}

export function isRankingEnabled(): boolean {
  return apiBase() !== '';
}

/** Turnstile のサイトキー。空白だけなら未設定とみなす */
export function turnstileSiteKey(): string {
  const raw = (import.meta.env as RankingEnv).VITE_TURNSTILE_SITEKEY;
  return typeof raw === 'string' ? raw.trim() : '';
}

/** ベース URL と API のパスをつなぐ */
export function apiUrl(base: string, path: string): string {
  if (base === '' || base === '/') return path;
  return `${base}${path}`;
}
