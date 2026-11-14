// 保存（localStorage）。担当: storage。設計書 8章, 13章。
// localStorage が無い・例外のときは memoryOnly=true にしてメモリ上で動く。
import type {
  DeadlineState, DelayedEffect, Flags, Gauges, GameTime, Localized, PlayMode, PlayRecord, PlayState,
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

/**
 * プレイ回数のキー。通常モードは従来どおり `${scenarioId}/${role}`、
 * 本番モードだけ `/hard` を足して別に数える（#10。既存の保存はそのまま読める）。
 */
function playKey(scenarioId: string, role: string, mode: PlayMode = 'normal'): string {
  const base = `${scenarioId}/${role}`;
  return mode === 'hard' ? `${base}/hard` : base;
}

/** 次に始めるプレイの回数（1始まり） */
export function nextPlayCount(scenarioId: string, role: string, mode: PlayMode = 'normal'): number {
  const rec = loadPlays()[playKey(scenarioId, role, mode)];
  return rec ? rec.count + 1 : 1;
}

/** プレイ開始時に呼ぶ（回数を確定） */
export function registerPlayStart(scenarioId: string, role: string, mode: PlayMode = 'normal'): number {
  const plays = loadPlays();
  const key = playKey(scenarioId, role, mode);
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
  mode: PlayMode = 'normal',
): void {
  const plays = loadPlays();
  const key = playKey(scenarioId, role, mode);
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
  // 難易度は後から足した項目なので、無い保存（通常モード）も受け付ける
  if (v.mode !== undefined && v.mode !== 'normal' && v.mode !== 'hard') return false;
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

// ---------------- 再読み込み後の復元 ----------------
// 共有契約の STORAGE_KEYS は変えられないため、追加のキーはこのモジュールで持つ。
export const SESSION_KEYS = {
  /** いまいる画面と、その画面に戻るのに要る最小限の情報 */
  screen: 'ytcdb:v1:screen',
  /** 最後に終えたプレイ（S08/S09/S12 を再読み込みしても結果を残す） */
  lastPlay: 'ytcdb:v1:lastPlay',
  /** startedAt ごとの処理済みフラグ（二重計上を防ぐ） */
  processed: 'ytcdb:v1:processed',
  /** 画面ごとの制限時間の残り（残り時間を増やさないため） */
  timers: 'ytcdb:v1:timers',
  /** プロローグで入力中の内容（再読み込みで消えないように） */
  prologueDraft: 'ytcdb:v1:prologueDraft',
} as const;

export const RESUME_SCREENS = [
  'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12',
] as const;
export type ResumeScreenId = (typeof RESUME_SCREENS)[number];

export interface ResumePoint {
  screen: ResumeScreenId;
  /** S02〜S07 のプレイ対象、S04 で選んだシナリオ */
  scenarioId: string | null;
  /** S10/S11 から戻る先 */
  backTo: ResumeScreenId;
  /** S08/S09/S12 で表示している終了済みプレイの startedAt */
  playRef: string | null;
  /** S01 の上に重ねて開いている画面 */
  overlay: 'achievements' | null;
}

function isResumeScreen(v: unknown): v is ResumeScreenId {
  return typeof v === 'string' && (RESUME_SCREENS as readonly string[]).includes(v);
}

export function loadResume(): ResumePoint | null {
  const raw = parseJson(readRaw(SESSION_KEYS.screen));
  if (!isRecord(raw) || !isResumeScreen(raw.screen)) return null;
  return {
    screen: raw.screen,
    scenarioId: typeof raw.scenarioId === 'string' ? raw.scenarioId : null,
    backTo: isResumeScreen(raw.backTo) ? raw.backTo : 'S01',
    playRef: typeof raw.playRef === 'string' ? raw.playRef : null,
    overlay: raw.overlay === 'achievements' ? 'achievements' : null,
  };
}

export function saveResume(point: ResumePoint): void {
  writeRaw(SESSION_KEYS.screen, JSON.stringify(point));
}

export function clearResume(): void {
  removeRaw(SESSION_KEYS.screen);
}

export interface LastPlay {
  startedAt: string;
  scenarioId: string;
  state: PlayState;
}

/** 最後に終えたプレイ。終えていない保存は受け付けない */
export function loadLastPlay(): LastPlay | null {
  const raw = parseJson(readRaw(SESSION_KEYS.lastPlay));
  if (!isRecord(raw)) return null;
  const state = raw.state;
  if (!isPlayState(state) || state.finished !== true) return null;
  const scenarioId = typeof raw.scenarioId === 'string' ? raw.scenarioId : state.scenarioId;
  if (scenarioId !== state.scenarioId) return null;
  return { startedAt: state.startedAt, scenarioId, state };
}

export function saveLastPlay(state: PlayState): void {
  writeRaw(SESSION_KEYS.lastPlay, JSON.stringify({ scenarioId: state.scenarioId, state }));
}

export function clearLastPlay(): void {
  removeRaw(SESSION_KEYS.lastPlay);
}

export type RankingMark = 'none' | 'attempted' | 'sent';

export interface ProcessedPlay {
  startedAt: string;
  playRegistered: boolean;
  playCount: number;
  recorded: boolean;
  achievements: boolean;
  ranking: RankingMark;
}

function isRankingMark(v: unknown): v is RankingMark {
  return v === 'none' || v === 'attempted' || v === 'sent';
}

export function loadProcessed(): ProcessedPlay | null {
  const raw = parseJson(readRaw(SESSION_KEYS.processed));
  if (!isRecord(raw)) return null;
  if (typeof raw.startedAt !== 'string') return null;
  return {
    startedAt: raw.startedAt,
    playRegistered: raw.playRegistered === true,
    playCount: isInt(raw.playCount) && raw.playCount >= 0 ? raw.playCount : 0,
    recorded: raw.recorded === true,
    achievements: raw.achievements === true,
    ranking: isRankingMark(raw.ranking) ? raw.ranking : 'none',
  };
}

function saveProcessed(p: ProcessedPlay): void {
  writeRaw(SESSION_KEYS.processed, JSON.stringify(p));
}

/** そのプレイの処理済み記録（startedAt が一致するときだけ） */
export function processedFor(startedAt: string): ProcessedPlay | null {
  const saved = loadProcessed();
  return saved && saved.startedAt === startedAt ? saved : null;
}

function emptyProcessed(startedAt: string): ProcessedPlay {
  return {
    startedAt, playRegistered: false, playCount: 0,
    recorded: false, achievements: false, ranking: 'none',
  };
}

function patchProcessed(startedAt: string, patch: Partial<Omit<ProcessedPlay, 'startedAt'>>): void {
  const saved = processedFor(startedAt) ?? emptyProcessed(startedAt);
  saveProcessed({ ...saved, ...patch, startedAt });
}

/**
 * プレイ開始の回数登録。同じ startedAt で二度呼ばれても数え直さない
 * （再読み込みでプレイ回数が増えないようにする）。
 */
export function beginPlayOnce(
  scenarioId: string, role: string, mode: PlayMode, startedAt: string,
): number {
  const saved = processedFor(startedAt);
  if (saved?.playRegistered) return saved.playCount;
  const count = registerPlayStart(scenarioId, role, mode);
  patchProcessed(startedAt, { playRegistered: true, playCount: count });
  return count;
}

export function markRecorded(startedAt: string): void {
  patchProcessed(startedAt, { recorded: true });
}

export function markAchievements(startedAt: string): void {
  patchProcessed(startedAt, { achievements: true });
}

export function markRanking(startedAt: string, ranking: RankingMark): void {
  patchProcessed(startedAt, { ranking });
}

export interface TimerSnapshot {
  /** どの判断・質問の時間か（変わったら数え直す） */
  key: string;
  remaining: number;
  total: number;
}

type TimerStore = Record<string, TimerSnapshot>;

const TIMER_NAME = /^[A-Za-z0-9-]+$/;

function loadTimers(): TimerStore {
  const raw = parseJson(readRaw(SESSION_KEYS.timers));
  if (!isRecord(raw)) return {};
  const out: TimerStore = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!TIMER_NAME.test(name) || !isSafeKey(name) || !isRecord(value)) continue;
    if (typeof value.key !== 'string') continue;
    if (!isNum(value.remaining) || value.remaining < 0) continue;
    if (!isNum(value.total) || value.total < 0) continue;
    out[name] = { key: value.key, remaining: value.remaining, total: value.total };
  }
  return out;
}

/** 画面ごとの残り時間。再読み込みで増えないよう、保存した値より大きくは戻さない */
export function loadTimer(name: string): TimerSnapshot | null {
  if (!TIMER_NAME.test(name)) return null;
  const all = loadTimers();
  return Object.hasOwn(all, name) ? all[name] ?? null : null;
}

export function saveTimer(name: string, snap: TimerSnapshot): void {
  if (!TIMER_NAME.test(name)) return;
  const all = loadTimers();
  all[name] = { key: snap.key, remaining: snap.remaining, total: snap.total };
  writeRaw(SESSION_KEYS.timers, JSON.stringify(all));
}

export function clearTimer(name: string): void {
  const all = loadTimers();
  if (!Object.hasOwn(all, name)) return;
  delete all[name];
  writeRaw(SESSION_KEYS.timers, JSON.stringify(all));
}

// ---------------- プロローグ ----------------
export interface PrologueDraft {
  comment: string;
  /** 入力欄の文字のまま（数値に直すのは確定時） */
  hours: string;
}

export function loadPrologueDraft(): PrologueDraft | null {
  const raw = parseJson(readRaw(SESSION_KEYS.prologueDraft));
  if (!isRecord(raw) || typeof raw.comment !== 'string' || typeof raw.hours !== 'string') return null;
  if (raw.comment.length > 200 || raw.hours.length > 8) return null;
  return { comment: raw.comment, hours: raw.hours };
}

export function savePrologueDraft(draft: PrologueDraft): void {
  writeRaw(SESSION_KEYS.prologueDraft, JSON.stringify(draft));
}

export function clearPrologueDraft(): void {
  removeRaw(SESSION_KEYS.prologueDraft);
}

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
  for (const key of Object.values(SESSION_KEYS)) removeRaw(key);
}
