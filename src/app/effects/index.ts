// 契約（Wave0 スタブ）。担当: effects。署名を変えずに中身を実装する。
// 演出は document.body / 指定要素への CSS クラス付け外しで行う（クラス名: fx-<FxId>）。
import type { Cue, FxId } from '../../engine/types';

export function runFx(id: FxId, on = true): void { void id; void on; }
/** 演出キューの fx 部分だけを処理。reduceMotion なら揺れ・フラッシュ・早送り・タイプを止める */
export function runFxCues(cues: Cue[], reduceMotion: boolean): void { void cues; void reduceMotion; }
