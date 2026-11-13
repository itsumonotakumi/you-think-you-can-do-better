// 書き込み予算・レート制限・重複の扱い（レビュー指摘 3・4・5・10）
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../functions/_lib/types';
import {
  DEFAULT_DAILY_WRITE_LIMIT,
  DEFAULT_MAX_REGISTRATIONS_PER_IP,
  dailyWriteLimit,
  handlePlays,
  maxRegistrationsPerIp,
} from '../../../functions/api/plays';
import { FakeD1, type ExecResult } from '../rank-api/mock-d1';
import { makePlayRequest, playThrough, submissionBody, TEST_SCENARIO } from '../rank-api/play-helper';
import { countingDb } from './fake-cache';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const played = playThrough(TEST_SCENARIO, 'lead');

function makeEnv(db: FakeD1, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    IP_HASH_SECRET: 'test-secret',
    ALLOW_NO_TURNSTILE: 'true',
    ...overrides,
  };
}

async function call(
  db: FakeD1,
  body: unknown,
  options: { ip?: string; env?: Partial<Env>; fetcher?: typeof fetch } = {},
) {
  const response = await handlePlays(
    makePlayRequest(body, options.ip ?? '203.0.113.1'),
    makeEnv(db, options.env ?? {}),
    { now: NOW, fetcher: options.fetcher },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const TURNSTILE_OK = { success: true, hostname: 'yattemite.pages.dev', action: 'submit-play' };

describe('既定値', () => {
  it('日次上限は控えめ（20000 行）', () => {
    expect(DEFAULT_DAILY_WRITE_LIMIT).toBe(20_000);
    expect(dailyWriteLimit({} as Env)).toBe(20_000);
    expect(dailyWriteLimit({ DAILY_WRITE_LIMIT: '5' } as Env)).toBe(5);
  });

  it('IP あたりの 1 日の登録上限は 20 件', () => {
    expect(DEFAULT_MAX_REGISTRATIONS_PER_IP).toBe(20);
    expect(maxRegistrationsPerIp({} as Env)).toBe(20);
  });
});

describe('レート制限の順序', () => {
  it('本文が不正なら rate_limits も plays も書かない', async () => {
    const db = new FakeD1();
    const result = await call(db, { ...submissionBody(played), choices: 'no' }, { ip: '203.0.113.11' });
    expect(result.status).toBe(400);
    expect(db.writes).toBe(0);
    expect(db.rateLimits.size).toBe(0);
  });

  it('選択が不正なら rate_limits も plays も書かない', async () => {
    const db = new FakeD1();
    const body = submissionBody(played);
    body.choices = body.choices.map((entry, index) =>
      index === 0 ? { ...entry, choiceId: 'no-such-choice' } : entry,
    );
    const result = await call(db, body, { ip: '203.0.113.12' });
    expect(result.status).toBe(422);
    expect(db.writes).toBe(0);
    expect(db.rateLimits.size).toBe(0);
  });

  it('Turnstile で失敗したら rate_limits を書かない', async () => {
    const db = new FakeD1();
    const fetcher = (async () =>
      new Response(JSON.stringify({ success: false }), { status: 200 })) as unknown as typeof fetch;
    const result = await call(db, submissionBody(played, { turnstileToken: 'x' }), {
      ip: '203.0.113.13',
      env: { TURNSTILE_SECRET: 'secret', ALLOW_NO_TURNSTILE: undefined },
      fetcher,
    });
    expect(result.status).toBe(403);
    expect(db.writes).toBe(0);
    expect(db.rateLimits.size).toBe(0);
  });

  it('検証を通った送信だけ rate_limits を 1 増やす', async () => {
    const db = new FakeD1();
    const result = await call(db, submissionBody(played), { ip: '203.0.113.14' });
    expect(result.status).toBe(200);
    expect(db.rateLimits.size).toBe(1);
    expect([...db.rateLimits.values()]).toEqual([1]);
  });
});

describe('書き込み予算', () => {
  it('日次上限は plays の全件を数えず、1 行のカウンタで判定する', async () => {
    const inner = new FakeD1();
    const { db, queries } = countingDb(inner);
    await call(db as unknown as FakeD1, submissionBody(played), { ip: '203.0.113.21' });
    expect(queries.some((query) => query.includes('COUNT(*) AS n FROM plays WHERE created_at'))).toBe(false);
    expect(queries.some((query) => query.includes('daily_writes'))).toBe(true);
    expect(inner.dailyWrites.size).toBe(1);
  });

  it('上限に達したら 503 で、行を増やさない', async () => {
    const db = new FakeD1();
    const env = { DAILY_WRITE_LIMIT: '1' };
    const first = await call(db, submissionBody(played), { ip: '203.0.113.22', env });
    expect(first.status).toBe(200);
    const second = await call(db, submissionBody(played, { clientId: 'client-3000' }), {
      ip: '203.0.113.23',
      env,
    });
    expect(second.status).toBe(503);
    expect(second.body.error).toBe('write_limit_reached');
    expect(db.plays).toHaveLength(1);
  });
});

/** 最初の重複確認だけ空を返し、その後の登録で UNIQUE に当たる状況を作る */
class RacingD1 extends FakeD1 {
  private skipped = false;

  execute(query: string, values: unknown[]): ExecResult {
    if (!this.skipped && query.startsWith('SELECT id, client_id')) {
      this.skipped = true;
      return { rows: [], changes: 0, lastRowId: 0 };
    }
    return super.execute(query, values);
  }
}

describe('重複の扱い', () => {
  it('登録できなかったときは保存済みの記録を返す（今回の点数を返さない）', async () => {
    const db = new RacingD1();
    const saved = db.addPlay({
      client_id: 'client-0001',
      scenario_id: TEST_SCENARIO.id,
      role: 'lead',
      mode: 'normal',
      score: 123,
      rank: 'C',
      nickname: 'さきに',
      created_at: NOW - 1000,
    });

    const result = await call(db, submissionBody(played), { ip: '203.0.113.31' });
    expect(result.status).toBe(200);
    expect(result.body.registered).toBe(false);
    expect(result.body.score).toBe(saved.score);
    expect(db.plays).toHaveLength(1);
  });
});

describe('IP あたりの登録上限', () => {
  it('同じ IP から 1 日に上限を超えて登録できない', async () => {
    const db = new FakeD1();
    const env = { MAX_REGISTRATIONS_PER_IP: '2' };
    const first = await call(db, submissionBody(played, { clientId: 'client-a1' }), { ip: '203.0.113.41', env });
    const second = await call(db, submissionBody(played, { clientId: 'client-a2' }), { ip: '203.0.113.41', env });
    const third = await call(db, submissionBody(played, { clientId: 'client-a3' }), { ip: '203.0.113.41', env });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.error).toBe('too_many_registrations');
    expect(db.plays).toHaveLength(2);
  });

  it('別の IP なら登録できる', async () => {
    const db = new FakeD1();
    const env = { MAX_REGISTRATIONS_PER_IP: '1' };
    expect((await call(db, submissionBody(played, { clientId: 'client-b1' }), { ip: '203.0.113.42', env })).status).toBe(200);
    expect((await call(db, submissionBody(played, { clientId: 'client-b2' }), { ip: '203.0.113.43', env })).status).toBe(200);
  });
});

describe('Turnstile の照合', () => {
  it('ホストが許可外なら登録しない', async () => {
    const db = new FakeD1();
    const fetcher = (async () =>
      new Response(JSON.stringify({ ...TURNSTILE_OK, hostname: 'evil.example' }), {
        status: 200,
      })) as unknown as typeof fetch;
    const result = await call(db, submissionBody(played, { turnstileToken: 'x' }), {
      ip: '203.0.113.51',
      env: { TURNSTILE_SECRET: 'secret', ALLOW_NO_TURNSTILE: undefined },
      fetcher,
    });
    expect(result.status).toBe(403);
    expect(result.body.error).toBe('turnstile_host_mismatch');
    expect(db.plays).toHaveLength(0);
  });

  it('action が違えば登録しない', async () => {
    const db = new FakeD1();
    const fetcher = (async () =>
      new Response(JSON.stringify({ ...TURNSTILE_OK, action: 'other' }), {
        status: 200,
      })) as unknown as typeof fetch;
    const result = await call(db, submissionBody(played, { turnstileToken: 'x' }), {
      ip: '203.0.113.52',
      env: { TURNSTILE_SECRET: 'secret', ALLOW_NO_TURNSTILE: undefined },
      fetcher,
    });
    expect(result.status).toBe(403);
    expect(result.body.error).toBe('turnstile_action_mismatch');
    expect(db.plays).toHaveLength(0);
  });

  it('ローカル開発のフラグが無ければ、秘密鍵なしでは受け付けない', async () => {
    const db = new FakeD1();
    const result = await call(db, submissionBody(played), {
      env: { ALLOW_NO_TURNSTILE: undefined },
    });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe('turnstile_not_configured');
  });
});
