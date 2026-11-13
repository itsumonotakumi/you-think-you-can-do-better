// クエリ文字列の検査。省略時は既定値、不正なら null を返す。
import type { PlayMode, RoleId } from '../../src/engine/types';
import { ROLES } from '../../src/engine/types';
import { CLIENT_ID_RE } from './submission';

export type Period = 'week' | 'all';

export function parseRole(value: string | null): RoleId | null {
  if (value === null) return null;
  return (ROLES as readonly string[]).includes(value) ? (value as RoleId) : null;
}

/** 省略時は normal */
export function parseMode(value: string | null): PlayMode | null {
  if (value === null || value === '') return 'normal';
  return value === 'normal' || value === 'hard' ? value : null;
}

/** 省略時は all */
export function parsePeriod(value: string | null): Period | null {
  if (value === null || value === '') return 'all';
  return value === 'week' || value === 'all' ? value : null;
}

export function parseClientId(value: string | null): string | null {
  if (!value || !CLIENT_ID_RE.test(value)) return null;
  return value;
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
