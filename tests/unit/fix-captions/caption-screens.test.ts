import { describe, expect, it } from 'vitest';
import { CAPTION_SCREENS, showsCaptions } from '../../../src/app/parts/captionScreens';

describe('字幕を出す画面', () => {
  it('プレイ中（S05〜S07）でだけ出す', () => {
    for (const screen of ['S05', 'S06', 'S07'] as const) {
      expect(showsCaptions(screen), screen).toBe(true);
    }
    expect(CAPTION_SCREENS).toEqual(['S05', 'S06', 'S07']);
  });

  it('結果画面・タイトル・選択・設定などでは出さない（消費もしない）', () => {
    for (const screen of ['S01', 'S02', 'S03', 'S04', 'S08', 'S09', 'S10', 'S11', 'error'] as const) {
      expect(showsCaptions(screen), screen).toBe(false);
    }
  });
});
