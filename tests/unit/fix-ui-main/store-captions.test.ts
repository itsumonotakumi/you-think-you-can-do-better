import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { CAPTION_HISTORY_LIMIT } from '../../../src/app/parts/logic';
import {
  advanceCaption, captionHistory, captions, enqueueCaptions, resetCaptions,
} from '../../../src/app/store';

beforeEach(() => {
  resetCaptions();
});

describe('store の字幕', () => {
  it('同時に来た字幕を切り捨てず、待ち行列に積む', () => {
    enqueueCaptions([
      { kind: 'se', id: 'phone_ring' },
      { kind: 'se', id: 'notify_sns' },
      { kind: 'voice', media: 'attacker' },
      { kind: 'text', text: { ja: '出来事', en: 'event' } },
    ]);
    const queue = get(captions);
    expect(queue).toHaveLength(4);
    expect(queue.map((c) => c.captionId)).toEqual([1, 2, 3, 4]);
    expect(get(captionHistory)).toHaveLength(0);
  });

  it('表示し終えた字幕だけを順番に履歴へ移す', () => {
    enqueueCaptions([
      { kind: 'se', id: 'phone_ring' },
      { kind: 'voice', media: 'vendor' },
    ]);
    const first = get(captions)[0];
    expect(first).toBeDefined();
    advanceCaption(first!.captionId);

    expect(get(captions).map((c) => c.captionId)).toEqual([2]);
    expect(get(captionHistory).map((c) => c.captionId)).toEqual([1]);

    // 先頭ではないIDでは進めない
    advanceCaption(1);
    expect(get(captions).map((c) => c.captionId)).toEqual([2]);
    expect(get(captionHistory).map((c) => c.captionId)).toEqual([1]);
  });

  it('履歴は新しいものが先頭で、上限を超えない', () => {
    const items = Array.from({ length: CAPTION_HISTORY_LIMIT + 2 }, () => ({
      kind: 'se' as const, id: 'clock_tick',
    }));
    enqueueCaptions(items);
    for (let i = 0; i < items.length; i += 1) {
      const head = get(captions)[0];
      if (head) advanceCaption(head.captionId);
    }
    expect(get(captions)).toHaveLength(0);
    const history = get(captionHistory);
    expect(history).toHaveLength(CAPTION_HISTORY_LIMIT);
    expect(history[0]?.captionId).toBe(items.length);
    expect(history[history.length - 1]?.captionId).toBe(items.length - CAPTION_HISTORY_LIMIT + 1);
  });

  it('リセットすると連番も戻る', () => {
    enqueueCaptions([{ kind: 'se', id: 'select' }]);
    resetCaptions();
    expect(get(captions)).toHaveLength(0);
    expect(get(captionHistory)).toHaveLength(0);
    enqueueCaptions([{ kind: 'se', id: 'select' }]);
    expect(get(captions)[0]?.captionId).toBe(1);
  });
});
