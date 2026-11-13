// GET /api/ranking の並び・期間・自分の順位
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../functions/_lib/types';
import { handleRanking, TOP_LIMIT } from '../../../functions/api/ranking';
import { FakeD1 } from './mock-d1';
import { getRequest } from './play-helper';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function makeEnv(db: FakeD1): Env {
  return { DB: db };
}

async function ranking(db: FakeD1, query: string) {
  const response = await handleRanking(getRequest(`/api/ranking?${query}`), makeEnv(db), { now: NOW });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function seed(db: FakeD1): void {
  db.addPlay({ client_id: 'client-low', score: -100, nickname: 'ひくい', created_at: NOW - 3 * DAY });
  db.addPlay({ client_id: 'client-mid', score: 400, nickname: 'ふつう', created_at: NOW - 2 * DAY });
  db.addPlay({ client_id: 'client-tie-a', score: 900, nickname: 'どうてんA', created_at: NOW - 5 * DAY });
  db.addPlay({ client_id: 'client-tie-b', score: 900, nickname: 'どうてんB', created_at: NOW - 4 * DAY });
  db.addPlay({ client_id: 'client-top', score: 1200, nickname: 'いちばん', rank: 'S', created_at: NOW - 1 * DAY });
  db.addPlay({ client_id: 'client-old', score: 1500, nickname: 'せんしゅう', created_at: NOW - 10 * DAY });
}

describe('handleRanking', () => {
  it('上位から順に返す（同点は先着）', async () => {
    const db = new FakeD1();
    seed(db);
    const result = await ranking(db, 'scenario=no01-nebula&role=lead&period=all');
    expect(result.status).toBe(200);
    const entries = result.body.entries as { position: number; nickname: string; score: number }[];
    expect(entries.map((entry) => entry.nickname)).toEqual([
      'せんしゅう', 'いちばん', 'どうてんA', 'どうてんB', 'ふつう', 'ひくい',
    ]);
    expect(entries.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.body.total).toBe(6);
    expect(result.body.mode).toBe('normal');
    expect(result.body.period).toBe('all');
  });

  it('period=week は直近 7 日だけを返す', async () => {
    const db = new FakeD1();
    seed(db);
    const result = await ranking(db, 'scenario=no01-nebula&role=lead&period=week');
    const entries = result.body.entries as { nickname: string }[];
    expect(entries.map((entry) => entry.nickname)).not.toContain('せんしゅう');
    expect(result.body.total).toBe(5);
  });

  it('clientId を渡すと自分の順位と上位◯% を返す', async () => {
    const db = new FakeD1();
    seed(db);
    const result = await ranking(
      db,
      'scenario=no01-nebula&role=lead&period=all&clientId=client-mid',
    );
    expect(result.body.self).toEqual({ position: 5, total: 6, percentile: 84 });
  });

  it('登録が無い clientId では self は null', async () => {
    const db = new FakeD1();
    seed(db);
    const result = await ranking(db, 'scenario=no01-nebula&role=lead&clientId=client-unknown');
    expect(result.body.self).toBeNull();
  });

  it('上位 50 件までに抑える', async () => {
    const db = new FakeD1();
    for (let i = 0; i < TOP_LIMIT + 10; i++) {
      db.addPlay({ client_id: `c-${i}`, score: i, created_at: NOW - i });
    }
    const result = await ranking(db, 'scenario=no01-nebula&role=lead&period=all');
    const entries = result.body.entries as unknown[];
    expect(entries).toHaveLength(TOP_LIMIT);
    expect(result.body.total).toBe(TOP_LIMIT + 10);
  });

  it('mode を指定して別々に集計する', async () => {
    const db = new FakeD1();
    db.addPlay({ client_id: 'c-normal', score: 100 });
    db.addPlay({ client_id: 'c-hard', score: 900, mode: 'hard' });
    const normal = await ranking(db, 'scenario=no01-nebula&role=lead&mode=normal');
    const hard = await ranking(db, 'scenario=no01-nebula&role=lead&mode=hard');
    expect(normal.body.total).toBe(1);
    expect(hard.body.total).toBe(1);
    expect((hard.body.entries as { score: number }[])[0]?.score).toBe(900);
  });

  it('パラメータが不正なら 400/404 を返す', async () => {
    const db = new FakeD1();
    expect((await ranking(db, 'role=lead')).status).toBe(404);
    expect((await ranking(db, 'scenario=no01-nebula')).status).toBe(400);
    expect((await ranking(db, 'scenario=no01-nebula&role=boss')).status).toBe(400);
    expect((await ranking(db, 'scenario=no01-nebula&role=lead&mode=easy')).status).toBe(400);
    expect((await ranking(db, 'scenario=no01-nebula&role=lead&period=month')).status).toBe(400);
  });

  it('POST と別オリジンを拒否する', async () => {
    const db = new FakeD1();
    const post = await handleRanking(
      new Request('https://yattemite.example/api/ranking?scenario=no01-nebula&role=lead', {
        method: 'POST',
      }),
      makeEnv(db),
      { now: NOW },
    );
    expect(post.status).toBe(405);

    const cross = await handleRanking(
      new Request('https://yattemite.example/api/ranking?scenario=no01-nebula&role=lead', {
        headers: { origin: 'https://example.com' },
      }),
      makeEnv(db),
      { now: NOW },
    );
    expect(cross.status).toBe(403);
  });
});
