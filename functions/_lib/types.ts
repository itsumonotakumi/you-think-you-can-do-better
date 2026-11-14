// Cloudflare Pages Functions の最小限の型（@cloudflare/workers-types は使わない）
export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta: { changes?: number; last_row_id?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface Env {
  DB: D1Database;
  /** Turnstile の秘密鍵。未設定かつ開発用の明示フラグも無ければ 503 */
  TURNSTILE_SECRET?: string;
  /** 'false' のときだけ Turnstile を必須にしない（既定は必須） */
  REQUIRE_TURNSTILE?: string;
  /** ローカル開発専用。'true' のときだけ Turnstile の検証を省略する（wrangler.toml には書かない） */
  ALLOW_NO_TURNSTILE?: string;
  /** siteverify が返す hostname の許可リスト（カンマ区切り）。先頭 '.' はサフィックス一致 */
  ALLOWED_HOSTS?: string;
  /** IP のハッシュに使う秘密鍵（HMAC-SHA256）。未設定なら 503 */
  IP_HASH_SECRET?: string;
  /** 1日の登録件数上限（無料枠の安全装置）。既定 20000 */
  DAILY_WRITE_LIMIT?: string;
  /** 同じ IP ハッシュが 1 日に登録できる件数。既定 20 */
  MAX_REGISTRATIONS_PER_IP?: string;
}

export interface EventContext<E extends Env = Env> {
  request: Request;
  env: E;
  params: Record<string, string>;
  waitUntil(promise: Promise<unknown>): void;
  next(): Promise<Response>;
}

export type PagesFunction<E extends Env = Env> = (
  context: EventContext<E>,
) => Response | Promise<Response>;
