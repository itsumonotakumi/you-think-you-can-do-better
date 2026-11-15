// イラスト画像の URL を組み立てる。
// ファイルは public/illustrations に決まった名前で置く（<scenarioId>-key.webp など）。
// scenarioId と role は英数字とハイフンだけを許し、それ以外は URL を作らない。

import type { DecisionPoint, PhaseId } from '../engine/types';

const SAFE_ID = /^[A-Za-z0-9-]+$/;
const DIR = 'illustrations/';

function baseUrl(): string {
  const base = import.meta.env.BASE_URL ?? './';
  return base.endsWith('/') ? base : `${base}/`;
}

function safe(value: string): boolean {
  return SAFE_ID.test(value);
}

/** シナリオの場面（横長）。不正な id は null */
export function keyVisual(scenarioId: string): string | null {
  if (!safe(scenarioId)) return null;
  return `${baseUrl()}${DIR}${scenarioId}-key.webp`;
}

/** ロールの人物画（正方形）。不正な id・role は null */
export function portrait(scenarioId: string, role: string): string | null {
  if (!safe(scenarioId) || !safe(role)) return null;
  return `${baseUrl()}${DIR}${scenarioId}-${role}.webp`;
}

/** 記者会見の場面（横長） */
export function pressImage(): string {
  return `${baseUrl()}${DIR}press.webp`;
}

/** 段階の切り替わりに出す挿絵の段階。detect はキービジュアルを使うので含めない */
export type ScenePhase = Exclude<PhaseId, 'detect'>;
export const SCENE_PHASES: readonly ScenePhase[] = [
  'contain', 'organize', 'investigate', 'notify', 'recover', 'after',
];

/** 段階の挿絵（横長）。許可していない phase・不正な id は null */
export function sceneImage(scenarioId: string, phase: string): string | null {
  if (!safe(scenarioId)) return null;
  if (!(SCENE_PHASES as readonly string[]).includes(phase)) return null;
  return `${baseUrl()}${DIR}${scenarioId}-scene-${phase}.webp`;
}

/**
 * その point が、ロールの points 配列で自分の phase が最初に出てくる point か。
 * 「直前の phase と違うか」ではなく配列の並びで決めるので、再読み込みしても同じ結果になる。
 */
export function isFirstPointInPhase(points: readonly DecisionPoint[], pointId: string): boolean {
  const index = points.findIndex((point) => point.id === pointId);
  if (index < 0) return false;
  const phase = points[index]?.phase;
  if (!phase) return false;
  return points.findIndex((point) => point.phase === phase) === index;
}
