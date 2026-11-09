import { describe, expect, it } from 'vitest';
import { groupCaptions, type ShownCaption } from '../../../src/app/parts/logic';
import { CAPTION_SCREENS, showsCaptions } from '../../../src/app/parts/captionScreens';

const labelOf = (caption: ShownCaption): string =>
  caption.kind === 'se' ? caption.id : caption.kind;

let seq = 0;
function shutter(): ShownCaption {
  seq += 1;
  return { kind: 'se', id: 'shutter', captionId: seq };
}

function ring(): ShownCaption {
  seq += 1;
  return { kind: 'se', id: 'phone_ring', captionId: seq };
}

describe('字幕のまとめ', () => {
  it('同じ文言が連続したら1件にして回数を持つ', () => {
    const history = [shutter(), shutter(), shutter(), shutter(), shutter()];
    const groups = groupCaptions(history, labelOf, 5);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(5);
    expect(groups[0]?.caption.captionId).toBe(history[0]?.captionId);
  });

  it('間に別の字幕が挟まれば分けたままにする', () => {
    const history = [shutter(), shutter(), ring(), shutter()];
    const groups = groupCaptions(history, labelOf, 5);
    expect(groups.map((group) => group.count)).toEqual([2, 1, 1]);
  });

  it('表示する件数で切るが、切る前の回数は数え切る', () => {
    const history = [shutter(), shutter(), ring(), ring(), shutter(), shutter()];
    const groups = groupCaptions(history, labelOf, 2);
    expect(groups.map((group) => group.count)).toEqual([2, 2]);
  });

  it('空の履歴では何も返さない', () => {
    expect(groupCaptions([], labelOf, 5)).toEqual([]);
  });
});

describe('字幕を出す画面', () => {
  it('プレイ中（S05〜S07）だけ出す', () => {
    expect(CAPTION_SCREENS).toEqual(['S05', 'S06', 'S07']);
    for (const screen of ['S05', 'S06', 'S07'] as const) {
      expect(showsCaptions(screen), screen).toBe(true);
    }
  });

  it('結果画面（S08・S09）では出さない', () => {
    for (const screen of ['S08', 'S09'] as const) {
      expect(showsCaptions(screen), screen).toBe(false);
    }
  });
});
