// 読み取り API は 60 秒の共有キャッシュに載せ、同じ集計を繰り返さない
import { describe, expect, it } from 'vitest';
import type { D1Database, Env } from '../../../functions/_lib/types';
import { handleStats, MIN_SAMPLE } from '../../../functions/api/stats';
import { handleRanking } from '../../../functions/api/ranking';
import { FakeD1 } from '../rank-api/mock-d1';
import { getRequest } from '../rank-api/play-helper';
import { countingDb, FakeCache } from './fake-cache';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');

function collected() {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (promise: Promise<unknown>) => pending.push(promise), flush: () => Promise.all(pending) };
}

async function stats(db: D1Database, cache: FakeCache | null, query: string) {
  const scheduler = collected();
  const response = await handleStats(getRequest(`/api/stats?${query}`), { DB: db } as Env, {
    cache,
    waitUntil: scheduler.waitUntil,
  });
  await scheduler.flush();
  return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, unknown> };
}

async function ranking(db: D1Database, cache: FakeCache | null, query: string) {
  const scheduler = collected();
  const response = await handleRanking(getRequest(`/api/ranking?${query}`), { DB: db } as Env, {
    now: NOW,
    cache,
    waitUntil: scheduler.waitUntil,
  });
  await scheduler.flush();
  return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, unknown> };
}

function seedStats(db: FakeD1, count = MIN_SAMPLE): void {
  for (let i = 0; i < count; i++) {
    db.addPlay({
      client_id: `client-${i}`,
      score: 0,
      created_at: NOW - i,
      choices_json: JSON.stringify([{ pointId: 'p1', choiceId: i % 2 === 0 ? 'a' : 'b' }]),
    });
  }
}

describe('stats のキャッシュ', () => {
  it('2 回目は DB を読まず、公開キャッシュのヘッダを返す', async () => {
    const db = new FakeD1();
    seedStats(db);
    const { db: counted, queries } = countingDb(db);
    const cache = new FakeCache();

    const first = await stats(counted, cache, 'scenario=no01-nebula&role=lead');
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('public, max-age=60');
    const afterFirst = queries.length;
    expect(afterFirst).toBeGreaterThan(0);

    const second = await stats(counted, cache, 'scenario=no01-nebula&role=lead');
    expect(second.body).toEqual(first.body);
    expect(queries.length).toBe(afterFirst);
    expect(cache.puts).toBe(1);
  });

  it('条件が違えば別のキーで集計する', async () => {
    const db = new FakeD1();
    seedStats(db);
    const cache = new FakeCache();
    await stats(db, cache, 'scenario=no01-nebula&role=lead');
    expect(cache.store.size).toBe(1);
    await stats(db, cache, 'scenario=no01-nebula&role=lead&mode=hard');
    expect(cache.store.size).toBe(2);
  });

  it('キャッシュを無効にすると毎回 DB を読む', async () => {
    const db = new FakeD1();
    seedStats(db);
    const first = await stats(db, null, 'scenario=no01-nebula&role=lead');
    const second = await stats(db, null, 'scenario=no01-nebula&role=lead');
    expect(first.body).toEqual(second.body);
  });
});

describe('ranking のキャッシュ', () => {
  function seed(db: FakeD1): void {
    db.addPlay({ client_id: 'client-a', score: 100, nickname: 'A' });
    db.addPlay({ client_id: 'client-b', score: 900, nickname: 'B' });
  }

  it('上位一覧は共有キャッシュに載せ、応答に max-age を付ける', async () => {
    const db = new FakeD1();
    seed(db);
    const { db: counted, queries } = countingDb(db);
    const cache = new FakeCache();

    const first = await ranking(counted, cache, 'scenario=no01-nebula&role=lead');
    expect(first.headers.get('cache-control')).toBe('public, max-age=60');
    const afterFirst = queries.length;

    const second = await ranking(counted, cache, 'scenario=no01-nebula&role=lead');
    expect(second.body).toEqual(first.body);
    expect(queries.length).toBe(afterFirst);

    // 保存した値に self は含めない
    const stored = JSON.parse([...cache.store.values()][0]!) as Record<string, unknown>;
    expect(stored).not.toHaveProperty('self');
  });

  it('自分の順位は共有キャッシュに載せず、応答もキャッシュさせない', async () => {
    const db = new FakeD1();
    seed(db);
    const cache = new FakeCache();
    const result = await ranking(
      db,
      cache,
      'scenario=no01-nebula&role=lead&clientId=client-a',
    );
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.body.self).toEqual({ position: 2, total: 2, percentile: 100 });
    const stored = JSON.parse([...cache.store.values()][0]!) as Record<string, unknown>;
    expect(stored).not.toHaveProperty('self');
  });
});
