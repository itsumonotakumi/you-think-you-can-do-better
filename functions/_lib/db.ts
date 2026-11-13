// D1 へのアクセスをここに集める（テストでは同じ SQL を返す簡易モックを使う）。
import type { D1Database } from './types';

export interface PlayKey {
  scenarioId: string;
  role: string;
  mode: string;
}

export interface PlayRow {
  id: number;
  client_id: string;
  scenario_id: string;
  role: string;
  mode: string;
  nickname: string;
  score: number;
  rank: string;
  choices_json: string;
  created_at: number;
}

export interface NewPlay {
  clientId: string;
  scenarioId: string;
  role: string;
  mode: string;
  nickname: string;
  score: number;
  rank: string;
  choicesJson: string;
  createdAt: number;
}

const PLAY_COLUMNS =
  'id, client_id, scenario_id, role, mode, nickname, score, rank, choices_json, created_at';

/**
 * 選択率の集計に使う記録の上限。
 * 無料枠（読み取り 500 万行/日）を守るため、新しい 1000 件だけを見る。
 */
export const LIST_CHOICES_LIMIT = 1000;

function comboWhere(hasSince: boolean): string {
  return hasSince
    ? 'scenario_id = ? AND role = ? AND mode = ? AND created_at >= ?'
    : 'scenario_id = ? AND role = ? AND mode = ?';
}

function comboArgs(key: PlayKey, sinceMs: number | null): (string | number)[] {
  return sinceMs === null
    ? [key.scenarioId, key.role, key.mode]
    : [key.scenarioId, key.role, key.mode, sinceMs];
}

/** その端末・シナリオ・ロール・モードの登録済みの記録（初回のみ登録の判定） */
export async function findPlayByClient(
  db: D1Database,
  key: PlayKey,
  clientId: string,
): Promise<PlayRow | null> {
  return db
    .prepare(
      `SELECT ${PLAY_COLUMNS} FROM plays`
      + ' WHERE client_id = ? AND scenario_id = ? AND role = ? AND mode = ? LIMIT 1',
    )
    .bind(clientId, key.scenarioId, key.role, key.mode)
    .first<PlayRow>();
}

/**
 * 初回の 1 件だけを、日次上限の範囲で登録する。
 * 上限の判定と挿入を 1 文で行い、登録できたかを返す（重複・上限超過は false）。
 */
export async function insertPlayWithinBudget(
  db: D1Database,
  play: NewPlay,
  day: number,
  dailyLimit: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      'INSERT INTO plays (client_id, scenario_id, role, mode, nickname, score, rank, choices_json, created_at)'
      + ' SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?'
      + ' WHERE COALESCE((SELECT count FROM daily_writes WHERE day = ?), 0) < ?'
      + ' ON CONFLICT(client_id, scenario_id, role, mode) DO NOTHING',
    )
    .bind(
      play.clientId,
      play.scenarioId,
      play.role,
      play.mode,
      play.nickname,
      play.score,
      play.rank,
      play.choicesJson,
      play.createdAt,
      day,
      dailyLimit,
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** 書き込み行数の目安を 1 増やす（登録できたときだけ呼ぶ） */
export async function recordDailyWrite(db: D1Database, day: number): Promise<void> {
  await db
    .prepare(
      'INSERT INTO daily_writes (day, count) VALUES (?, 1)'
      + ' ON CONFLICT(day) DO UPDATE SET count = count + 1',
    )
    .bind(day)
    .run();
}

/**
 * 同じ IP ハッシュが 1 日に登録できる件数を数える。判定と加算は 1 文で行う。
 * 上限を超えていれば false（行が返らない）。
 */
export async function takeDailyRegistrationSlot(
  db: D1Database,
  ipHash: string,
  day: number,
  limit: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      'INSERT INTO ip_registrations (ip_hash, day, count) VALUES (?, ?, 1)'
      + ' ON CONFLICT(ip_hash, day) DO UPDATE SET count = count + 1'
      + ' WHERE count < ? RETURNING count',
    )
    .bind(ipHash, day, limit)
    .run<{ count: number }>();
  const row = result.results?.[0];
  return typeof row?.count === 'number' && row.count > 0;
}

/** 自分より上の件数（同点は先着が上） */
export async function countRankedBefore(
  db: D1Database,
  key: PlayKey,
  score: number,
  createdAt: number,
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS n FROM plays'
      + ' WHERE scenario_id = ? AND role = ? AND mode = ?'
      + ' AND (score > ? OR (score = ? AND created_at < ?))',
    )
    .bind(key.scenarioId, key.role, key.mode, score, score, createdAt)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** 登録件数（期間を指定するとその範囲だけ） */
export async function countPlays(
  db: D1Database,
  key: PlayKey,
  sinceMs: number | null = null,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM plays WHERE ${comboWhere(sinceMs !== null)}`)
    .bind(...comboArgs(key, sinceMs))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** 上位の記録。同点は先着順 */
export async function listTopPlays(
  db: D1Database,
  key: PlayKey,
  sinceMs: number | null,
  limit: number,
): Promise<PlayRow[]> {
  const result = await db
    .prepare(
      `SELECT ${PLAY_COLUMNS} FROM plays WHERE ${comboWhere(sinceMs !== null)}`
      + ` ORDER BY score DESC, created_at ASC LIMIT ${Math.max(1, Math.trunc(limit))}`,
    )
    .bind(...comboArgs(key, sinceMs))
    .all<PlayRow>();
  return result.results ?? [];
}

/** 判断ごとの選択率の集計に使う、新しい順の選択の記録 */
export async function listChoicesJson(db: D1Database, key: PlayKey): Promise<string[]> {
  const result = await db
    .prepare(
      'SELECT choices_json FROM plays WHERE scenario_id = ? AND role = ? AND mode = ?'
      + ` ORDER BY created_at DESC LIMIT ${LIST_CHOICES_LIMIT}`,
    )
    .bind(key.scenarioId, key.role, key.mode)
    .all<{ choices_json: string }>();
  return (result.results ?? []).map((row) => row.choices_json);
}
