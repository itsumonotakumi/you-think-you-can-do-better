import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_API_BASE_KEY, apiBase, apiUrl, isRankingEnabled, normalizeApiBase, resolveApiBase,
  turnstileSiteKey,
} from '../../../src/app/ranking/config';

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as Record<string, unknown>)[DEV_API_BASE_KEY];
});

describe('API ベース URL', () => {
  it('空・空白は未設定', () => {
    expect(normalizeApiBase(undefined)).toBe('');
    expect(normalizeApiBase('')).toBe('');
    expect(normalizeApiBase('   ')).toBe('');
  });

  it('末尾のスラッシュを落とす', () => {
    expect(normalizeApiBase('https://api.example.com/')).toBe('https://api.example.com');
    expect(normalizeApiBase(' https://api.example.com/// ')).toBe('https://api.example.com');
    expect(normalizeApiBase('/')).toBe('/');
  });

  it('本番は VITE_API_BASE だけを見る（開発用の差し替えは無視）', () => {
    expect(resolveApiBase({ DEV: false }, '/dev-api')).toBe('');
    expect(resolveApiBase({ DEV: undefined, VITE_API_BASE: 'https://api.example.com/' }, '/dev-api'))
      .toBe('https://api.example.com');
  });

  it('開発時だけ差し替えを使える', () => {
    expect(resolveApiBase({ DEV: true }, '/dev-api/')).toBe('/dev-api');
    expect(resolveApiBase({ DEV: true, VITE_API_BASE: 'https://real.example' }, '/dev-api'))
      .toBe('https://real.example');
  });

  it('ベースとパスをつなぐ', () => {
    expect(apiUrl('https://api.example.com', '/api/plays')).toBe('https://api.example.com/api/plays');
    expect(apiUrl('/rank-api', '/api/ranking')).toBe('/rank-api/api/ranking');
    expect(apiUrl('', '/api/plays')).toBe('/api/plays');
  });
});

describe('有効判定', () => {
  it('VITE_API_BASE があれば有効', () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.com');
    expect(apiBase()).toBe('https://api.example.com');
    expect(isRankingEnabled()).toBe(true);
  });

  it('未設定なら無効', () => {
    vi.stubEnv('VITE_API_BASE', '');
    expect(isRankingEnabled()).toBe(false);
  });

  it('Turnstile のサイトキーは前後の空白を落とす', () => {
    vi.stubEnv('VITE_TURNSTILE_SITEKEY', '  site-key  ');
    expect(turnstileSiteKey()).toBe('site-key');
    vi.stubEnv('VITE_TURNSTILE_SITEKEY', '   ');
    expect(turnstileSiteKey()).toBe('');
  });
});
