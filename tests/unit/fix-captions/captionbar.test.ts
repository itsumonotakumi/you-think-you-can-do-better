import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { render } from 'svelte/server';
import { initI18n } from '../../../src/i18n';
import {
  advanceCaption, captionHistory, captions, enqueueCaptions, resetCaptions,
} from '../../../src/app/store';
import CaptionBar from '../../../src/app/parts/CaptionBar.svelte';

const strings: Record<string, string> = {
  'sb.caption.se.phone_ring': '着信',
  'sb.caption.se.default': '音：{id}',
  'sb.caption.call': '着信：{who}',
  'sb.caption.notify': '通知：{media}',
  'sb.caption.clock': '時刻が{time}に進みました',
  'sb.caption.delayed': '遅れて来た影響',
  'sb.caption.history': '字幕の履歴（{count}）',
  'sb.media.sns': 'SNS',
  'sb.media.vendor': '取引先',
};

const notices = {
  criminal: '', fiction: '', score: '', purpose: '', voices: '', replay: '',
};

beforeEach(() => {
  initI18n({
    ja: { strings, notices },
    en: { strings, notices },
  } as unknown as Parameters<typeof initI18n>[0]);
  resetCaptions();
});

afterEach(() => {
  resetCaptions();
});

describe('字幕の共通部品', () => {
  it('待ち行列の先頭だけを字幕として出す', () => {
    enqueueCaptions([
      { kind: 'se', id: 'phone_ring' },
      { kind: 'voice', media: 'vendor' },
    ]);
    const { body } = render(CaptionBar);
    expect(body).toContain('role="status"');
    expect(body).toContain('着信');
    expect(body).not.toContain('着信：取引先');
  });

  it('表示し終えた字幕は履歴から確認できる', () => {
    enqueueCaptions([{ kind: 'se', id: 'phone_ring' }]);
    const head = get(captions)[0];
    expect(head).toBeDefined();
    advanceCaption(head!.captionId);

    const { body } = render(CaptionBar);
    expect(body).toContain('<details');
    expect(body).toContain('字幕の履歴（1）');
    expect(body).toContain('着信');
    expect(get(captionHistory)).toHaveLength(1);
  });

  it('音のわからないIDでも字幕にする', () => {
    enqueueCaptions([{ kind: 'se', id: 'unknown_se' }]);
    const { body } = render(CaptionBar);
    expect(body).toContain('音：unknown_se');
  });
});
