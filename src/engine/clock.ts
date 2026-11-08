// ゲームの時計（Day + 0:00 からの分）。純粋な計算だけを持つ。
import type { GameTime } from './types';
import { NIGHT } from './types';

export const DAY_MINUTES = 1440;

export function toAbs(t: GameTime): number {
  return t.day * DAY_MINUTES + t.minutes;
}

export function fromAbs(abs: number): GameTime {
  const day = Math.floor(abs / DAY_MINUTES);
  return { day, minutes: abs - day * DAY_MINUTES };
}

export function addMinutes(t: GameTime, minutes: number): GameTime {
  return fromAbs(toAbs(t) + minutes);
}

export function cloneTime(t: GameTime): GameTime {
  return { day: t.day, minutes: t.minutes };
}

/** 22:00〜6:00 を深夜帯とみなす */
export function isNight(t: GameTime): boolean {
  return t.minutes >= NIGHT.start || t.minutes < NIGHT.end;
}
