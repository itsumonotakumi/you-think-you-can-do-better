// 字幕と履歴を出す画面（設計書 10章, A05）。
// プレイ中と結果確認だけに出す。それ以外の画面では表示しないだけでなく、
// 「表示し終えた」として待ち行列から消費もしない（出していない字幕を消さない）。
import type { ScreenId } from '../store';

export const CAPTION_SCREENS: readonly ScreenId[] = ['S05', 'S06', 'S07', 'S08', 'S09'];

export function showsCaptions(screen: ScreenId): boolean {
  return CAPTION_SCREENS.includes(screen);
}
