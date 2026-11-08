// 保存（localStorage）。担当: storage。設計書 8章, 13章。
// localStorage が無い・例外のときは memoryOnly=true にしてメモリ上で動く。
import type {
  Gauges, GameTime, PlayRecord, PlayState, PlaysStore, Rank, Settings,
} from '../engine/types';
import { LANGS, PHASES, ROLES, STORAGE_KEYS } from '../engine/types';

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ja', fontSize: 'medium', bgmVolume: 0.5, seVolume: 0.7, muted: false,
  reduceMotion: false, pressTimeScale: 1, soundNoticeShown: false,
};
/** 書き込み失敗で true（保存なしモード）。画面は一度だけ知らせる */
export let memoryOnly = false;

// ---------------- localStorage の薄いラッパ ----------------
const memory = new Map<string, string>();

function getStorage(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    if (!s || typeof s.getItem !== 'function' || typeof s.setItem !== 'function' || typeof s.removeItem !== 'function') {
      memoryOnly = true;
      return null;
    }
    return s;
  } catch {
    memoryOnly = true;
    return null;
  }
}

function readRaw(key: string): string | null {
  const cached = memory.get(key);
  if (cached !== undefined) return cached;
  const s = getStorage();
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    memoryOnly = true;
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  const s = getStorage();
  if (s) {
    try {
      s.setItem(key, value);
      memory.delete(key);
      return;
    } catch {
      memoryOnly = true;
    }
  }
  memory.set(key, value);
}

function removeRaw(key: string): void {
  memory.delete(key);
  const s = getStorage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    memoryOnly = true;
  }
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------------- 設定 ----------------
const FONT_SIZES: readonly Settings['fontSize'][] = ['small', 'medium', 'large'];

function sanitizeSettings(v: unknown): Settings {
  if (!isRecord(v)) return { ...DEFAULT_SETTINGS };
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (typeof v.lang === 'string' && (LANGS as readonly string[]).includes(v.lang)) {
    s.lang = v.lang as Settings['lang'];
  }
  if (typeof v.fontSize === 'string' && (FONT_SIZES as readonly string[]).includes(v.fontSize)) {
    s.fontSize = v.fontSize as Settings['fontSize'];
  }
  if (isVolume(v.bgmVolume)) s.bgmVolume = v.bgmVolume;
  if (isVolume(v.seVolume)) s.seVolume = v.seVolume;
  if (typeof v.muted === 'boolean') s.muted = v.muted;
  if (typeof v.reduceMotion === 'boolean') s.reduceMotion = v.reduceMotion;
  if (v.pressTimeScale === 1 || v.pressTimeScale === 1.5 || v.pressTimeScale === 2) {
    s.pressTimeScale = v.pressTimeScale;
  }
  if (typeof v.soundNoticeShown === 'boolean') s.soundNoticeShown = v.soundNoticeShown;
  return s;
}

function isVolume(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

export function loadSettings(): Settings {
  return sanitizeSettings(parseJson(readRaw(STORAGE_KEYS.settings)));
}

export function saveSettings(s: Settings): void {
  writeRaw(STORAGE_KEYS.settings, JSON.stringify(s));
}

// ---------------- プレイ回数と記録 ----------------
const RANKS: readonly Rank[] = ['S', 'A', 'B', 'C', 'D'];

function isRank(v: unknown): v is Rank {
  return typeof v === 'string' && (RANKS as readonly string[]).includes(v);
}

function sanitizeFirst(v: unknown): PlayRecord['first'] {
  if (!isRecord(v)) return null;
  if (!isRank(v.rank)) return null;
  if (typeof v.score !== 'number' || !Number.isFinite(v.score)) return null;
  if (typeof v.raw !== 'number' || !Number.isFinite(v.raw)) return null;
  if (typeof v.at !== 'string') return null;
  return { rank: v.rank, score: v.score, raw: v.raw, at: v.at };
}

function sanitizeBest(v: unknown): PlayRecord['best'] {
  if (!isRecord(v)) return null;
  if (!isRank(v.rank)) return null;
  if (typeof v.score !== 'number' || !Number.isFinite(v.score)) return null;
  if (typeof v.count !== 'number' || !Number.isInteger(v.count) || v.count < 0) return null;
  return { rank: v.rank, score: v.score, count: v.count };
}

function sanitizeRecord(v: unknown): PlayRecord | null {
  if (!isRecord(v)) return null;
  if (typeof v.count !== 'number' || !Number.isInteger(v.count) || v.count < 0) return null;
  return {
    count: v.count,
    first: sanitizeFirst(v.first),
    best: sanitizeBest(v.best),
  };
}

export function loadPlays(): PlaysStore {
  const raw = parseJson(readRaw(STORAGE_KEYS.plays));
  if (!isRecord(raw)) return {};
  const out: PlaysStore = {};
  for (const [key, value] of Object.entries(raw)) {
    const rec = sanitizeRecord(value);
    if (rec) out[key] = rec;
  }
  return out;
}

function savePlays(plays: PlaysStore): void {
  writeRaw(STORAGE_KEYS.plays, JSON.stringify(plays));
}

function playKey(scenarioId: string, role: string): string {
  return `${scenarioId}/${role}`;
}

/** 次に始めるプレイの回数（1始まり） */
export function nextPlayCount(scenarioId: string, role: string): number {
  const rec = loadPlays()[playKey(scenarioId, role)];
  return rec ? rec.count + 1 : 1;
}

/** プレイ開始時に呼ぶ（回数を確定） */
export function registerPlayStart(scenarioId: string, role: string): number {
  const plays = loadPlays();
  const key = playKey(scenarioId, role);
  const rec: PlayRecord = plays[key] ?? { count: 0, first: null, best: null };
  rec.count += 1;
  plays[key] = rec;
  savePlays(plays);
  return rec.count;
}

/** エンディング時に初回記録・最高記録を更新 */
export function recordResult(
  scenarioId: string,
  role: string,
  r: { rank: Rank; score: number; raw: number; playCount: number; at: string },
): void {
  const plays = loadPlays();
  const key = playKey(scenarioId, role);
  const rec: PlayRecord = plays[key] ?? { count: 0, first: null, best: null };
  if (r.playCount > rec.count) rec.count = r.playCount;
  if (rec.first === null) {
    rec.first = { rank: r.rank, score: r.score, raw: r.raw, at: r.at };
  }
  if (rec.best === null || r.score > rec.best.score) {
    rec.best = { rank: r.rank, score: r.score, count: r.playCount };
  }
  plays[key] = rec;
  savePlays(plays);
}

// ---------------- 進行中プレイ ----------------
function isGameTime(v: unknown): v is GameTime {
  return isRecord(v)
    && typeof v.day === 'number' && Number.isInteger(v.day)
    && typeof v.minutes === 'number' && Number.isFinite(v.minutes);
}

function isGauges(v: unknown): v is Gauges {
  return isRecord(v)
    && typeof v.damage === 'number'
    && typeof v.flame === 'number'
    && typeof v.trust === 'number'
    && typeof v.stamina === 'number';
}

function isPrologue(v: unknown): v is PlayState['prologue'] {
  return isRecord(v)
    && typeof v.comment === 'string'
    && (v.predictedHours === null || typeof v.predictedHours === 'number');
}

function isPlayState(v: unknown): v is PlayState {
  if (!isRecord(v)) return false;
  if (typeof v.scenarioId !== 'string' || typeof v.scenarioVersion !== 'string') return false;
  if (typeof v.role !== 'string' || !(ROLES as readonly string[]).includes(v.role)) return false;
  if (typeof v.playCount !== 'number' || !Number.isInteger(v.playCount)) return false;
  if (!isGameTime(v.clock)) return false;
  if (typeof v.phase !== 'string' || !(PHASES as readonly string[]).includes(v.phase)) return false;
  if (!(v.pointId === null || typeof v.pointId === 'string')) return false;
  if (!isGauges(v.gauges)) return false;
  if (typeof v.cowardStreak !== 'number' || typeof v.rawScore !== 'number') return false;
  if (typeof v.fatal !== 'boolean') return false;
  if (!Array.isArray(v.history) || !Array.isArray(v.itemsEarned) || !Array.isArray(v.itemsMissed)) return false;
  if (!Array.isArray(v.delayed) || !Array.isArray(v.voicesShown) || !Array.isArray(v.notes)) return false;
  if (!Array.isArray(v.deadlines)) return false;
  if (!isRecord(v.flags)) return false;
  if (!(v.press === null || isRecord(v.press))) return false;
  if (!isPrologue(v.prologue)) return false;
  if (typeof v.startedAt !== 'string') return false;
  if (!(v.pendingDraft === null || typeof v.pendingDraft === 'string')) return false;
  if (typeof v.finished !== 'boolean') return false;
  return true;
}

export function loadProgress(): PlayState | null {
  const raw = parseJson(readRaw(STORAGE_KEYS.progress));
  return isPlayState(raw) ? raw : null;
}

export function saveProgress(s: PlayState | null): void {
  if (s === null) {
    removeRaw(STORAGE_KEYS.progress);
    return;
  }
  writeRaw(STORAGE_KEYS.progress, JSON.stringify(s));
}

// ---------------- プロローグ ----------------
export function loadPrologue(): PlayState['prologue'] | null {
  const raw = parseJson(readRaw(STORAGE_KEYS.prologue));
  return isPrologue(raw) ? raw : null;
}

export function savePrologue(p: PlayState['prologue']): void {
  writeRaw(STORAGE_KEYS.prologue, JSON.stringify(p));
}

/** 全消去（確認は画面側） */
export function clearAll(): void {
  for (const key of Object.values(STORAGE_KEYS)) removeRaw(key);
}
