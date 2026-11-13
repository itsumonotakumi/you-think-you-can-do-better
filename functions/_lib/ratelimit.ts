// IP のハッシュ単位のレート制限（1分10回）。生の IP は保存しない。
import type { D1Database } from './types';

export const RATE_LIMIT_PER_MINUTE = 10;
const WINDOW_MS = 60_000;
/** 古い窓を消す猶予（分） */
const KEEP_WINDOWS = 10;

/** SHA-256 の 16 進。salt を混ぜると辞書照合をしにくくできる */
export async function hashIp(ip: string, salt = ''): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 制限内なら数えて true。超えていれば数えずに false */
export async function checkRateLimit(
  db: D1Database,
  ipHash: string,
  nowMs: number,
  limit = RATE_LIMIT_PER_MINUTE,
): Promise<boolean> {
  const windowStart = Math.floor(nowMs / WINDOW_MS);
  const row = await db
    .prepare('SELECT count FROM rate_limits WHERE ip_hash = ? AND window_start = ?')
    .bind(ipHash, windowStart)
    .first<{ count: number }>();
  if ((row?.count ?? 0) >= limit) return false;

  await db
    .prepare(
      'INSERT INTO rate_limits (ip_hash, window_start, count) VALUES (?, ?, 1) '
      + 'ON CONFLICT(ip_hash, window_start) DO UPDATE SET count = count + 1',
    )
    .bind(ipHash, windowStart)
    .run();
  // 古い窓の掃除は 5 分に 1 回だけ行う（毎回の書き込みを増やさない）
  if (windowStart % 5 === 0) {
    await db
      .prepare('DELETE FROM rate_limits WHERE window_start < ?')
      .bind(windowStart - KEEP_WINDOWS)
      .run();
  }
  return true;
}
