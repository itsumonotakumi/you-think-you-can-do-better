// GET /api/stats: 判断ごとの選択率と、少数のときに出さない門檻
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../functions/_lib/types';
import { handleStats, MIN_SAMPLE } from '../../../functions/api/stats';
import { FakeD1 } from './mock-d1';
import { getRequest } from './play-helper';

function makeEnv(db: FakeD1): Env {
  return { DB: db };
}

async function stats(db: FakeD1, query: string) {
  const response = await handleStats(getRequest(`/api/stats?${query}`), makeEnv(db));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function choicesBody(entries: { pointId: string; choiceId: string }[]): string {
  return JSON.stringify(entries);
}

describe('handleStats', () => {
  it('判断ごとの選択率を返す', async () => {
    const db = new FakeD1();
    for (let i = 0; i < 15; i++) {
      db.addPlay({ client_id: `client-a-${i}`, score: 0, choices_json: choicesBody([{ pointId: 'p1', choiceId: 'a' }]) });
    }
    for (let i = 0; i < 5; i++) {
      db.addPlay({ client_id: `client-b-${i}`, score: 0, choices_json: choicesBody([{ pointId: 'p1', choiceId: 'b' }]) });
    }
    const result = await stats(db, 'scenario=no01-nebula&role=lead');
    expect(result.status).toBe(200);
    expect(result.body.points).toEqual({ p1: { a: 75, b: 25 } });
    expect(result.body.total).toBe(20);
  });

  it('件数が 20 未満の判断は返さない', async () => {
    const db = new FakeD1();
    for (let i = 0; i < MIN_SAMPLE - 1; i++) {
      db.addPlay({ client_id: `client-c-${i}`, score: 0, choices_json: choicesBody([{ pointId: 'p1', choiceId: 'a' }]) });
    }
    const result = await stats(db, 'scenario=no01-nebula&role=lead');
    expect(result.body.points).toEqual({});
    expect(result.body.total).toBe(MIN_SAMPLE - 1);
  });

  it('判断ごとに別々に数える', async () => {
    const db = new FakeD1();
    for (let i = 0; i < 24; i++) {
      db.addPlay({
        client_id: `client-d-${i}`,
        score: 0,
        choices_json: choicesBody([
          { pointId: 'p1', choiceId: 'a' },
          { pointId: 'p2', choiceId: 'b' },
        ]),
      });
    }
    const result = await stats(db, 'scenario=no01-nebula&role=lead');
    expect(result.body.points).toEqual({ p1: { a: 100 }, p2: { b: 100 } });
  });

  it('壊れた記録は集計から除く', async () => {
    const db = new FakeD1();
    for (let i = 0; i < MIN_SAMPLE; i++) {
      db.addPlay({ client_id: `client-e-${i}`, score: 0, choices_json: 'not json' });
    }
    const result = await stats(db, 'scenario=no01-nebula&role=lead');
    expect(result.body.points).toEqual({});
    expect(result.body.total).toBe(MIN_SAMPLE);
  });

  it('パラメータが不正なら 400/404 を返す', async () => {
    const db = new FakeD1();
    expect((await stats(db, 'role=lead')).status).toBe(404);
    expect((await stats(db, 'scenario=no01-nebula')).status).toBe(400);
    expect((await stats(db, 'scenario=no01-nebula&role=boss')).status).toBe(400);
    expect((await stats(db, 'scenario=no01-nebula&role=lead&mode=easy')).status).toBe(400);
  });
});
