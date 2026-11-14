// ランキング API クライアント（#7）。通信の失敗は例外にせず、静かに失敗を返す。
import type {
  ChoiceStatsResponse, PlayMode, Rank, RankingEntry, RankingResponse,
  RoleId, SubmissionResult,
} from '../../engine/types';
import type { RankingPlaySubmission } from './submission';
import { apiBase, apiUrl } from './config';

/** テストで差し替えられる fetch */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface RequestOptions {
  fetchImpl?: Fetcher;
  timeoutMs?: number;
  /** 未指定なら config の VITE_API_BASE を使う */
  base?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const RANKS: readonly Rank[] = ['S', 'A', 'B', 'C', 'D'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && (RANKS as readonly string[]).includes(value);
}

async function requestJson(
  url: string,
  init: RequestInit,
  options: RequestOptions,
): Promise<unknown | null> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as Fetcher | undefined);
  if (!fetchImpl) return null;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, controller ? { ...init, signal: controller.signal } : init);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function sanitizeSubmissionResult(raw: unknown): SubmissionResult {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') return { ok: false, error: 'invalid' };
  const result: SubmissionResult = { ok: raw.ok };
  if (raw.ok) {
    if (isNum(raw.score)) result.score = raw.score;
    if (isRank(raw.rank)) result.rank = raw.rank;
    if (isNum(raw.position)) result.position = raw.position;
    if (isNum(raw.total)) result.total = raw.total;
    if (isNum(raw.percentile)) result.percentile = raw.percentile;
  } else if (typeof raw.error === 'string') {
    result.error = raw.error;
  }
  return result;
}

/** プレイを送る。点数は含めない（サーバーが計算する） */
export async function submitPlay(
  submission: RankingPlaySubmission,
  options: RequestOptions = {},
): Promise<SubmissionResult> {
  const base = options.base ?? apiBase();
  if (base === '') return { ok: false, error: 'disabled' };

  const raw = await requestJson(
    apiUrl(base, '/api/plays'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submission),
    },
    options,
  );
  if (raw === null) return { ok: false, error: 'network' };
  return sanitizeSubmissionResult(raw);
}

export interface DeletePlaysInput {
  clientId: string;
  deleteKey: string;
}

export interface DeletePlaysResult {
  ok: boolean;
  /** 消せた件数。ok のときだけ入る */
  deleted?: number;
  error?: string;
}

function sanitizeDeleteResult(raw: unknown): DeletePlaysResult {
  if (isRecord(raw) && raw.ok === true) {
    const deleted = isNum(raw.deleted) && raw.deleted >= 0 ? Math.trunc(raw.deleted) : 0;
    return { ok: true, deleted };
  }
  const error = isRecord(raw) && typeof raw.error === 'string' ? raw.error : 'invalid';
  return { ok: false, error };
}

/**
 * この端末で登録した記録を消す。
 * 削除用の鍵は端末から出さず、サーバーには登録時に SHA-256 のハッシュだけを置いている。
 */
export async function deletePlays(
  input: DeletePlaysInput,
  options: RequestOptions = {},
): Promise<DeletePlaysResult> {
  const base = options.base ?? apiBase();
  if (base === '') return { ok: false, error: 'disabled' };
  if (typeof input.clientId !== 'string' || input.clientId === '') {
    return { ok: false, error: 'missing_client_id' };
  }
  if (typeof input.deleteKey !== 'string' || input.deleteKey === '') {
    return { ok: false, error: 'missing_delete_key' };
  }

  const raw = await requestJson(
    apiUrl(base, '/api/plays'),
    {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: input.clientId, deleteKey: input.deleteKey }),
    },
    options,
  );
  if (raw === null) return { ok: false, error: 'network' };
  return sanitizeDeleteResult(raw);
}

export interface RankingQuery {
  scenarioId: string;
  role: RoleId;
  mode?: PlayMode;
  period: 'week' | 'all';
}

function sanitizeEntry(raw: unknown): RankingEntry | null {
  if (!isRecord(raw)) return null;
  if (!isNum(raw.position) || typeof raw.nickname !== 'string') return null;
  if (!isNum(raw.score) || !isRank(raw.rank) || typeof raw.at !== 'string') return null;
  return {
    position: raw.position,
    nickname: raw.nickname.slice(0, 32),
    score: raw.score,
    rank: raw.rank,
    at: raw.at,
  };
}

function sanitizeRanking(raw: unknown): RankingResponse | null {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) return null;
  if (typeof raw.scenarioId !== 'string' || typeof raw.role !== 'string') return null;
  if (raw.period !== 'week' && raw.period !== 'all') return null;
  const mode: PlayMode = raw.mode === 'hard' ? 'hard' : 'normal';
  const entries = raw.entries.flatMap((entry) => {
    const clean = sanitizeEntry(entry);
    return clean ? [clean] : [];
  });
  const total = isNum(raw.total) && raw.total >= 0 ? raw.total : entries.length;
  return {
    scenarioId: raw.scenarioId,
    role: raw.role as RoleId,
    mode,
    period: raw.period,
    entries,
    total,
  };
}

/** ランキングの上位と参加人数を取る。失敗時は null */
export async function fetchRanking(
  query: RankingQuery,
  options: RequestOptions = {},
): Promise<RankingResponse | null> {
  const base = options.base ?? apiBase();
  if (base === '' || query.scenarioId === '') return null;
  const params = new URLSearchParams({
    scenario: query.scenarioId,
    role: query.role,
    period: query.period,
  });
  if (query.mode) params.set('mode', query.mode);

  const raw = await requestJson(
    apiUrl(base, `/api/ranking?${params.toString()}`),
    { method: 'GET' },
    options,
  );
  if (raw === null) return null;
  return sanitizeRanking(raw);
}

function safeKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function sanitizePoints(raw: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (!isRecord(raw)) return out;
  for (const [pointId, row] of Object.entries(raw)) {
    if (!safeKey(pointId) || !isRecord(row)) continue;
    const clean: Record<string, number> = {};
    for (const [choiceId, value] of Object.entries(row)) {
      if (safeKey(choiceId) && isNum(value) && value >= 0) clean[choiceId] = value;
    }
    if (Object.keys(clean).length > 0) out[pointId] = clean;
  }
  return out;
}

function sanitizeStats(raw: unknown): ChoiceStatsResponse | null {
  if (!isRecord(raw) || !isRecord(raw.points)) return null;
  if (typeof raw.scenarioId !== 'string' || typeof raw.role !== 'string') return null;
  const total = isNum(raw.total) && raw.total >= 0 ? raw.total : 0;
  return {
    scenarioId: raw.scenarioId,
    role: raw.role as RoleId,
    points: sanitizePoints(raw.points),
    total,
  };
}

/** 判断ごとの選択率を取る。失敗時は null（振り返りは黙って諦める） */
export async function fetchChoiceStats(
  query: Omit<RankingQuery, 'period'>,
  options: RequestOptions = {},
): Promise<ChoiceStatsResponse | null> {
  const base = options.base ?? apiBase();
  if (base === '' || query.scenarioId === '') return null;
  const params = new URLSearchParams({ scenario: query.scenarioId, role: query.role });
  if (query.mode) params.set('mode', query.mode);

  const raw = await requestJson(
    apiUrl(base, `/api/stats?${params.toString()}`),
    { method: 'GET' },
    options,
  );
  if (raw === null) return null;
  return sanitizeStats(raw);
}
