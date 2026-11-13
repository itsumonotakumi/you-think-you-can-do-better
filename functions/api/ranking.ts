// GET /api/ranking: 上位 50 件と、clientId を渡されたときは自分の順位を返す。
import type { RankingEntry, RankingResponse } from '../../src/engine/types';
import type { Env, PagesFunction } from '../_lib/types';
import { isSameOrigin, jsonError, jsonResponse } from '../_lib/http';
import { findScenario } from '../_lib/scenarios';
import { parseClientId, parseMode, parsePeriod, parseRole, WEEK_MS } from '../_lib/params';
import { countPlays, countRankedBefore, findPlayByClient, listTopPlays } from '../_lib/db';
import { cacheKey, readCache, sharedCache, writeCache, READ_CACHE_SECONDS, type CacheLike } from '../_lib/cache';

export const TOP_LIMIT = 50;

export interface RankingPayload extends RankingResponse {
  /** clientId を渡されたときだけ入る */
  self: { position: number; total: number; percentile: number } | null;
}

export interface HandlerDeps {
  now?: number;
  /** テストで差し替える共有キャッシュ。null で無効 */
  cache?: CacheLike | null;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export async function handleRanking(
  request: Request,
  env: Env,
  deps: HandlerDeps = {},
): Promise<Response> {
  const now = deps.now ?? Date.now();
  if (request.method !== 'GET') return jsonError(405, 'method_not_allowed');
  if (!isSameOrigin(request)) return jsonError(403, 'cross_origin');

  const params = new URL(request.url).searchParams;
  const scenarioId = params.get('scenario') ?? '';
  const role = parseRole(params.get('role'));
  const mode = parseMode(params.get('mode'));
  const period = parsePeriod(params.get('period'));
  const clientId = parseClientId(params.get('clientId'));

  const scenario = findScenario(scenarioId);
  if (!scenario) return jsonError(404, 'unknown_scenario');
  if (!role) return jsonError(400, 'invalid_role');
  if (!mode) return jsonError(400, 'invalid_mode');
  if (!period) return jsonError(400, 'invalid_period');

  const key = { scenarioId, role, mode };
  const cache = deps.cache === undefined ? sharedCache() : deps.cache;
  const cacheQuery = new URLSearchParams({ scenario: scenarioId, role, mode, period }).toString();
  const cacheStoreKey = cacheKey(request, cacheQuery);

  // 上位一覧は誰が見ても同じなので共有キャッシュに載せる（自分の順位は載せない）
  let shared = (await readCache(cache, cacheStoreKey)) as RankingResponse | null;
  if (!shared) {
    const since = period === 'week' ? now - WEEK_MS : null;
    const rows = await listTopPlays(env.DB, key, since, TOP_LIMIT);
    const entries: RankingEntry[] = rows.map((row, index) => ({
      position: index + 1,
      nickname: row.nickname,
      score: row.score,
      rank: row.rank as RankingEntry['rank'],
      at: new Date(row.created_at).toISOString(),
    }));
    const total = await countPlays(env.DB, key, since);
    shared = { scenarioId, role, mode, period, entries, total };
    writeCache(cache, cacheStoreKey, shared, deps.waitUntil ?? ((promise) => void promise));
  }

  let self: RankingPayload['self'] = null;
  if (clientId) {
    const mine = await findPlayByClient(env.DB, key, clientId);
    if (mine) {
      // 全体での順位（期間で絞ると自分の記録が圏外になりうるため、順位は全期間で出す）
      const overall = await countPlays(env.DB, key);
      const position = (await countRankedBefore(env.DB, key, mine.score, mine.created_at)) + 1;
      self = {
        position,
        total: overall,
        percentile: overall > 0 ? Math.min(100, Math.ceil((position / overall) * 100)) : 100,
      };
    }
  }

  const payload: RankingPayload = { ...shared, self };
  // 自分の順位を含む応答は共有キャッシュに載せない
  return jsonResponse(payload, 200, self ? 0 : READ_CACHE_SECONDS);
}

export const onRequest: PagesFunction = ({ request, env, waitUntil }) =>
  handleRanking(request, env, { waitUntil });
