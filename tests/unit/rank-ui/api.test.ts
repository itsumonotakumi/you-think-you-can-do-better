import { describe, expect, it } from 'vitest';
import type { ChoiceStatsResponse, PlaySubmission } from '../../../src/engine/types';
import {
  fetchChoiceStats, fetchRanking, submitPlay,
} from '../../../src/app/ranking/api';
import type { Fetcher } from '../../../src/app/ranking/api';

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

const submission: PlaySubmission = {
  scenarioId: 'sc-1',
  scenarioVersion: '1.0.0',
  role: 'executive',
  mode: 'normal',
  choices: [{ pointId: 'p1', choiceId: 'c1' }],
  drafts: [],
  press: [],
  nickname: 'たろう',
  clientId: 'client-1',
  turnstileToken: '',
};

describe('送信', () => {
  it('点数を付けずに POST する', async () => {
    const { calls, impl } = fakeFetch({ ok: true, score: 900, rank: 'A', position: 3, total: 40, percentile: 8 });
    const result = await submitPlay(submission, { base: 'https://api.example.com', fetchImpl: impl });

    expect(result).toEqual({ ok: true, score: 900, rank: 'A', position: 3, total: 40, percentile: 8 });
    expect(calls[0]?.url).toBe('https://api.example.com/api/plays');
    expect(calls[0]?.init.method).toBe('POST');
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body.nickname).toBe('たろう');
    expect(Object.hasOwn(body, 'score')).toBe(false);
  });

  it('通信の失敗は静かに ok:false にする', async () => {
    const impl: Fetcher = async () => {
      throw new Error('offline');
    };
    expect(await submitPlay(submission, { base: 'https://api.example.com', fetchImpl: impl }))
      .toEqual({ ok: false, error: 'network' });
  });

  it('HTTP エラーも ok:false', async () => {
    const { impl } = fakeFetch({ ok: true, score: 1, rank: 'S' }, false);
    expect(await submitPlay(submission, { base: 'https://api.example.com', fetchImpl: impl }))
      .toEqual({ ok: false, error: 'network' });
  });

  it('API が無効なら送らない', async () => {
    const { calls, impl } = fakeFetch({ ok: true });
    expect(await submitPlay(submission, { base: '', fetchImpl: impl }))
      .toEqual({ ok: false, error: 'disabled' });
    expect(calls).toHaveLength(0);
  });

  it('応答の形が違えば invalid', async () => {
    const { impl } = fakeFetch({ hello: 'world' });
    expect(await submitPlay(submission, { base: '/api', fetchImpl: impl }))
      .toEqual({ ok: false, error: 'invalid' });
  });
});

describe('ランキング', () => {
  it('シナリオ・ロール・期間・モードを渡す', async () => {
    const { calls, impl } = fakeFetch({
      scenarioId: 'sc-1', role: 'executive', mode: 'normal', period: 'week',
      entries: [
        { position: 1, nickname: 'いち', score: 1200, rank: 'S', at: '2026-11-13T00:00:00Z' },
        { position: 'x', nickname: '壊れ', score: 1, rank: 'A', at: '' },
      ],
      total: 10,
    });
    const result = await fetchRanking(
      { scenarioId: 'sc-1', role: 'executive', mode: 'normal', period: 'week' },
      { base: 'https://api.example.com', fetchImpl: impl },
    );

    expect(calls[0]?.url).toContain('https://api.example.com/api/ranking?');
    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('scenario')).toBe('sc-1');
    expect(url.searchParams.get('role')).toBe('executive');
    expect(url.searchParams.get('period')).toBe('week');
    expect(url.searchParams.get('mode')).toBe('normal');
    expect(result?.entries).toEqual([
      { position: 1, nickname: 'いち', score: 1200, rank: 'S', at: '2026-11-13T00:00:00Z' },
    ]);
    expect(result?.total).toBe(10);
  });

  it('失敗時は null', async () => {
    const { impl } = fakeFetch({ entries: 'x' });
    expect(await fetchRanking(
      { scenarioId: 'sc-1', role: 'executive', period: 'all' },
      { base: '/api', fetchImpl: impl },
    )).toBeNull();
  });
});

describe('選択率', () => {
  it('数値だけを残す', async () => {
    const { impl } = fakeFetch({
      scenarioId: 'sc-1',
      role: 'executive',
      points: {
        p1: { c1: 42, c2: 'x' },
        __proto__: { c1: 100 },
        p2: null,
      },
      total: 5,
    });
    const result = await fetchChoiceStats(
      { scenarioId: 'sc-1', role: 'executive' },
      { base: '/api', fetchImpl: impl },
    );

    expect(result?.points).toEqual({ p1: { c1: 42 } });
    expect(result?.total).toBe(5);
  });

  it('失敗時は null', async () => {
    const { impl } = fakeFetch({ points: [] });
    expect(await fetchChoiceStats(
      { scenarioId: 'sc-1', role: 'executive' },
      { base: '/api', fetchImpl: impl },
    )).toBeNull();
  });
});

describe('表示用の割合', () => {
  const stats: ChoiceStatsResponse = {
    scenarioId: 'sc-1',
    role: 'executive',
    points: { p1: { c1: 42.4, c2: 0, c3: 140 } },
    total: 10,
  };

  it('四捨五入し、100%で止める', async () => {
    const { choicePercent } = await import('../../../src/app/ranking/stats');
    expect(choicePercent(stats, 'p1', 'c1')).toBe(42);
    expect(choicePercent(stats, 'p1', 'c2')).toBe(0);
    expect(choicePercent(stats, 'p1', 'c3')).toBe(100);
  });

  it('無い判断・選択肢は null', async () => {
    const { choicePercent } = await import('../../../src/app/ranking/stats');
    expect(choicePercent(stats, 'p2', 'c1')).toBeNull();
    expect(choicePercent(stats, 'p1', 'c9')).toBeNull();
    expect(choicePercent(null, 'p1', 'c1')).toBeNull();
    expect(choicePercent(stats, '__proto__', 'c1')).toBeNull();
  });
});
