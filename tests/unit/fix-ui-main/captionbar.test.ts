import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { render } from 'svelte/server';
import { initI18n } from '../../../src/i18n';
import {
  advanceCaption, captions, enqueueCaptions, resetCaptions,
} from '../../../src/app/store';
import CaptionBar from '../../../src/app/parts/CaptionBar.svelte';

const strings: Record<string, string> = {
  'sb.caption.se.phone_ring': '着信',
  'sb.caption.se.default': '音：{id}',
  'sb.caption.call': '着信：{who}',
  'sb.caption.mail': 'メール受信：{who}',
  'sb.caption.notify': '通知：{media}',
  'sb.caption.clock': '時刻が{time}に進みました',
  'sb.caption.delayed': '遅れて来た影響',
  'sb.media.vendor': '取引先',
  'sb.media.sns': 'SNS',
};

const notices = {
  criminal: '',
  fiction: '',
  score: '',
  purpose: '',
  voices: '',
  replay: '',
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

describe('CaptionBar', () => {
  it('待ち行列の先頭を表示する', () => {
    enqueueCaptions([
      { kind: 'se', id: 'phone_ring' },
      { kind: 'voice', media: 'vendor' },
    ]);
    const { body } = render(CaptionBar);
    expect(body).toContain('着信');
    // 2件目はまだ待ち行列の中なので、字幕としては出さない
    expect(body).not.toContain('着信：取引先');
  });

  it('表示し終えた字幕を履歴として確認できる', () => {
    enqueueCaptions([
      { kind: 'se', id: 'phone_ring' },
      { kind: 'clock', to: { day: 1, minutes: 605 } },
    ]);
    const head = get(captions)[0];
    expect(head).toBeDefined();
    advanceCaption(head!.captionId);

    const { body } = render(CaptionBar);
    expect(body).toContain('時刻が10:05に進みました');
    expect(body).toContain('着信');
  });

  it('音のわからないIDでも字幕を出す', () => {
    enqueueCaptions([{ kind: 'se', id: 'unknown_se' }]);
    const { body } = render(CaptionBar);
    expect(body).toContain('音：unknown_se');
  });
});
