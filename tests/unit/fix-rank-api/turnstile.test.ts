// Turnstile は難読化ではなく「必須・発行元の照合・用途の照合」で守る
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALLOWED_HOSTS,
  parseAllowedHosts,
  TURNSTILE_ACTION,
  verifyTurnstile,
} from '../../../functions/_lib/turnstile';

interface Captured {
  url: string;
  form: URLSearchParams;
}

function okFetcher(payload: Record<string, unknown>): { fetcher: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, form: new URLSearchParams(init.body as URLSearchParams) });
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const GOOD = { success: true, hostname: 'yattemite.pages.dev', action: TURNSTILE_ACTION };

describe('verifyTurnstile', () => {
  it('秘密鍵が無ければ、開発用の明示フラグが無い限り拒否する', async () => {
    expect(await verifyTurnstile({ secret: undefined, token: 'x' })).toEqual({
      ok: false,
      error: 'turnstile_not_configured',
    });
  });

  it('ローカル開発の明示フラグがあるときだけ検証を省略する', async () => {
    expect(await verifyTurnstile({ secret: undefined, token: '', allowUnverified: true })).toEqual({
      ok: true,
    });
  });

  it('トークンが空なら拒否する', async () => {
    expect(await verifyTurnstile({ secret: 's', token: '' })).toEqual({
      ok: false,
      error: 'turnstile_missing',
    });
  });

  it('siteverify に秘密鍵とトークンを送る', async () => {
    const { fetcher, calls } = okFetcher(GOOD);
    const result = await verifyTurnstile({ secret: 's', token: 't', ip: '203.0.113.1', fetcher });
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(calls[0]?.form.get('secret')).toBe('s');
    expect(calls[0]?.form.get('response')).toBe('t');
    expect(calls[0]?.form.get('remoteip')).toBe('203.0.113.1');
  });

  it('success が false なら拒否する', async () => {
    const { fetcher } = okFetcher({ success: false });
    expect(await verifyTurnstile({ secret: 's', token: 't', fetcher })).toEqual({
      ok: false,
      error: 'turnstile_failed',
    });
  });

  it('許可していないホストで発行されたトークンを拒否する', async () => {
    const { fetcher } = okFetcher({ ...GOOD, hostname: 'evil.example' });
    expect(await verifyTurnstile({ secret: 's', token: 't', fetcher })).toEqual({
      ok: false,
      error: 'turnstile_host_mismatch',
    });
  });

  it('hostname が無い応答を拒否する', async () => {
    const { fetcher } = okFetcher({ success: true, action: TURNSTILE_ACTION });
    expect(await verifyTurnstile({ secret: 's', token: 't', fetcher })).toEqual({
      ok: false,
      error: 'turnstile_host_mismatch',
    });
  });

  it('用途（action）が違うトークンを拒否する', async () => {
    const { fetcher } = okFetcher({ ...GOOD, action: 'another-form' });
    expect(await verifyTurnstile({ secret: 's', token: 't', fetcher })).toEqual({
      ok: false,
      error: 'turnstile_action_mismatch',
    });
  });

  it('許可ホストの一覧を差し替えられる', async () => {
    const { fetcher } = okFetcher({ ...GOOD, hostname: 'ranking.example' });
    const allowedHosts = parseAllowedHosts('ranking.example');
    expect(await verifyTurnstile({ secret: 's', token: 't', allowedHosts, fetcher })).toEqual({
      ok: true,
    });
  });

  it('通信の失敗は拒否として扱う', async () => {
    const fetcher = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile({ secret: 's', token: 't', fetcher })).toEqual({
      ok: false,
      error: 'turnstile_failed',
    });
  });
});

describe('parseAllowedHosts', () => {
  it('未設定なら既定のホスト', () => {
    expect(parseAllowedHosts(undefined)).toEqual([...DEFAULT_ALLOWED_HOSTS]);
    expect(parseAllowedHosts('  ')).toEqual([...DEFAULT_ALLOWED_HOSTS]);
  });

  it('カンマ区切りを読み、空要素を落とす', () => {
    expect(parseAllowedHosts('a.example, b.example,,')).toEqual(['a.example', 'b.example']);
  });

  it('先頭が . の項目はサブドメインに一致する', async () => {
    const { fetcher } = okFetcher({ ...GOOD, hostname: 'preview.yattemite.pages.dev' });
    const allowedHosts = parseAllowedHosts('.yattemite.pages.dev');
    expect(await verifyTurnstile({ secret: 's', token: 't', allowedHosts, fetcher })).toEqual({
      ok: true,
    });
  });
});
