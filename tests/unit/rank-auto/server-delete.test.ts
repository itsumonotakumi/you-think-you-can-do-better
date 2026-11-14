// DELETE /api/plays（#7）。自分の端末の記録を、鍵のハッシュが一致するときだけ消す。
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../functions/_lib/types';
import { handleDeletePlays, handlePlays, onRequest } from '../../../functions/api/plays';
import { handleRanking } from '../../../functions/api/ranking';
import { handleStats } from '../../../functions/api/stats';
import { hashDeleteKey } from '../../../functions/_lib/deletion';
import { FakeD1 } from '../rank-api/mock-d1';
import { makePlayRequest, playThrough, submissionBody, TEST_SCENARIO } from '../rank-api/play-helper';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const played = playThrough(TEST_SCENARIO, 'lead');
const CLIENT_ID = 'client-0001';
const DELETE_KEY = 'a'.repeat(64);

function makeEnv(db: FakeD1, overrides: Partial<Env> = {}): Env {
  return { DB: db, IP_HASH_SECRET: 'test-secret', ALLOW_NO_TURNSTILE: 'true', ...overrides };
}

function deleteRequest(body: unknown, ip = '203.0.113.1', origin?: string): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cf-connecting-ip': ip,
  };
  if (origin) headers.origin = origin;
  return new Request('https://yattemite.example/api/plays', {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  });
}

async function call(
  db: FakeD1,
  body: unknown,
  options: { ip?: string; env?: Partial<Env>; origin?: string } = {},
) {
  const response = await handleDeletePlays(
    deleteRequest(body, options.ip ?? '203.0.113.1', options.origin),
    makeEnv(db, options.env ?? {}),
    { now: NOW },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('登録時の保存', () => {
  it('削除用の鍵そのものではなく SHA-256 のハッシュを保存する', async () => {
    const db = new FakeD1();
    const response = await handlePlays(
      makePlayRequest(submissionBody(played, { deleteKey: DELETE_KEY, clientId: CLIENT_ID })),
      makeEnv(db),
      { now: NOW },
    );
    expect(response.status).toBe(200);
    expect(db.plays).toHaveLength(1);
    expect(db.plays[0]?.delete_key_hash).toBe(await hashDeleteKey(DELETE_KEY));
    expect(db.plays[0]?.delete_key_hash).not.toBe(DELETE_KEY);
  });

  it('不正な削除用の鍵は受け付けない', async () => {
    const db = new FakeD1();
    const response = await handlePlays(
      makePlayRequest(submissionBody(played, { deleteKey: 'short' })),
      makeEnv(db),
      { now: NOW },
    );
    expect(response.status).toBe(400);
    expect(db.plays).toHaveLength(0);
  });
});

describe('handleDeletePlays', () => {
  async function seed(db: FakeD1): Promise<void> {
    const hash = await hashDeleteKey(DELETE_KEY);
    db.addPlay({ client_id: CLIENT_ID, score: 0, scenario_id: 'no01-nebula', role: 'lead', delete_key_hash: hash });
    db.addPlay({ client_id: CLIENT_ID, score: 0, scenario_id: 'no02-x', role: 'officer', delete_key_hash: hash });
    db.addPlay({ client_id: CLIENT_ID, score: 0, scenario_id: 'no03-y', role: 'analyst', delete_key_hash: hash });
    // 別の端末。消してはいけない
    db.addPlay({ client_id: 'client-other', score: 0, scenario_id: 'no04-goride', role: 'lead', delete_key_hash: hash });
  }

  it('その端末の記録をすべて消す', async () => {
    const db = new FakeD1();
    await seed(db);
    const result = await call(db, { clientId: CLIENT_ID, deleteKey: DELETE_KEY });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, deleted: 3 });
    expect(db.plays.map((row) => row.client_id)).toEqual(['client-other']);
  });

  it('鍵が違えば何も消さない', async () => {
    const db = new FakeD1();
    await seed(db);
    const result = await call(db, { clientId: CLIENT_ID, deleteKey: 'b'.repeat(64) });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, deleted: 0 });
    expect(db.plays).toHaveLength(4);
  });

  it('ランキングの応答に削除用のハッシュを含めない', async () => {
    const db = new FakeD1();
    await seed(db);
    const hash = await hashDeleteKey(DELETE_KEY);
    const response = await handleRanking(
      new Request('https://yattemite.example/api/ranking?scenario=no01-nebula&role=lead&period=all'),
      makeEnv(db),
      { cache: null },
    );
    const text = await response.text();
    expect(text).not.toContain(hash);
    expect(text).not.toContain('delete_key_hash');
  });

  it('削除した記録は選択率の集計からも外れる', async () => {    const db = new FakeD1();
    await seed(db);
    const statsRequest = 'https://yattemite.example/api/stats?scenario=no01-nebula&role=lead';
    const before = await handleStats(new Request(statsRequest), makeEnv(db), { cache: null });
    expect(((await before.json()) as { total: number }).total).toBe(1);

    await call(db, { clientId: CLIENT_ID, deleteKey: DELETE_KEY });

    const after = await handleStats(new Request(statsRequest), makeEnv(db), { cache: null });
    expect(((await after.json()) as { total: number }).total).toBe(0);
  });

  it('端末 ID だけでは消せない', async () => {
    const db = new FakeD1();
    await seed(db);
    const result = await call(db, { clientId: CLIENT_ID, deleteKey: '' });
    expect(result.status).toBe(400);
    expect(db.plays).toHaveLength(4);
  });

  it('本文が不正なら 400', async () => {
    const db = new FakeD1();
    await seed(db);
    expect((await call(db, { clientId: 'x', deleteKey: DELETE_KEY })).status).toBe(400);
    expect((await call(db, { clientId: CLIENT_ID })).status).toBe(400);
    expect((await call(db, [])).status).toBe(400);
    expect(db.plays).toHaveLength(4);
  });

  it('同一オリジンだけを受け付ける', async () => {
    const db = new FakeD1();
    await seed(db);
    const result = await call(db, { clientId: CLIENT_ID, deleteKey: DELETE_KEY }, {
      origin: 'https://example.com',
    });
    expect(result.status).toBe(403);
    expect(db.plays).toHaveLength(4);
  });

  it('IP のハッシュ鍵が無ければ 503（辞書照合できる値を作らない）', async () => {
    const db = new FakeD1();
    await seed(db);
    const result = await call(db, { clientId: CLIENT_ID, deleteKey: DELETE_KEY }, {
      env: { IP_HASH_SECRET: undefined },
    });
    expect(result.status).toBe(503);
    expect(db.plays).toHaveLength(4);
  });

  it('1 分に 10 回を超えると 429', async () => {
    const db = new FakeD1();
    await seed(db);
    for (let i = 0; i < 10; i++) {
      const result = await call(db, { clientId: CLIENT_ID, deleteKey: DELETE_KEY }, { ip: '203.0.113.9' });
      expect(result.status, `#${i}`).toBe(200);
    }
    const over = await call(db, { clientId: CLIENT_ID, deleteKey: DELETE_KEY }, { ip: '203.0.113.9' });
    expect(over.status).toBe(429);
    expect(over.body.error).toBe('rate_limited');
  });

  it('POST 以外の既存の入口は DELETE を handleDeletePlays へ回す', async () => {
    const db = new FakeD1();
    await seed(db);
    const response = await onRequest({
      request: deleteRequest({ clientId: CLIENT_ID, deleteKey: DELETE_KEY }),
      env: makeEnv(db),
      params: {},
      waitUntil: () => undefined,
      next: async () => new Response(null),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deleted: 3 });
  });

  it('DELETE 以外は 405', async () => {
    const db = new FakeD1();
    const response = await handleDeletePlays(
      new Request('https://yattemite.example/api/plays', { method: 'POST' }),
      makeEnv(db),
      { now: NOW },
    );
    expect(response.status).toBe(405);
  });
});
