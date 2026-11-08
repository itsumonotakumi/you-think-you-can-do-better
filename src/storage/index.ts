// 保存（localStorage）。担当: storage。設計書 8章, 13章。
// localStorage が無い・例外のときは memoryOnly=true にしてメモリ上で動く。
import type {
  DeadlineState, DelayedEffect, Flags, Gauges, GameTime, Localized, PlayRecord, PlayState,
  PlaysStore, PlayerNote, PressState, Rank, Settings, VoiceShown,
} from '../engine/types';
import { LANGS, PHASES, ROLES, STORAGE_KEYS } from '../engine/types';

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ja', fontSize: 'medium', theme: 'light', bgmVolume: 0.5, seVolume: 0.7, muted: false,
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

/** JSON のキーをそのまま代入してよいか。プロトタイプ汚染を招くキーは捨てる */
function isSafeKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInt(v: unknown): v is number {
  return isNum(v) && Number.isInteger(v);
}

function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string');
}

function isLocalized(v: unknown): v is Localized {
  return isRecord(v) && typeof v.ja === 'string' && typeof v.en === 'string';
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
  if (v.theme === 'light' || v.theme === 'dark') s.theme = v.theme;
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
    if (!isSafeKey(key)) continue;
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
  return isRecord(v) && isInt(v.day) && v.day >= 0 && isNum(v.minutes) && v.minutes >= 0;
}

/** ゲージは 0〜100 の有限数だけを受け付ける */
function isGaugeValue(v: unknown): v is number {
  return isNum(v) && v >= 0 && v <= 100;
}

function isGauges(v: unknown): v is Gauges {
  return isRecord(v)
    && isGaugeValue(v.damage)
    && isGaugeValue(v.flame)
    && isGaugeValue(v.trust)
    && isGaugeValue(v.stamina);
}

/** 遅れて来る効果の差分はマイナスもあり得るので、有限数だけを見る */
function isGaugeDelta(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isRecord(v)) return false;
  const keys = ['damage', 'flame', 'trust', 'stamina'];
  return keys.every((key) => v[key] === undefined || isNum(v[key]));
}

function isLocalizedText(v: unknown): boolean {
  return typeof v === 'string' || isLocalized(v);
}

function isPrologue(v: unknown): v is PlayState['prologue'] {
  return isRecord(v)
    && typeof v.comment === 'string'
    && (v.predictedHours === null || isNum(v.predictedHours));
}

/** 文案のキーは YAML の draft 名（英小文字・数字・ハイフン）。危険キーは別途 isSafeKey で弾く */
const DRAFT_KEY = /^[a-z0-9-]+$/;
/** フラグのキーは camelCase と `ev:<id>`。記号入りの危険キーは通さない */
const FLAG_KEY = /^[A-Za-z0-9_:-]+$/;

function isPendingDraft(v: unknown): v is string | null {
  if (v === null) return true;
  return typeof v === 'string' && DRAFT_KEY.test(v) && isSafeKey(v);
}

function isFlags(v: unknown): v is Flags {
  return isRecord(v) && Object.entries(v).every(([key, value]) =>
    isSafeKey(key) && FLAG_KEY.test(key) && typeof value === 'boolean');
}

function isChoiceRecord(v: unknown): boolean {
  return isRecord(v)
    && typeof v.pointId === 'string'
    && typeof v.choiceId === 'string'
    && isGameTime(v.at)
    && isNum(v.policyPoints)
    && isNum(v.itemPoints)
    && isStrArray(v.voicesBefore);
}

function isVoiceShown(v: unknown): v is VoiceShown {
  return isRecord(v)
    && typeof v.voiceId === 'string'
    && isGameTime(v.at)
    && (v.pointId === null || typeof v.pointId === 'string');
}

function isPlayerNote(v: unknown): v is PlayerNote {
  return isRecord(v)
    && typeof v.id === 'string'
    && isLocalizedText(v.text)
    && isGameTime(v.at);
}

function isDelayedEffect(v: unknown): v is DelayedEffect {
  return isRecord(v)
    && typeof v.sourcePointId === 'string'
    && typeof v.sourceChoiceId === 'string'
    && isInt(v.dueAtPhaseIndex)
    && isNum(v.points)
    && isGaugeDelta(v.gauges)
    && isLocalized(v.reason)
    && typeof v.applied === 'boolean';
}

function isDeadlineState(v: unknown): v is DeadlineState {
  return isRecord(v)
    && typeof v.id === 'string'
    && isGameTime(v.dueAt)
    && typeof v.warned === 'boolean'
    && typeof v.done === 'boolean'
    && typeof v.over === 'boolean';
}

function isPressAnswer(v: unknown): boolean {
  return isRecord(v)
    && typeof v.questionId === 'string'
    && (v.answerId === null || typeof v.answerId === 'string')
    && isNum(v.points);
}

function isPressState(v: unknown): v is PressState {
  return isRecord(v)
    && isStrArray(v.questionIds)
    && isInt(v.index)
    && v.index >= 0
    && Array.isArray(v.answers)
    && v.answers.every(isPressAnswer);
}

function isPlayState(v: unknown): v is PlayState {
  if (!isRecord(v)) return false;
  if (typeof v.scenarioId !== 'string' || typeof v.scenarioVersion !== 'string') return false;
  if (typeof v.role !== 'string' || !(ROLES as readonly string[]).includes(v.role)) return false;
  if (!isInt(v.playCount) || v.playCount < 1) return false;
  if (!isGameTime(v.clock)) return false;
  if (typeof v.phase !== 'string' || !(PHASES as readonly string[]).includes(v.phase)) return false;
  if (!(v.pointId === null || typeof v.pointId === 'string')) return false;
  if (!isGauges(v.gauges)) return false;
  if (!isInt(v.cowardStreak) || !isNum(v.rawScore)) return false;
  if (typeof v.fatal !== 'boolean') return false;
  if (!Array.isArray(v.history) || !v.history.every(isChoiceRecord)) return false;
  if (!isStrArray(v.itemsEarned) || !isStrArray(v.itemsMissed)) return false;
  if (!Array.isArray(v.delayed) || !v.delayed.every(isDelayedEffect)) return false;
  if (!Array.isArray(v.voicesShown) || !v.voicesShown.every(isVoiceShown)) return false;
  if (!Array.isArray(v.notes) || !v.notes.every(isPlayerNote)) return false;
  if (!Array.isArray(v.deadlines) || !v.deadlines.every(isDeadlineState)) return false;
  if (!isFlags(v.flags)) return false;
  if (!(v.press === null || isPressState(v.press))) return false;
  if (!isPrologue(v.prologue)) return false;
  if (typeof v.startedAt !== 'string') return false;
  if (!isPendingDraft(v.pendingDraft)) return false;
  if (typeof v.finished !== 'boolean') return false;
  return true;
}

export function loadProgress(): PlayState | null {
  try {
    const raw = parseJson(readRaw(STORAGE_KEYS.progress));
    return isPlayState(raw) ? raw : null;
  } catch {
    return null;
  }
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
