// POST /api/plays: 選択の記録を受け取り、サーバーで点数を計算して初回だけ登録する。
import type { Env, PagesFunction } from '../_lib/types';
import { clientIp, isSameOrigin, jsonError, jsonResponse, readJsonBody } from '../_lib/http';
import { checkNickname } from '../_lib/nickname';
import { checkRateLimit, cleanupOldRows, dayOf, hashIp } from '../_lib/ratelimit';
import { parseAllowedHosts, verifyTurnstile } from '../_lib/turnstile';
import { parseSubmission, CLIENT_ID_RE } from '../_lib/submission';
import { hashDeleteKey, isDeleteKey } from '../_lib/deletion';
import { replaySubmission } from '../_lib/replay';
import { findScenario } from '../_lib/scenarios';
import {
  countPlays,
  countRankedBefore,
  deletePlaysByClient,
  findPlayByClient,
  insertPlayWithinBudget,
  recordDailyWrite,
  takeDailyRegistrationSlot,
  type PlayKey,
} from '../_lib/db';

/** 無料枠の安全装置。1日の登録件数（≒書き込み行数）の既定。
 * 1 登録あたり plays・daily_writes・ip_registrations・rate_limits で 4〜5 行を書くので、
 * 2 万件でも D1 無料枠の 10 万行/日（書き込み）に収まる。 */
export const DEFAULT_DAILY_WRITE_LIMIT = 20_000;
/** 同じ IP ハッシュが 1 日に登録できる件数（端末 ID の付け替え対策） */
export const DEFAULT_MAX_REGISTRATIONS_PER_IP = 20;

export interface HandlerDeps {
  /** テストで固定するための現在時刻（ミリ秒） */
  now?: number;
  /** Turnstile の呼び出しを差し替える（テスト用） */
  fetcher?: typeof fetch;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function dailyWriteLimit(env: Env): number {
  return positiveInt(env.DAILY_WRITE_LIMIT, DEFAULT_DAILY_WRITE_LIMIT);
}

export function maxRegistrationsPerIp(env: Env): number {
  return positiveInt(env.MAX_REGISTRATIONS_PER_IP, DEFAULT_MAX_REGISTRATIONS_PER_IP);
}

function percentileOf(position: number, total: number): number {
  if (total <= 0) return 100;
  return Math.min(100, Math.ceil((position / total) * 100));
}

async function playSummary(env: Env, key: PlayKey, score: number, createdAt: number) {
  const position = (await countRankedBefore(env.DB, key, score, createdAt)) + 1;
  const total = await countPlays(env.DB, key);
  return { position, total, percentile: percentileOf(position, total) };
}

export async function handlePlays(
  request: Request,
  env: Env,
  deps: HandlerDeps = {},
): Promise<Response> {
  const now = deps.now ?? Date.now();
  if (request.method !== 'POST') return jsonError(405, 'method_not_allowed');
  if (!isSameOrigin(request)) return jsonError(403, 'cross_origin');
  // IP は秘密鍵で匿名化する。鍵が無ければ辞書照合できる値を作らない
  if (!env.IP_HASH_SECRET) return jsonError(503, 'ip_hash_not_configured');

  const body = await readJsonBody(request);
  if (!body.ok) return jsonError(body.status, body.error);

  const parsed = parseSubmission(body.value);
  if (!parsed.ok) return jsonError(400, parsed.error);
  const sub = parsed.value;

  const nickname = checkNickname(sub.nickname);
  if (!nickname.ok) return jsonError(400, nickname.error);

  const ip = clientIp(request);

  const turnstile = await verifyTurnstile({
    secret: env.TURNSTILE_SECRET,
    token: sub.turnstileToken,
    ip,
    allowUnverified: env.ALLOW_NO_TURNSTILE === 'true',
    allowedHosts: parseAllowedHosts(env.ALLOWED_HOSTS),
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

  const ipHash = await hashIp(ip, env.IP_HASH_SECRET);

  // 検証を通った送信だけを数える（無効な投稿や Turnstile の失敗で書き込みを増やさない）
  const allowed = await checkRateLimit(env.DB, ipHash, now);
  if (!allowed) return jsonError(429, 'rate_limited');

  const key = { scenarioId: sub.scenarioId, role: sub.role, mode: sub.mode };

  // 初回のみ登録。2 件目以降は登録せず、順位だけ返す
  const existing = await findPlayByClient(env.DB, key, sub.clientId);
  if (existing) {
    return jsonResponse({
      ok: true,
      score: existing.score,
      rank: existing.rank,
      ...(await playSummary(env, key, existing.score, existing.created_at)),
      registered: false,
    });
  }

  const day = dayOf(now);
  // 同じ IP から 1 日に登録できる件数（匿名運用なので完全な防止にはならない）
  const slot = await takeDailyRegistrationSlot(
    env.DB,
    ipHash,
    day,
    maxRegistrationsPerIp(env),
  );
  if (!slot) return jsonError(429, 'too_many_registrations');

  const registered = await insertPlayWithinBudget(
    env.DB,
    {
      clientId: sub.clientId,
      scenarioId: sub.scenarioId,
      role: sub.role,
      mode: sub.mode,
      nickname: nickname.value,
      score: replay.score,
      rank: replay.rank,
      choicesJson: JSON.stringify(sub.choices),
      deleteKeyHash: sub.deleteKey ? await hashDeleteKey(sub.deleteKey) : '',
      createdAt: now,
    },
    day,
    dailyWriteLimit(env),
  );

  if (!registered) {
    // 同時投稿で重複した場合は、保存済みの記録を返す（今回の点数は返さない）
    const saved = await findPlayByClient(env.DB, key, sub.clientId);
    if (saved) {
      return jsonResponse({
        ok: true,
        score: saved.score,
        rank: saved.rank,
        ...(await playSummary(env, key, saved.score, saved.created_at)),
        registered: false,
      });
    }
    return jsonError(503, 'write_limit_reached');
  }

  await recordDailyWrite(env.DB, day);
  // 古いレート制限の行を確率的に掃除する（失敗しても応答は変えない）
  try {
    await cleanupOldRows(env.DB, now);
  } catch {
    // 掃除は次回に回す
  }

  return jsonResponse({
    ok: true,
    score: replay.score,
    rank: replay.rank,
    ...(await playSummary(env, key, replay.score, now)),
    registered: true,
  });
}

export interface DeleteHandlerDeps {
  /** テストで固定するための現在時刻（ミリ秒） */
  now?: number;
}

function parseDeleteBody(value: unknown): { clientId: string; deleteKey: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { clientId, deleteKey } = value as { clientId?: unknown; deleteKey?: unknown };
  if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) return null;
  if (!isDeleteKey(deleteKey)) return null;
  return { clientId, deleteKey };
}

/**
 * DELETE /api/plays: この端末で登録した記録を消す。
 * 本文 { clientId, deleteKey }。同一オリジンだけを受け付け、IP 単位のレート制限をかける。
 * 端末 ID を知っているだけでは消せない（鍵のハッシュが一致した行だけ）。
 */
export async function handleDeletePlays(
  request: Request,
  env: Env,
  deps: DeleteHandlerDeps = {},
): Promise<Response> {
  const now = deps.now ?? Date.now();
  if (request.method !== 'DELETE') return jsonError(405, 'method_not_allowed');
  if (!isSameOrigin(request)) return jsonError(403, 'cross_origin');
  if (!env.IP_HASH_SECRET) return jsonError(503, 'ip_hash_not_configured');

  const body = await readJsonBody(request);
  if (!body.ok) return jsonError(body.status, body.error);

  const parsed = parseDeleteBody(body.value);
  if (!parsed) return jsonError(400, 'invalid_delete_request');

  const ipHash = await hashIp(clientIp(request), env.IP_HASH_SECRET);
  const allowed = await checkRateLimit(env.DB, ipHash, now);
  if (!allowed) return jsonError(429, 'rate_limited');

  const deleteKeyHash = await hashDeleteKey(parsed.deleteKey);
  const deleted = await deletePlaysByClient(env.DB, parsed.clientId, deleteKeyHash);

  // 古いレート制限の行を確率的に掃除する（失敗しても応答は変えない）
  try {
    await cleanupOldRows(env.DB, now);
  } catch {
    // 掃除は次回に回す
  }

  return jsonResponse({ ok: true, deleted });
}

export const onRequest: PagesFunction = ({ request, env }) => {
  if (request.method === 'DELETE') return handleDeletePlays(request, env);
  return handlePlays(request, env);
};
