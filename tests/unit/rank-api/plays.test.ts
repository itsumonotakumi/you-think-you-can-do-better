// POST /api/plays の受け付け・初回のみ登録・安全装置
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../functions/_lib/types';
import { handlePlays } from '../../../functions/api/plays';
import { FakeD1 } from './mock-d1';
import { makePlayRequest, playThrough, submissionBody, TEST_SCENARIO } from './play-helper';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const played = playThrough(TEST_SCENARIO, 'lead');
/** 検証を通る siteverify の応答（ホストと action を合わせる） */
const TURNSTILE_OK = { success: true, hostname: 'yattemite.pages.dev', action: 'submit-play' };

function makeEnv(db: FakeD1, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    // IP のハッシュ鍵は必須（未設定なら 503）
    IP_HASH_SECRET: 'test-secret',
    // 検証の省略はローカル開発の明示フラグだけ（Turnstile を見ないテスト用）
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

describe('handlePlays', () => {
  it('正しい記録を登録し、サーバーで計算した点数を返す', async () => {
    const db = new FakeD1();
    const result = await call(db, submissionBody(played));
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.score).toBe(played.score);
    expect(result.body.rank).toBe(played.rank);
    expect(result.body.position).toBe(1);
    expect(result.body.total).toBe(1);
    expect(result.body.percentile).toBe(100);
    expect(db.plays).toHaveLength(1);
  });

  it('送られてきた点数は使わない（改ざんしても反映されない）', async () => {
    const db = new FakeD1();
    const result = await call(db, submissionBody(played, { score: 999_999, rank: 'S' }));
    expect(result.status).toBe(200);
    expect(result.body.score).toBe(played.score);
    expect(result.body.rank).toBe(played.rank);
    expect(db.plays[0]?.score).toBe(played.score);
  });

  it('存在しない選択肢の記録を拒否する', async () => {
    const db = new FakeD1();
    const body = submissionBody(played);
    body.choices = body.choices.map((entry, index) =>
      index === 0 ? { ...entry, choiceId: 'no-such-choice' } : entry,
    );
    const result = await call(db, body);
    expect(result.status).toBe(422);
    expect(result.body.ok).toBe(false);
    expect(result.body.reason).toBe('unknown_choice');
    expect(db.plays).toHaveLength(0);
  });

  it('選択を足した記録を拒否する', async () => {
    const db = new FakeD1();
    const body = submissionBody(played);
    body.choices = [...body.choices, { pointId: 'x', choiceId: 'y' }];
    const result = await call(db, body);
    expect(result.status).toBe(422);
    expect(db.plays).toHaveLength(0);
  });

  it('同じ端末の 2 件目は登録しない（順位だけ返す）', async () => {
    const db = new FakeD1();
    const first = await call(db, submissionBody(played));
    expect(first.body.registered).toBe(true);

    const second = await call(
      db,
      submissionBody(played, { nickname: 'ふたつめ' }),
      { ip: '203.0.113.2' },
    );
    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);
    expect(second.body.registered).toBe(false);
    expect(second.body.score).toBe(played.score);
    expect(db.plays).toHaveLength(1);
    expect(db.plays[0]?.nickname).toBe('ためし');
  });

  it('2 件目にもっと高い点数を送っても、最初の記録が残る', async () => {
    const db = new FakeD1();
    const first = await call(db, submissionBody(played));
    const other = playThrough(TEST_SCENARIO, 'lead', (_point, choices) => choices[choices.length - 1]!.id);
    expect(other.score).not.toBe(played.score);

    const second = await call(db, submissionBody(other), { ip: '203.0.113.9' });
    expect(second.body.registered).toBe(false);
    expect(second.body.score).toBe(played.score);
    expect(db.plays[0]?.score).toBe(played.score);
  });

  it('ニックネームを正規化して保存する', async () => {
    const db = new FakeD1();
    await call(db, submissionBody(played, { nickname: '　ﾀｸﾐ　' }), { ip: '203.0.113.3' });
    expect(db.plays[0]?.nickname).toBe('タクミ');
  });

  it('不正なニックネームを拒否する', async () => {
    const db = new FakeD1();
    for (const nickname of ['', 'あ'.repeat(17), 'http://example.com', '死ね', 'あ\u200bい', 'あ\u0000い', 'http://例.jp']) {
      const result = await call(db, submissionBody(played, { nickname }), { ip: '203.0.113.4' });
      expect(result.status, nickname).toBe(400);
    }
    expect(db.plays).toHaveLength(0);
  });

  it('同じ IP から 1 分に 10 回を超えると 429', async () => {
    const db = new FakeD1();
    for (let i = 0; i < 10; i++) {
      const result = await call(db, submissionBody(played, { clientId: `client-${1000 + i}` }));
      expect(result.status, `#${i}`).toBe(200);
    }
    const over = await call(db, submissionBody(played, { clientId: 'client-2000' }));
    expect(over.status).toBe(429);
    expect(over.body.error).toBe('rate_limited');
  });

  it('1 日の書き込み上限を超えたら 503', async () => {
    const db = new FakeD1();
    const env = { DAILY_WRITE_LIMIT: '1' };
    const first = await call(db, submissionBody(played), { ip: '203.0.113.5', env });
    expect(first.status).toBe(200);
    const second = await call(
      db,
      submissionBody(played, { clientId: 'client-3000' }),
      { ip: '203.0.113.6', env },
    );
    expect(second.status).toBe(503);
    expect(second.body.error).toBe('write_limit_reached');
    expect(db.plays).toHaveLength(1);
  });

  it('Turnstile が必須の設定で秘密鍵が無ければ 503', async () => {
    const db = new FakeD1();
    const result = await call(db, submissionBody(played), {
      env: { REQUIRE_TURNSTILE: 'true', ALLOW_NO_TURNSTILE: undefined },
    });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe('turnstile_not_configured');
  });

  it('Turnstile の検証に失敗したら 403', async () => {
    const db = new FakeD1();
    const fetcher = (async () =>
      new Response(JSON.stringify({ success: false }), { status: 200 })) as unknown as typeof fetch;
    const result = await call(db, submissionBody(played, { turnstileToken: 'x' }), {
      env: { TURNSTILE_SECRET: 'secret' },
      fetcher,
    });
    expect(result.status).toBe(403);
    expect(result.body.error).toBe('turnstile_failed');
  });

  it('Turnstile の検証に成功すれば登録する', async () => {
    const db = new FakeD1();
    const fetcher = (async () =>
      new Response(JSON.stringify(TURNSTILE_OK), { status: 200 })) as unknown as typeof fetch;
    const result = await call(db, submissionBody(played, { turnstileToken: 'x' }), {
      env: { TURNSTILE_SECRET: 'secret' },
      fetcher,
    });
    expect(result.status).toBe(200);
    expect(db.plays).toHaveLength(1);
  });

  it('IP ハッシュの秘密鍵が無ければ 503', async () => {
    const db = new FakeD1();
    const result = await call(db, submissionBody(played), { env: { IP_HASH_SECRET: undefined } });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe('ip_hash_not_configured');
    expect(db.plays).toHaveLength(0);
  });

  it('知らないシナリオと版の違いを拒否する', async () => {
    const db = new FakeD1();
    const unknown = await call(db, submissionBody(played, { scenarioId: 'no99-nothing' }), {
      ip: '203.0.113.7',
    });
    expect(unknown.status).toBe(404);

    const version = await call(db, submissionBody(played, { scenarioVersion: '9.9.9' }), {
      ip: '203.0.113.8',
    });
    expect(version.status).toBe(409);
    expect(db.plays).toHaveLength(0);
  });

  it('別オリジンからの送信と GET を拒否する', async () => {
    const db = new FakeD1();
    const cross = await handlePlays(
      new Request('https://yattemite.example/api/plays', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://example.com' },
        body: JSON.stringify(submissionBody(played)),
      }),
      makeEnv(db),
      { now: NOW },
    );
    expect(cross.status).toBe(403);

    const get = await handlePlays(
      new Request('https://yattemite.example/api/plays'),
      makeEnv(db),
      { now: NOW },
    );
    expect(get.status).toBe(405);
  });
});
