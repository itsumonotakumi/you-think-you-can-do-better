// レート制限は HMAC の匿名化と、1 文での原子的な判定で守る
import { describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  cleanupOldRows,
  dayOf,
  hashIp,
  RATE_LIMIT_CLEANUP_EVERY,
  RATE_LIMIT_KEEP_MINUTES,
  RATE_LIMIT_PER_MINUTE,
  windowStartOf,
} from '../../../functions/_lib/ratelimit';
import { FakeD1 } from '../rank-api/mock-d1';
import { countingDb } from './fake-cache';

/** window_start が掃除の対象になる時刻（50 の倍数の分） */
const CLEANUP_NOW = RATE_LIMIT_CLEANUP_EVERY * 1000 * 60_000;
const PLAIN_NOW = CLEANUP_NOW + 60_000;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('hashIp', () => {
  it('同じ IP と鍵なら同じ値になる', async () => {
    const a = await hashIp('203.0.113.1', 'secret');
    const b = await hashIp('203.0.113.1', 'secret');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('鍵が違えば値も変わる（鍵なしで候補 IP を照合できない）', async () => {
    const a = await hashIp('203.0.113.1', 'secret-a');
    const b = await hashIp('203.0.113.1', 'secret-b');
    expect(a).not.toBe(b);
  });

  it('単純な SHA-256(":IP") ではない', async () => {
    const hashed = await hashIp('203.0.113.1', 'secret');
    expect(hashed).not.toBe(await sha256Hex(':203.0.113.1'));
    expect(hashed).not.toBe(await sha256Hex('203.0.113.1'));
  });
});

describe('checkRateLimit', () => {
  it(`同じ分に ${RATE_LIMIT_PER_MINUTE} 回まで通し、超えたら拒否する`, async () => {
    const db = new FakeD1();
    const hash = await hashIp('203.0.113.5', 'secret');
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      expect(await checkRateLimit(db, hash, PLAIN_NOW), `#${i}`).toBe(true);
    }
    expect(await checkRateLimit(db, hash, PLAIN_NOW)).toBe(false);
    // 拒否しても数は増やさない
    expect(db.rateLimits.get(`${hash}|${windowStartOf(PLAIN_NOW)}`)).toBe(RATE_LIMIT_PER_MINUTE);
  });

  it('次の分になればまた通る', async () => {
    const db = new FakeD1();
    const hash = await hashIp('203.0.113.5', 'secret');
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      await checkRateLimit(db, hash, PLAIN_NOW);
    }
    expect(await checkRateLimit(db, hash, PLAIN_NOW + 60_000)).toBe(true);
  });

  it('判定と加算は 1 文（読んでから書く形にしない）', async () => {
    const inner = new FakeD1();
    const { db, queries } = countingDb(inner);
    await checkRateLimit(db, 'abc', PLAIN_NOW);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('ON CONFLICT(ip_hash, window_start)');
    expect(queries[0]).toContain('count < ?');
    expect(queries[0]).toContain('RETURNING count');
  });

  it('同時に投げても上限を超えた分は拒否する', async () => {
    const db = new FakeD1();
    const hash = await hashIp('203.0.113.9', 'secret');
    const results = await Promise.all(
      Array.from({ length: RATE_LIMIT_PER_MINUTE + 3 }, () => checkRateLimit(db, hash, PLAIN_NOW)),
    );
    expect(results.filter(Boolean)).toHaveLength(RATE_LIMIT_PER_MINUTE);
  });
});

describe('cleanupOldRows', () => {
  it('48 時間より古い窓だけを消す', async () => {
    const db = new FakeD1();
    const current = windowStartOf(CLEANUP_NOW);
    db.rateLimits.set(`keep|${current}`, 1);
    db.rateLimits.set(`old|${current - RATE_LIMIT_KEEP_MINUTES}`, 1);
    db.rateLimits.set(`older|${current - RATE_LIMIT_KEEP_MINUTES - 1}`, 1);
    db.ipRegistrations.set(`ip|${dayOf(CLEANUP_NOW) - 2}`, 3);
    db.ipRegistrations.set(`ip|${dayOf(CLEANUP_NOW) - 3}`, 3);

    expect(RATE_LIMIT_KEEP_MINUTES).toBe(48 * 60);
    expect(await cleanupOldRows(db, CLEANUP_NOW)).toBe(true);

    // 48 時間ちょうどは残し、それより古いものだけを消す
    expect([...db.rateLimits.keys()].sort()).toEqual(
      [`keep|${current}`, `old|${current - RATE_LIMIT_KEEP_MINUTES}`].sort(),
    );
    expect(db.rateLimits.has(`older|${current - RATE_LIMIT_KEEP_MINUTES - 1}`)).toBe(false);
    expect([...db.ipRegistrations.keys()]).toEqual([`ip|${dayOf(CLEANUP_NOW) - 2}`]);
  });

  it('掃除は 50 分に 1 回だけ動く（投稿のたびに書き込まない）', async () => {
    const db = new FakeD1();
    const { db: counted, queries } = countingDb(db);
    expect(await cleanupOldRows(counted, PLAIN_NOW)).toBe(false);
    expect(queries).toHaveLength(0);
    expect(await cleanupOldRows(counted, CLEANUP_NOW)).toBe(true);
    expect(queries.filter((query) => query.startsWith('BATCH'))).toHaveLength(1);
  });

  it('force ならいつでも動く（テスト・手動の掃除用）', async () => {
    const db = new FakeD1();
    expect(await cleanupOldRows(db, PLAIN_NOW, true)).toBe(true);
  });
});
