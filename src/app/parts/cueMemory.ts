// 同じ演出キューを二度鳴らさないための記録（S05 を開き直したときの再再生を防ぐ）
import type { Cue } from '../../engine/types';

const played = new WeakSet<Cue[]>();

/** 初めて見るキューなら true。既に再生済みなら false */
export function claimCues(cues: Cue[]): boolean {
  if (played.has(cues)) return false;
  played.add(cues);
  return true;
}

// 字幕は音と別に記録する（画面側が先に音を処理しても、字幕は必ず作る）
const captioned = new WeakSet<Cue[]>();

/** 字幕をまだ作っていないキューなら true */
export function claimCaptionCues(cues: Cue[]): boolean {
  if (captioned.has(cues)) return false;
  captioned.add(cues);
  return true;
}
