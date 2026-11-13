// 獲得した称号の保存（#9）。STORAGE_KEYS.achievements に JSON で置く。
// 保存できない環境（プライベートブラウズ等）でも落ちないよう、メモリ上の値で続ける。
import type { Achievement, RoleId } from '../../engine/types';
import { ROLES, STORAGE_KEYS } from '../../engine/types';
import { isKnownAchievement } from './definitions';
import type { AchievementInput } from './evaluate';
import { evaluateAchievements } from './evaluate';

/** 1件分の獲得記録（型の契約は src/engine/types.ts の STORAGE_KEYS.achievements のコメント） */
export interface AchievementRecord {
  at: string;
  scenarioId: string;
  role: RoleId;
}

export type AchievementStore = Record<string, AchievementRecord>;

const KEY = STORAGE_KEYS.achievements;
let memory: string | null = null;

function storage(): Storage | null {
  try {
    const value = (globalThis as { localStorage?: Storage }).localStorage;
    if (!value || typeof value.getItem !== 'function' || typeof value.setItem !== 'function') return null;
    return value;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  const store = storage();
  if (store) {
    try {
      const value = store.getItem(KEY);
      if (value !== null) return value;
    } catch {
      // 読めないときはメモリ上の値を使う
    }
  }
  return memory;
}

function writeRaw(value: string): void {
  memory = value;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, value);
  } catch {
    // 保存できないときはメモリ上だけに残す
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function isRole(value: unknown): value is RoleId {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function loadAchievements(): AchievementStore {
  const raw = readRaw();
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const out: AchievementStore = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!isSafeKey(id) || !isKnownAchievement(id) || !isRecord(value)) continue;
    if (typeof value.at !== 'string' || typeof value.scenarioId !== 'string') continue;
    if (!isRole(value.role)) continue;
    out[id] = { at: value.at, scenarioId: value.scenarioId, role: value.role };
  }
  return out;
}

export function saveAchievements(store: AchievementStore): void {
  writeRaw(JSON.stringify(store));
}

/**
 * 判定して、新しく獲得した称号だけを保存し、返す。
 * at は呼び出し側（画面）が決める。エンジンと同じく、ここでは現在時刻を読まない。
 */
export function grantAchievements(input: AchievementInput & { at: string }): Achievement[] {
  const store = loadAchievements();
  const newly = evaluateAchievements({ ...input, earned: Object.keys(store) });
  if (newly.length === 0) return [];
  const next: AchievementStore = { ...store };
  for (const item of newly) {
    next[item.id] = { at: input.at, scenarioId: input.state.scenarioId, role: input.state.role };
  }
  saveAchievements(next);
  return newly;
}
