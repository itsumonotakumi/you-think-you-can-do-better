// 読み取り API の共有キャッシュ（Cache API）。有料機能を使わず読み取り回数を減らす。
export const READ_CACHE_SECONDS = 60;

export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

type Scheduler = (promise: Promise<unknown>) => void;

/** キャッシュを使える環境では caches.default。テストでは差し替える */
export function sharedCache(): CacheLike | null {
  const store = (globalThis as { caches?: { default?: CacheLike } }).caches;
  return store?.default ?? null;
}

/** クエリの並びに依存しないキャッシュキー（同じ条件は同じキー） */
export function cacheKey(request: Request, query: string): string {
  const url = new URL(request.url);
  url.search = query;
  return url.toString();
}

export async function readCache(cache: CacheLike | null, key: string): Promise<unknown | null> {
  if (!cache) return null;
  try {
    const hit = await cache.match(new Request(key, { method: 'GET' }));
    if (!hit) return null;
    return (await hit.json()) as unknown;
  } catch {
    return null;
  }
}

/** 次のリクエストのために保存する。失敗しても応答には影響させない */
export function writeCache(
  cache: CacheLike | null,
  key: string,
  payload: unknown,
  schedule: Scheduler,
  seconds = READ_CACHE_SECONDS,
): void {
  if (!cache) return;
  const stored = new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${Math.trunc(seconds)}`,
    },
  });
  schedule(
    cache
      .put(new Request(key, { method: 'GET' }), stored)
      .catch(() => undefined),
  );
}
