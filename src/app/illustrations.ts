// イラスト画像の URL を組み立てる。
// ファイルは public/illustrations に決まった名前で置く（<scenarioId>-key.webp など）。
// scenarioId と role は英数字とハイフンだけを許し、それ以外は URL を作らない。

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
