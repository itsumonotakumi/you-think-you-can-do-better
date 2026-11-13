// 本文のサイズ制限は「ストリームをバイト単位で読み、超過したら打ち切る」
import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, readJsonBody } from '../../../functions/_lib/http';

interface Streamed {
  request: Request;
  /** 読み出したチャンク数 */
  pulled: () => number;
  /** 打ち切ったか */
  cancelled: () => boolean;
}

/** content-length を付けずに、チャンクを順に流す Request を作る */
function streamedRequest(chunk: Uint8Array, count: number): Streamed {
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= count) {
        controller.close();
        return;
      }
      pulled += 1;
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('https://yattemite.example/api/plays', {
    method: 'POST',
    body: stream,
    // Node の fetch 実装ではストリーム本文に duplex が必要
    duplex: 'half',
  } as RequestInit);
  return { request, pulled: () => pulled, cancelled: () => cancelled };
}

describe('readJsonBody', () => {
  it('上限内の JSON を読める', async () => {
    const body = JSON.stringify({ nickname: 'あ'.repeat(100) });
    const request = new Request('https://yattemite.example/api/plays', { method: 'POST', body });
    const result = await readJsonBody(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value as { nickname: string }).nickname).toHaveLength(100);
  });

  it('content-length が上限を超えていれば読まずに 413', async () => {
    const request = new Request('https://yattemite.example/api/plays', {
      method: 'POST',
      headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
      body: '{}',
    });
    expect(await readJsonBody(request)).toEqual({
      ok: false,
      status: 413,
      error: 'body_too_large',
    });
  });

  it('content-length が無くても、バイト数が上限を超えた時点で打ち切る', async () => {
    // 1 チャンク 8KB × 20 = 160KB。全部は読まない
    const chunk = new Uint8Array(8 * 1024).fill(0x20);
    const streamed = streamedRequest(chunk, 20);
    const result = await readJsonBody(streamed.request);
    expect(result).toEqual({ ok: false, status: 413, error: 'body_too_large' });
    expect(streamed.cancelled()).toBe(true);
    expect(streamed.pulled()).toBeLessThan(20);
  });

  it('文字数ではなくバイト数で判定する（日本語は 1 文字 3 バイト）', async () => {
    // 30,000 文字 = 約 90KB（文字数だけなら上限内に見える）
    const text = JSON.stringify({ nickname: 'あ'.repeat(30_000) });
    expect(text.length).toBeLessThan(MAX_BODY_BYTES);
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(MAX_BODY_BYTES);
    const request = new Request('https://yattemite.example/api/plays', { method: 'POST', body: text });
    expect(await readJsonBody(request)).toEqual({
      ok: false,
      status: 413,
      error: 'body_too_large',
    });
  });

  it('壊れた JSON は 400', async () => {
    const request = new Request('https://yattemite.example/api/plays', { method: 'POST', body: '{' });
    expect(await readJsonBody(request)).toEqual({
      ok: false,
      status: 400,
      error: 'invalid_json',
    });
  });
});
