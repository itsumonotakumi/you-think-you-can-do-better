import { describe, expect, it } from 'vitest';
import type { CueCaption, ShownCaption } from '../../../src/app/parts/logic';
import {
  CAPTION_HISTORY_LIMIT, nextFreeNoteId, shiftCaption, withCaptionIds,
} from '../../../src/app/parts/logic';

function shown(ids: number[]): ShownCaption[] {
  return ids.map((captionId) => ({ kind: 'se', id: 'phone_ring', captionId }));
}

describe('字幕の待ち行列', () => {
  it('演出キューの順に連番を振る', () => {
    const items: CueCaption[] = [
      { kind: 'se', id: 'phone_ring' },
      { kind: 'voice', media: 'vendor' },
      { kind: 'clock', to: { day: 1, minutes: 0 } },
    ];
    const result = withCaptionIds(items, 4);
    expect(result.map((c) => c.captionId)).toEqual([4, 5, 6]);
    expect(result[1]).toMatchObject({ kind: 'voice', media: 'vendor' });
  });

  it('先頭を履歴の先頭へ移し、残りは順番を保つ', () => {
    const next = shiftCaption(shown([1, 2, 3]), 1, shown([9]));
    expect(next.queue.map((c) => c.captionId)).toEqual([2, 3]);
    expect(next.history.map((c) => c.captionId)).toEqual([1, 9]);
  });

  it('先頭以外のIDでは何もしない', () => {
    const queue = shown([1, 2]);
    const history = shown([3]);
    const next = shiftCaption(queue, 2, history);
    expect(next.queue).toBe(queue);
    expect(next.history).toBe(history);
  });

  it('履歴は上限まで残す', () => {
    const many = shown(Array.from({ length: CAPTION_HISTORY_LIMIT + 5 }, (_, i) => i + 1));
    const next = shiftCaption(shown([99]), 99, many);
    expect(next.history).toHaveLength(CAPTION_HISTORY_LIMIT);
    expect(next.history[0]?.captionId).toBe(99);
  });
});

describe('記録のID', () => {
  it('自由記述は free-<連番> になる', () => {
    expect(nextFreeNoteId([])).toBe('free-1');
    expect(nextFreeNoteId([{ id: 'free-1' }, { id: 'free-3' }])).toBe('free-2');
    expect(nextFreeNoteId([{ id: 'free-1' }, { id: 'free-2' }])).toBe('free-3');
  });

  it('シナリオの記録IDとはぶつからない', () => {
    expect(nextFreeNoteId([{ id: 'note-scope' }, { id: 'note-warning' }])).toBe('free-1');
  });
});
