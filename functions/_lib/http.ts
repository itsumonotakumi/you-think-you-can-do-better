// 応答・同一オリジン判定・本文の読み取り
export const MAX_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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

export async function readJsonBody(request: Request): Promise<BodyResult> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'body_too_large' };
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: 'body_unreadable' };
  }
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'body_too_large' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }
}
