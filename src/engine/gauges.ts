// ゲージの加算と 0〜100 への丸め。
import type { GaugeDelta, Gauges } from './types';
import { NIGHT } from './types';

const GAUGE_KEYS = ['damage', 'flame', 'trust', 'stamina'] as const;

export function clampGauge(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * 差分を足して 0〜100 に収める。
 * 深夜帯は体力の減少を 1.5 倍（切り捨て）にする。
 */
export function applyGauges(gauges: Gauges, delta: GaugeDelta, night: boolean): Gauges {
  const next: Gauges = { ...gauges };
  for (const key of GAUGE_KEYS) {
    const d = delta[key];
    if (d === undefined) continue;
    let add = d;
    if (key === 'stamina' && d < 0 && night) {
      add = Math.floor(d * NIGHT.staminaFactor);
    }
    next[key] = clampGauge(gauges[key] + add);
  }
  return next;
}
