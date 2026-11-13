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

/** 初回の 1 件だけを登録する。2 件目は UNIQUE 制約に当たるので何もしない */
export async function insertPlay(db: D1Database, play: NewPlay): Promise<void> {
  await db
    .prepare(
      'INSERT INTO plays (client_id, scenario_id, role, mode, nickname, score, rank, choices_json, created_at)'
      + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
    )
    .run();
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

/** 指定時刻以降の総書き込み件数（無料枠の安全装置に使う） */
export async function countPlaysSince(db: D1Database, sinceMs: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM plays WHERE created_at >= ?')
    .bind(sinceMs)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * 判断ごとの選択率の集計に使う選択の記録。
 * 行数が増えても Worker のメモリを食いすぎないよう、新しい 5000 件だけを見る。
 */
export async function listChoicesJson(db: D1Database, key: PlayKey): Promise<string[]> {
  const result = await db
    .prepare(
      'SELECT choices_json FROM plays WHERE scenario_id = ? AND role = ? AND mode = ?'
      + ' ORDER BY created_at DESC LIMIT 5000',
    )
    .bind(key.scenarioId, key.role, key.mode)
    .all<{ choices_json: string }>();
  return (result.results ?? []).map((row) => row.choices_json);
}
