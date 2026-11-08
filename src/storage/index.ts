// 契約（Wave0 スタブ）。担当: storage。署名を変えずに中身を実装する。
import type { PlayState, PlaysStore, Settings, Rank } from '../engine/types';

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ja', fontSize: 'medium', bgmVolume: 0.5, seVolume: 0.7, muted: false,
  reduceMotion: false, pressTimeScale: 1, soundNoticeShown: false,
};
/** 書き込み失敗で true（保存なしモード）。画面は一度だけ知らせる */
export let memoryOnly = false;
export function loadSettings(): Settings { return { ...DEFAULT_SETTINGS }; }
export function saveSettings(s: Settings): void { void s; }
export function loadPlays(): PlaysStore { return {}; }
/** 次に始めるプレイの回数（1始まり） */
export function nextPlayCount(scenarioId: string, role: string): number { void scenarioId; void role; return 1; }
/** プレイ開始時に呼ぶ（回数を確定） */
export function registerPlayStart(scenarioId: string, role: string): number { void scenarioId; void role; return 1; }
/** エンディング時に初回記録・最高記録を更新 */
export function recordResult(scenarioId: string, role: string, r: { rank: Rank; score: number; raw: number; playCount: number; at: string }): void { void scenarioId; void role; void r; }
export function loadProgress(): PlayState | null { return null; }
export function saveProgress(s: PlayState | null): void { void s; }
export function loadPrologue(): PlayState['prologue'] | null { return null; }
export function savePrologue(p: PlayState['prologue']): void { void p; }
/** 全消去（確認は画面側） */
export function clearAll(): void {}
