// IP のハッシュ単位のレート制限（1分10回）。生の IP は保存しない。
import type { D1Database } from './types';

export const RATE_LIMIT_PER_MINUTE = 10;
const WINDOW_MS = 60_000;
/** 古い窓を残す上限（48 時間）。投稿のたびに確率的に消す */
export const RATE_LIMIT_KEEP_MINUTES = 48 * 60;
/** 何分の 1 の確率で掃除するか（50 分に 1 回 = 2%） */
export const RATE_LIMIT_CLEANUP_EVERY = 50;
/** 端末登録の日次カウンタを残す日数 */
export const REGISTRATION_KEEP_DAYS = 2;

export function windowStartOf(nowMs: number): number {
  return Math.floor(nowMs / WINDOW_MS);
}

export function dayOf(nowMs: number): number {
  return Math.floor(nowMs / (24 * 60 * 60 * 1000));
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * IP を HMAC-SHA256 で匿名化する。
 * 単純なハッシュと違い、秘密鍵が無ければ候補 IP から照合できない。
 */
export async function hashIp(ip: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(ip)));
}

/**
 * 制限内なら数えて true。判定と加算は 1 文で行うので同時送信でも超過しない。
 * 上限の行が返らなければ false（数えずに捨てる）。
 */
export async function checkRateLimit(
  db: D1Database,
  ipHash: string,
  nowMs: number,
  limit = RATE_LIMIT_PER_MINUTE,
): Promise<boolean> {
  const windowStart = windowStartOf(nowMs);
  const result = await db
    .prepare(
      'INSERT INTO rate_limits (ip_hash, window_start, count) VALUES (?, ?, 1) '
      + 'ON CONFLICT(ip_hash, window_start) DO UPDATE SET count = count + 1 '
      + 'WHERE count < ? RETURNING count',
    )
    .bind(ipHash, windowStart, limit)
    .run<{ count: number }>();
  const row = result.results?.[0];
  return typeof row?.count === 'number' && row.count > 0;
}

/**
 * 古い行の掃除。投稿のたびに 2% の割合（50 分に 1 回）だけ実行し、書き込みを増やしすぎない。
 * 確率は乱数ではなく時刻から決める（同じ分なら必ず同じ結果になり、テストできる）。
 */
export async function cleanupOldRows(
  db: D1Database,
  nowMs: number,
  force = false,
): Promise<boolean> {
  const windowStart = windowStartOf(nowMs);
  if (!force && windowStart % RATE_LIMIT_CLEANUP_EVERY !== 0) return false;
  await db.batch([
    db
      .prepare('DELETE FROM rate_limits WHERE window_start < ?')
      .bind(windowStart - RATE_LIMIT_KEEP_MINUTES),
    db
      .prepare('DELETE FROM ip_registrations WHERE day < ?')
      .bind(dayOf(nowMs) - REGISTRATION_KEEP_DAYS),
  ]);
  return true;
}
