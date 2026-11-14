// サーバーのシナリオ一覧・設定・移行 SQL の整合（レビュー指摘 9・11・12）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import index from '../../../src/data/index.json';
import { findScenario, REFERENCES, SCENARIOS } from '../../../functions/_lib/scenarios';
import { LIST_CHOICES_LIMIT } from '../../../functions/_lib/db';
import { RATE_LIMIT_PER_MINUTE } from '../../../functions/_lib/ratelimit';

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8');
}

describe('サーバーのシナリオ一覧', () => {
  it('build:data が書き出した全シナリオを登録している（no11〜no16 を含む）', () => {
    const ids = index.map((summary) => summary.id);
    expect(ids).toContain('no11-hinata');
    expect(ids).toContain('no16-hajime');
    for (const id of ids) {
      expect(SCENARIOS.has(id), id).toBe(true);
    }
    expect(SCENARIOS.size).toBe(ids.length);
  });

  it('新しいシナリオでもランキングに参加できる', () => {
    for (const id of ['no11-hinata', 'no12-sorano', 'no16-hajime']) {
      const scenario = findScenario(id);
      expect(scenario, id).not.toBeNull();
      expect(Object.keys(scenario?.roles ?? {}).length, id).toBeGreaterThan(0);
    }
  });

  it('知らないシナリオは null', () => {
    expect(findScenario('no99-nothing')).toBeNull();
  });

  it('参照データを読めている', () => {
    expect(REFERENCES.length).toBeGreaterThan(0);
  });
});

describe('移行 SQL（0002）', () => {
  const sql = read('migrations/0002_ranking_hardening.sql');

  it('選択率の集計用に (scenario_id, role, mode, created_at DESC) の索引を足す', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS plays_recent\s+ON plays \(scenario_id, role, mode, created_at DESC\)/,
    );
  });

  it('日次カウンタと IP 単位の登録カウンタの表を足す', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS daily_writes');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ip_registrations');
  });
});

describe('設定', () => {
  const wrangler = read('wrangler.toml');

  it('Turnstile は既定で必須、開発用フラグは書かない', () => {
    expect(wrangler).toMatch(/REQUIRE_TURNSTILE = "true"/);
    // コメントでの言及はよいが、値としての設定はしない
    expect(wrangler).not.toMatch(/^\s*ALLOW_NO_TURNSTILE\s*=/m);
  });

  it('日次上限と IP あたりの上限を控えめにする', () => {
    expect(wrangler).toMatch(/DAILY_WRITE_LIMIT = "20000"/);
    expect(wrangler).toMatch(/MAX_REGISTRATIONS_PER_IP = "20"/);
  });

  it('許可ホストを設定する', () => {
    expect(wrangler).toMatch(/ALLOWED_HOSTS = "yattemite\.pages\.dev,localhost"/);
  });

  it('秘密鍵は wrangler.toml に書かない', () => {
    expect(wrangler).not.toContain('TURNSTILE_SECRET = "');
    expect(wrangler).not.toContain('IP_HASH_SECRET = "');
  });

  it('読み取りの上限は 1000 件、レート制限は 1 分 10 回', () => {
    expect(LIST_CHOICES_LIMIT).toBe(1000);
    expect(RATE_LIMIT_PER_MINUTE).toBe(10);
  });
});

describe('Turnstile の用途', () => {
  it('クライアントの action はサーバーの照合値と揃っている', async () => {
    const client = read('src/app/ranking/turnstile.ts');
    const { TURNSTILE_ACTION } = await import('../../../functions/_lib/turnstile');
    expect(TURNSTILE_ACTION).toBe('submit-play');
    expect(client).toContain(`TURNSTILE_ACTION = '${TURNSTILE_ACTION}'`);
    expect(client).toContain('action: TURNSTILE_ACTION');
  });
});

describe('再生', () => {  it('保存先の区分だけでなく、再生にも mode を渡す', () => {
    const replay = read('functions/_lib/replay.ts');
    const call = /startPlay\(([\s\S]*?)\);/.exec(replay);
    expect(call).not.toBeNull();
    expect(call?.[1]).toContain('sub.mode');
  });

  it('時間の改ざんは検証できないことを明記する', () => {
    expect(read('functions/_lib/replay.ts')).toContain('検証できない');
    expect(read('README.md')).toContain('時間');
  });
});
