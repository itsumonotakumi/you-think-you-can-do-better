// D1 の簡易モック。functions/_lib/db.ts と ratelimit.ts が出す SQL だけを解釈する。
import type { D1Database, D1PreparedStatement, D1Result } from '../../../functions/_lib/types';

export interface FakePlayRow {
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

interface ExecResult {
  rows: unknown[];
  changes: number;
  lastRowId: number;
}

const EMPTY: ExecResult = { rows: [], changes: 0, lastRowId: 0 };

function normalize(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

export class FakeD1 implements D1Database {
  plays: FakePlayRow[] = [];
  /** キーは `${ipHash}|${windowStart}` */
  rateLimits = new Map<string, number>();
  private nextId = 1;

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, normalize(query));
  }

  async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const out: D1Result<T>[] = [];
    for (const statement of statements) out.push(await statement.run<T>());
    return out;
  }

  /** 直接行を足す（テストの準備用） */
  addPlay(row: Partial<FakePlayRow> & Pick<FakePlayRow, 'client_id' | 'score'>): FakePlayRow {
    const full: FakePlayRow = {
      id: this.nextId++,
      scenario_id: 'no01-nebula',
      role: 'lead',
      mode: 'normal',
      nickname: 'ためし',
      rank: 'B',
      choices_json: '[]',
      created_at: 1_700_000_000_000,
      ...row,
    };
    this.plays.push(full);
    return full;
  }

  execute(query: string, values: unknown[]): ExecResult {
    if (query.startsWith('INSERT INTO plays')) {
      const [clientId, scenarioId, role, mode, nickname, score, rank, choicesJson, createdAt] =
        values as [string, string, string, string, string, number, string, string, number];
      const exists = this.plays.some(
        (row) =>
          row.client_id === clientId
          && row.scenario_id === scenarioId
          && row.role === role
          && row.mode === mode,
      );
      if (exists) return EMPTY;
      const id = this.nextId++;
      this.plays.push({
        id,
        client_id: clientId,
        scenario_id: scenarioId,
        role,
        mode,
        nickname,
        score,
        rank,
        choices_json: choicesJson,
        created_at: createdAt,
      });
      return { rows: [], changes: 1, lastRowId: id };
    }

    if (query.startsWith('INSERT INTO rate_limits')) {
      const [ipHash, windowStart] = values as [string, number];
      const key = `${ipHash}|${windowStart}`;
      this.rateLimits.set(key, (this.rateLimits.get(key) ?? 0) + 1);
      return { ...EMPTY, changes: 1 };
    }

    if (query.startsWith('DELETE FROM rate_limits')) {
      const [before] = values as [number];
      let changes = 0;
      for (const key of [...this.rateLimits.keys()]) {
        const windowStart = Number(key.split('|')[1]);
        if (windowStart < before) {
          this.rateLimits.delete(key);
          changes += 1;
        }
      }
      return { ...EMPTY, changes };
    }

    if (query.startsWith('SELECT count FROM rate_limits')) {
      const [ipHash, windowStart] = values as [string, number];
      const count = this.rateLimits.get(`${ipHash}|${windowStart}`);
      return { ...EMPTY, rows: count === undefined ? [] : [{ count }] };
    }

    if (query.startsWith('SELECT choices_json')) {
      const [scenarioId, role, mode] = values as [string, string, string];
      const rows = this.matching({ scenario_id: scenarioId, role, mode })
        .map((row) => ({ choices_json: row.choices_json }));
      return { ...EMPTY, rows };
    }

    if (query.startsWith('SELECT COUNT(*) AS n')) {
      if (query.includes('created_at >= ?') && !query.includes('scenario_id = ?')) {
        const [since] = values as [number];
        return { ...EMPTY, rows: [{ n: this.plays.filter((row) => row.created_at >= since).length }] };
      }
      if (query.includes('score > ?')) {
        const [scenarioId, role, mode, score, scoreAgain, createdAt] =
          values as [string, string, string, number, number, number];
        const n = this.matching({ scenario_id: scenarioId, role, mode }).filter(
          (row) => row.score > score || (row.score === scoreAgain && row.created_at < createdAt),
        ).length;
        return { ...EMPTY, rows: [{ n }] };
      }
      const [scenarioId, role, mode, since] = values as [string, string, string, number?];
      const rows = this.matching({ scenario_id: scenarioId, role, mode });
      const filtered = since === undefined ? rows : rows.filter((row) => row.created_at >= since);
      return { ...EMPTY, rows: [{ n: filtered.length }] };
    }

    if (query.includes('ORDER BY score DESC')) {
      const [scenarioId, role, mode, since] = values as [string, string, string, number?];
      const limit = Number(/LIMIT (\d+)/.exec(query)?.[1] ?? 50);
      const rows = this.matching({ scenario_id: scenarioId, role, mode })
        .filter((row) => (since === undefined ? true : row.created_at >= since))
        .sort((a, b) => b.score - a.score || a.created_at - b.created_at)
        .slice(0, limit);
      return { ...EMPTY, rows };
    }

    if (query.startsWith('SELECT id, client_id')) {
      const [clientId, scenarioId, role, mode] = values as [string, string, string, string];
      const row = this.plays.find(
        (entry) =>
          entry.client_id === clientId
          && entry.scenario_id === scenarioId
          && entry.role === role
          && entry.mode === mode,
      );
      return { ...EMPTY, rows: row ? [row] : [] };
    }

    throw new Error(`FakeD1: 未対応の SQL: ${query}`);
  }

  private matching(key: { scenario_id: string; role: string; mode: string }): FakePlayRow[] {
    return this.plays.filter(
      (row) =>
        row.scenario_id === key.scenario_id && row.role === key.role && row.mode === key.mode,
    );
  }
}

class FakeStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly db: FakeD1, private readonly query: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  private exec(): ExecResult {
    return this.db.execute(this.query, this.values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.exec().rows[0] ?? null) as T | null;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = this.exec();
    return {
      success: true,
      results: result.rows as T[],
      meta: { changes: result.changes, last_row_id: result.lastRowId },
    };
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = this.exec();
    return { success: true, results: result.rows as T[], meta: { changes: result.changes } };
  }
}
