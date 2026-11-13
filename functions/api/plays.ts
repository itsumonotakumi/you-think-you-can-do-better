// POST /api/plays: 選択の記録を受け取り、サーバーで点数を計算して初回だけ登録する。
import type { Env, PagesFunction } from '../_lib/types';
import { clientIp, isSameOrigin, jsonError, jsonResponse, readJsonBody } from '../_lib/http';
import { checkNickname } from '../_lib/nickname';
import { hashIp, checkRateLimit } from '../_lib/ratelimit';
import { verifyTurnstile } from '../_lib/turnstile';
import { parseSubmission } from '../_lib/submission';
import { replaySubmission } from '../_lib/replay';
import { findScenario } from '../_lib/scenarios';
import {
  countPlays,
  countPlaysSince,
  countRankedBefore,
  findPlayByClient,
  insertPlay,
} from '../_lib/db';

/** 無料枠の安全装置。既定は 1日 50,000 件 */
export const DEFAULT_DAILY_WRITE_LIMIT = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface HandlerDeps {
  /** テストで固定するための現在時刻（ミリ秒） */
  now?: number;
  /** Turnstile の呼び出しを差し替える（テスト用） */
  fetcher?: typeof fetch;
}

function dailyWriteLimit(env: Env): number {
  const value = Number(env.DAILY_WRITE_LIMIT ?? '');
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : DEFAULT_DAILY_WRITE_LIMIT;
}

function startOfDayUtc(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS) * DAY_MS;
}

function percentileOf(position: number, total: number): number {
  if (total <= 0) return 100;
  return Math.min(100, Math.ceil((position / total) * 100));
}

export async function handlePlays(
  request: Request,
  env: Env,
  deps: HandlerDeps = {},
): Promise<Response> {
  const now = deps.now ?? Date.now();
  if (request.method !== 'POST') return jsonError(405, 'method_not_allowed');
  if (!isSameOrigin(request)) return jsonError(403, 'cross_origin');

  const body = await readJsonBody(request);
  if (!body.ok) return jsonError(body.status, body.error);

  const parsed = parseSubmission(body.value);
  if (!parsed.ok) return jsonError(400, parsed.error);
  const sub = parsed.value;

  const nickname = checkNickname(sub.nickname);
  if (!nickname.ok) return jsonError(400, nickname.error);

  // レート制限は IP のハッシュで数える（生の IP は保存しない）
  const ip = clientIp(request);
  const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT ?? '');
  const allowed = await checkRateLimit(env.DB, ipHash, now);
  if (!allowed) return jsonError(429, 'rate_limited');

  const turnstile = await verifyTurnstile({
    secret: env.TURNSTILE_SECRET,
    token: sub.turnstileToken,
    ip,
    required: env.REQUIRE_TURNSTILE === 'true',
    fetcher: deps.fetcher,
  });
  if (!turnstile.ok) {
    const status = turnstile.error === 'turnstile_not_configured' ? 503 : 403;
    return jsonError(status, turnstile.error);
  }

  const scenario = findScenario(sub.scenarioId);
  if (!scenario) return jsonError(404, 'unknown_scenario');
  if (sub.scenarioVersion !== scenario.version) return jsonError(409, 'scenario_version_mismatch');

  const replay = replaySubmission(sub, scenario, new Date(now).toISOString());
  if (!replay.ok) {
    return jsonResponse({ ok: false, error: 'invalid_play', reason: replay.error }, 422);
  }

  const key = { scenarioId: sub.scenarioId, role: sub.role, mode: sub.mode };

  // 初回のみ登録。2 件目以降は登録せず、順位だけ返す
  const existing = await findPlayByClient(env.DB, key, sub.clientId);
  if (existing) {
    const position = (await countRankedBefore(env.DB, key, existing.score, existing.created_at)) + 1;
    const total = await countPlays(env.DB, key);
    return jsonResponse({
      ok: true,
      score: existing.score,
      rank: existing.rank,
      position,
      total,
      percentile: percentileOf(position, total),
      registered: false,
    });
  }

  const written = await countPlaysSince(env.DB, startOfDayUtc(now));
  if (written >= dailyWriteLimit(env)) return jsonError(503, 'write_limit_reached');

  await insertPlay(env.DB, {
    clientId: sub.clientId,
    scenarioId: sub.scenarioId,
    role: sub.role,
    mode: sub.mode,
    nickname: nickname.value,
    score: replay.score,
    rank: replay.rank,
    choicesJson: JSON.stringify(sub.choices),
    createdAt: now,
  });

  const position = (await countRankedBefore(env.DB, key, replay.score, now)) + 1;
  const total = await countPlays(env.DB, key);
  return jsonResponse({
    ok: true,
    score: replay.score,
    rank: replay.rank,
    position,
    total,
    percentile: percentileOf(position, total),
    registered: true,
  });
}

export const onRequest: PagesFunction = ({ request, env }) => handlePlays(request, env);
