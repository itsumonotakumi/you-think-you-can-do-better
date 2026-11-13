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
  /** Turnstile の秘密鍵。未設定なら開発用として検証を飛ばす */
  TURNSTILE_SECRET?: string;
  /** 'true' のとき Turnstile の未設定を設定不備として拒否する（本番用） */
  REQUIRE_TURNSTILE?: string;
  /** 1日の書き込み上限。既定 50000 */
  DAILY_WRITE_LIMIT?: string;
  /** IP ハッシュに混ぜる任意の文字列（省略可） */
  RATE_LIMIT_SALT?: string;
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
