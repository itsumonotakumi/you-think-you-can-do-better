import { describe, it, expect } from 'vitest';
import { splitVoices, type VoiceItem } from '../../../src/app/parts/logic';

const v = (id: string, day: number, minutes: number): VoiceItem =>
  ({ id, media: 'sns', text: { ja: id, en: id }, at: { day, minutes }, pointId: null });

describe('世間の声の折り畳み', () => {
  it('いちばん新しい時刻の声だけを最新にする', () => {
    const r = splitVoices([v('a', 0, 600), v('b', 0, 700), v('c', 0, 700)]);
    expect(r.latest.map((x) => x.id)).toEqual(['b', 'c']);
    expect(r.older.map((x) => x.id)).toEqual(['a']);
  });
  it('日をまたいだ時刻も比較する', () => {
    const r = splitVoices([v('a', 0, 1400), v('b', 1, 10)]);
    expect(r.latest.map((x) => x.id)).toEqual(['b']);
  });
  it('空なら両方空', () => {
    expect(splitVoices([])).toEqual({ latest: [], older: [] });
  });
});
