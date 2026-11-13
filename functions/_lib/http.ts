// 応答・同一オリジン判定・本文の読み取り
export const MAX_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

/**
 * JSON 応答。cacheSeconds > 0 のときだけ共有キャッシュ向けのヘッダを付ける。
 * 利用者の識別子を含む応答はキャッシュしない（呼び出し側が 0 を渡す）。
 */
export function jsonResponse(body: unknown, status = 200, cacheSeconds = 0): Response {
  const headers = cacheSeconds > 0
    ? { ...JSON_HEADERS, 'cache-control': `public, max-age=${Math.trunc(cacheSeconds)}` }
    : JSON_HEADERS;
  return new Response(JSON.stringify(body), { status, headers });
}

export function jsonError(status: number, code: string): Response {
  return jsonResponse({ ok: false, error: code }, status);
}

/**
 * 同一オリジンからの呼び出しだけを受け付ける。
 * GitHub Pages 版はランキングを出さないので、別オリジンからの利用は想定しない。
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // 同一オリジンの GET やサーバー間呼び出し
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** 生の IP は保存しない。レート制限の鍵にするときだけハッシュ化する */
export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'local';
}

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

type TextResult = { ok: true; text: string } | { ok: false; status: number; error: string };

/** 本文をストリームで読み、上限を超えた時点で打ち切る */
async function readCappedText(request: Request): Promise<TextResult> {
  if (!request.body) return { ok: true, text: '' };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      return { ok: false, status: 400, error: 'body_unreadable' };
    }
    if (chunk.done) break;
    if (!chunk.value) continue;
    total += chunk.value.byteLength;
    if (total > MAX_BODY_BYTES) {
      // 残りを読み切らずに捨てる（全文をメモリに載せない）
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413, error: 'body_too_large' };
    }
    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

export async function readJsonBody(request: Request): Promise<BodyResult> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'body_too_large' };
  }

  const read = await readCappedText(request);
  if (!read.ok) return read;

  try {
    return { ok: true, value: JSON.parse(read.text) };
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }
}
