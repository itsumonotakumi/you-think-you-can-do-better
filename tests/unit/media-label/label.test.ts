import { describe, it, expect } from 'vitest';
import { mediaLabelKey } from '../../../src/app/parts/logic';

describe('媒体の表示名（ロール別）', () => {
  it('経営者・グループ会社社長には「上司」を使わない', () => {
    expect(mediaLabelKey('boss', 'executive')).toBe('sb.media.boss_executive');
    expect(mediaLabelKey('boss', 'officer', 'sc')).toBe('sc.media.boss_officer');
  });
  it('部門長・担当者と他の媒体はそのまま', () => {
    expect(mediaLabelKey('boss', 'lead')).toBe('sb.media.boss');
    expect(mediaLabelKey('sns', 'executive')).toBe('sb.media.sns');
  });
});
