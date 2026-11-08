import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { render } from 'svelte/server';
import type { NoticeId, PlayState } from '../../../src/engine/types';
import { initI18n, setLang } from '../../../src/i18n';
import {
  advanceCaption, captionHistory, captions, enqueueCaptions, play, resetCaptions, scenario, settings,
} from '../../../src/app/store';
import { DEFAULT_SETTINGS } from '../../../src/storage';
import type { CueCaption } from '../../../src/app/parts/logic';
import { fixture } from '../../fixtures/scenario';
import CaptionBar from '../../../src/app/parts/CaptionBar.svelte';
import S07Press from '../../../src/app/screens/S07Press.svelte';
import * as s07Module from '../../../src/app/screens/S07Press.svelte';

// tsc は .svelte の module script の export を型として読めないため、形を明示して受け取る
type CaptionKind = 'fiveSeconds' | 'timeout';
const s07 = s07Module as unknown as {
  PRESS_CAPTION_KEYS: Record<CaptionKind, string>;
  pressCaptionItems: (kinds: CaptionKind[]) => CueCaption[];
  pressCaptionKinds: (remaining: number, warned: boolean) => CaptionKind[];
  flushCaptions: () => void;
};

const jaStrings: Record<string, string> = {
  'sc.press.caption.shutter': 'シャッター音',
  'sc.press.caption.fiveSeconds': '残り5秒',
  'sc.press.caption.timeout': '時間切れ',
};

const enStrings: Record<string, string> = {
  'sc.press.caption.shutter': 'Camera shutter',
  'sc.press.caption.fiveSeconds': '5 seconds left',
  'sc.press.caption.timeout': 'Time is up',
};

const notices: Record<NoticeId, string> = {
  criminal: '', fiction: '', score: '', purpose: '', voices: '', replay: '',
};

function pressState(): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 1,
    clock: { day: 3, minutes: 600 },
    phase: 'notify',
    pointId: null,
    gauges: { damage: 30, flame: 40, trust: 60, stamina: 70 },
    cowardStreak: 0,
    rawScore: 0,
    fatal: false,
    history: [],
    itemsEarned: [],
    itemsMissed: [],
    delayed: [],
    voicesShown: [],
    notes: [{
      id: 'note-warning',
      text: { ja: '事前に警告があった', en: 'A warning came' },
      at: { day: 0, minutes: 540 },
    }],
    deadlines: [],
    flags: {},
    press: { questionIds: ['q1'], index: 0, answers: [] },
    prologue: { comment: '', predictedHours: null },
    startedAt: '2026-11-08T00:00:00Z',
    pendingDraft: null,
    finished: false,
  };
}

beforeEach(() => {
  initI18n({
    ja: { strings: jaStrings, notices },
    en: { strings: enStrings, notices },
  });
  setLang('ja');
  scenario.set(fixture);
  settings.set({ ...DEFAULT_SETTINGS });
  play.set(pressState());
  resetCaptions();
});

describe('会見の字幕に出す合図', () => {
  it('残り5秒で一度だけ警告し、0秒で時間切れになる', () => {
    expect(s07.pressCaptionKinds(6, false)).toEqual([]);
    expect(s07.pressCaptionKinds(5, false)).toEqual(['fiveSeconds']);
    expect(s07.pressCaptionKinds(5, true)).toEqual([]);
    expect(s07.pressCaptionKinds(0, true)).toEqual(['timeout']);
    // 制限時間が5秒以下の質問では、警告と時間切れが同じ tick に来る
    expect(s07.pressCaptionKinds(0, false)).toEqual(['fiveSeconds', 'timeout']);
  });

  it('文言は sc.press.caption.* のキーを使う', () => {
    expect(s07.PRESS_CAPTION_KEYS.fiveSeconds).toBe('sc.press.caption.fiveSeconds');
    expect(s07.PRESS_CAPTION_KEYS.timeout).toBe('sc.press.caption.timeout');
  });

  it('作った時点の言語で字幕の文字を作る', () => {
    expect(s07.pressCaptionItems(['fiveSeconds'])[0]).toEqual({
      kind: 'text',
      text: { ja: '残り5秒', en: '残り5秒' },
    });
    setLang('en');
    expect(s07.pressCaptionItems(['timeout'])[0]).toMatchObject({
      kind: 'text',
      text: { en: 'Time is up' },
    });
  });
});

describe('S07 の字幕表示（共通の親が出す）', () => {
  it('字幕の待ち行列の先頭を CaptionBar で出す', () => {
    enqueueCaptions(s07.pressCaptionItems(['fiveSeconds']));
    const { body } = render(CaptionBar);
    expect(body).toContain('role="status"');
    expect(body).toContain('残り5秒');
  });

  it('表示し終えた字幕は履歴に残る', () => {
    enqueueCaptions(s07.pressCaptionItems(['fiveSeconds', 'timeout']));
    const head = get(captions)[0];
    expect(head).toBeDefined();
    advanceCaption(head!.captionId);

    const { body } = render(CaptionBar);
    expect(body).toContain('時間切れ');
    expect(body).toContain('残り5秒');
  });

  it('シャッター音の文言を画面に出す', () => {
    const { body } = render(S07Press);
    expect(body).toContain('シャッター音');
  });

  it('たまった字幕を履歴へ送り、会見の字幕を先頭に出す', () => {
    enqueueCaptions([
      { kind: 'se', id: 'phone_ring' },
      { kind: 'se', id: 'notify_sns' },
    ]);
    s07.flushCaptions();
    enqueueCaptions(s07.pressCaptionItems(['fiveSeconds']));

    const queue = get(captions);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: 'text' });
    expect(get(captionHistory).length).toBeGreaterThanOrEqual(2);

    const { body } = render(CaptionBar);
    expect(body).toContain('残り5秒');
  });
});
