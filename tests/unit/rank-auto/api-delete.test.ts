// DELETE /api/plays のクライアント（#7）。同一オリジンへ clientId と削除用の鍵を送る。
import { describe, expect, it } from 'vitest';
import {
  deletePlays, submitPlay,
} from '../../../src/app/ranking/api';
import type { Fetcher } from '../../../src/app/ranking/api';
import type { RankingPlaySubmission } from '../../../src/app/ranking/submission';

function response(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as unknown as Response;
}

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(payload: unknown, ok = true): { calls: Call[]; impl: Fetcher } {
  const calls: Call[] = [];
  const impl: Fetcher = async (url, init) => {
    calls.push({ url, init });
    return response(payload, ok);
  };
  return { calls, impl };
}

describe('記録の削除', () => {
  it('DELETE で clientId と削除用の鍵を送る', async () => {
    const { calls, impl } = fakeFetch({ ok: true, deleted: 3 });
    const result = await deletePlays(
      { clientId: 'client-1', deleteKey: 'a'.repeat(64) },
      { base: 'https://api.example.com', fetchImpl: impl },
    );
    expect(result).toEqual({ ok: true, deleted: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.example.com/api/plays');
    expect(calls[0]?.init.method).toBe('DELETE');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      clientId: 'client-1',
      deleteKey: 'a'.repeat(64),
    });
  });

  it('サーバーの失敗を返す', async () => {
    const { impl } = fakeFetch({ ok: false, error: 'rate_limited' });
    expect(await deletePlays(
      { clientId: 'client-1', deleteKey: 'a'.repeat(64) },
      { base: 'https://api.example.com', fetchImpl: impl },
    )).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('通信できないときも例外にしない', async () => {
    const impl: Fetcher = async () => { throw new Error('offline'); };
    expect(await deletePlays(
      { clientId: 'client-1', deleteKey: 'a'.repeat(64) },
      { base: 'https://api.example.com', fetchImpl: impl },
    )).toEqual({ ok: false, error: 'network' });
  });

  it('無効なビルド・空の入力では通信しない', async () => {
    const { calls, impl } = fakeFetch({ ok: true, deleted: 0 });
    expect(await deletePlays(
      { clientId: 'client-1', deleteKey: 'a'.repeat(64) },
      { base: '', fetchImpl: impl },
    )).toEqual({ ok: false, error: 'disabled' });
    expect(await deletePlays(
      { clientId: '', deleteKey: 'a'.repeat(64) },
      { base: 'https://api.example.com', fetchImpl: impl },
    )).toEqual({ ok: false, error: 'missing_client_id' });
    expect(await deletePlays(
      { clientId: 'client-1', deleteKey: '' },
      { base: 'https://api.example.com', fetchImpl: impl },
    )).toEqual({ ok: false, error: 'missing_delete_key' });
    expect(calls).toHaveLength(0);
  });
});

describe('自動登録の送信', () => {
  it('削除用の鍵を本文に含める', async () => {
    const { calls, impl } = fakeFetch({ ok: true, score: 900, rank: 'A' });
    const submission: RankingPlaySubmission = {
      scenarioId: 'sc-1',
      scenarioVersion: '1.0.0',
      role: 'executive',
      mode: 'normal',
      choices: [],
      drafts: [],
      press: [],
      nickname: 'たろう',
      clientId: 'client-1',
      turnstileToken: '',
      deleteKey: 'b'.repeat(64),
    };
    await submitPlay(submission, { base: 'https://api.example.com', fetchImpl: impl });
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body.deleteKey).toBe('b'.repeat(64));
    expect(Object.hasOwn(body, 'score')).toBe(false);
  });
});
