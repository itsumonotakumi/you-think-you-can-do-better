// GET /api/stats: 判断ごとの選択率。少数（20 件未満）の判断は返さない。
import type { ChoiceStatsResponse } from '../../src/engine/types';
import type { Env, PagesFunction } from '../_lib/types';
import { isSameOrigin, jsonError, jsonResponse } from '../_lib/http';
import { findScenario } from '../_lib/scenarios';
import { parseMode, parseRole } from '../_lib/params';
import { countPlays, listChoicesJson } from '../_lib/db';
import { cacheKey, readCache, sharedCache, writeCache, READ_CACHE_SECONDS, type CacheLike } from '../_lib/cache';

/** これ未満の件数では選択率を出さない（少数の回答から推測されないようにする） */
export const MIN_SAMPLE = 20;

export interface HandlerDeps {
  /** テストで差し替える共有キャッシュ。null で無効 */
  cache?: CacheLike | null;
  /** キャッシュの保存を応答後に回す（Pages の waitUntil） */
  waitUntil?: (promise: Promise<unknown>) => void;
}

export async function handleStats(
  request: Request,
  env: Env,
  deps: HandlerDeps = {},
): Promise<Response> {
  if (request.method !== 'GET') return jsonError(405, 'method_not_allowed');
  if (!isSameOrigin(request)) return jsonError(403, 'cross_origin');

  const params = new URL(request.url).searchParams;
  const scenarioId = params.get('scenario') ?? '';
  const role = parseRole(params.get('role'));
  const mode = parseMode(params.get('mode'));

  const scenario = findScenario(scenarioId);
  if (!scenario) return jsonError(404, 'unknown_scenario');
  if (!role) return jsonError(400, 'invalid_role');
  if (!mode) return jsonError(400, 'invalid_mode');

  const cache = deps.cache === undefined ? sharedCache() : deps.cache;
  const key = cacheKey(request, new URLSearchParams({ scenario: scenarioId, role, mode }).toString());
  const cached = await readCache(cache, key);
  if (cached) return jsonResponse(cached, 200, READ_CACHE_SECONDS);

  const playKey = { scenarioId, role, mode };
  const rows = await listChoicesJson(env.DB, playKey);

  const counts = new Map<string, Map<string, number>>();
  for (const json of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { pointId, choiceId } = entry as { pointId?: unknown; choiceId?: unknown };
      if (typeof pointId !== 'string' || typeof choiceId !== 'string') continue;
      const perChoice = counts.get(pointId) ?? new Map<string, number>();
      perChoice.set(choiceId, (perChoice.get(choiceId) ?? 0) + 1);
      counts.set(pointId, perChoice);
    }
  }

  const points: Record<string, Record<string, number>> = {};
  for (const [pointId, perChoice] of counts) {
    let sample = 0;
    for (const value of perChoice.values()) sample += value;
    if (sample < MIN_SAMPLE) continue;
    const percentages: Record<string, number> = {};
    for (const [choiceId, value] of perChoice) {
      percentages[choiceId] = Math.round((value / sample) * 100);
    }
    points[pointId] = percentages;
  }

  const payload: ChoiceStatsResponse = {
    scenarioId,
    role,
    points,
    total: await countPlays(env.DB, playKey),
  };

  writeCache(cache, key, payload, deps.waitUntil ?? ((promise) => void promise));
  return jsonResponse(payload, 200, READ_CACHE_SECONDS);
}

export const onRequest: PagesFunction = ({ request, env, waitUntil }) =>
  handleStats(request, env, { waitUntil });
