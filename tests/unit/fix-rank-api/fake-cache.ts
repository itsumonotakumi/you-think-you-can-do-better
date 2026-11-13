// テスト用の共有キャッシュと、D1 の呼び出し回数を数えるラッパー。
import type { CacheLike } from '../../../functions/_lib/cache';
import type { D1Database, D1PreparedStatement, D1Result } from '../../../functions/_lib/types';

/** caches.default の代わり。キーは URL 文字列 */
export class FakeCache implements CacheLike {
  store = new Map<string, string>();
  puts = 0;

  async match(request: Request): Promise<Response | undefined> {
    const body = this.store.get(request.url);
    if (body === undefined) return undefined;
    return new Response(body, { headers: { 'content-type': 'application/json' } });
  }

  async put(request: Request, response: Response): Promise<void> {
    this.puts += 1;
    this.store.set(request.url, await response.text());
  }
}

export interface CountingDb {
  db: D1Database;
  /** prepare を呼んだ回数（読み取り回数の目安） */
  queries: string[];
}

export function countingDb(inner: D1Database): CountingDb {
  const queries: string[] = [];
  const db: D1Database = {
    prepare(query: string): D1PreparedStatement {
      queries.push(query.replace(/\s+/g, ' ').trim());
      return inner.prepare(query);
    },
    batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      queries.push(`BATCH(${statements.length})`);
      return inner.batch<T>(statements);
    },
  };
  return { db, queries };
}
