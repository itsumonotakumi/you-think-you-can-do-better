import { describe, expect, it } from 'vitest';
import { CAPTION_SCREENS, showsCaptions } from '../../../src/app/parts/captionScreens';

describe('字幕を出す画面', () => {
  it('プレイ中と結果確認（S05〜S09）で出す', () => {
    for (const screen of ['S05', 'S06', 'S07', 'S08', 'S09'] as const) {
      expect(showsCaptions(screen), screen).toBe(true);
    }
    expect(CAPTION_SCREENS).toEqual(['S05', 'S06', 'S07', 'S08', 'S09']);
  });

  it('タイトル・選択・設定などでは出さない（消費もしない）', () => {
    for (const screen of ['S01', 'S02', 'S03', 'S04', 'S10', 'S11', 'error'] as const) {
      expect(showsCaptions(screen), screen).toBe(false);
    }
  });
});
