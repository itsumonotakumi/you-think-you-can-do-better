// 契約（Wave0 スタブ）。担当: audio。署名を変えずに中身を実装する。素材が無ければ無音で動く。
import type { Cue } from '../engine/types';

export interface AudioController {
  /** 「はじめる」押下時に呼ぶ（自動再生制限の解除） */
  unlock(): Promise<void>;
  playBgm(id: string): void;
  playSe(id: string): void;
  setVolumes(v: { bgm: number; se: number; muted: boolean }): void;
  /** 炎上度に応じた BGM 切替（ヒステリシス付き） */
  updateFlame(flame: number): void;
  /** 演出キューの音部分だけを処理 */
  runCues(cues: Cue[]): void;
  /** 読み込みに失敗した素材があるか（設定画面に表示） */
  hasLoadError(): boolean;
}

export const audio: AudioController = {
  async unlock() {},
  playBgm() {},
  playSe() {},
  setVolumes() {},
  updateFlame() {},
  runCues() {},
  hasLoadError: () => false,
};
