// 字幕と履歴を出す画面（設計書 10章, A05）。
// プレイ中（S05〜S07）だけに出す。結果画面（S08・S09）やタイトル・設定では出さない。
// 表示しない画面では「表示し終えた」として待ち行列から消費もしない（出していない字幕を消さない）。
import type { ScreenId } from '../store';

export const CAPTION_SCREENS: readonly ScreenId[] = ['S05', 'S06', 'S07'];

export function showsCaptions(screen: ScreenId): boolean {
  return CAPTION_SCREENS.includes(screen);
}
