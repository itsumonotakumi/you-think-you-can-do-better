import { describe, expect, it } from 'vitest';
import type { Cue, GameTime, PlayState } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import { claimCues } from '../../../src/app/parts/cueMemory';
import {
  autoItem,
  choiceIndexFromKey,
  composeDraft,
  cueCaptions,
  deadlineViews,
  draftComplete,
  draftFor,
  formatClock,
  gaugeViews,
  initialSelections,
  mediaGlyph,
  mediaLabelKey,
  minutesBetween,
  splitForFatigue,
  voiceViews,
} from '../../../src/app/parts/logic';

const at = (day: number, minutes: number): GameTime => ({ day, minutes });

function makeState(patch: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 2,
    clock: at(0, 540),
    phase: 'detect',
    pointId: 'p1',
    gauges: { damage: 20, flame: 72, trust: 70, stamina: 100 },
    cowardStreak: 0,
    rawScore: 0,
    fatal: false,
    history: [],
    itemsEarned: [],
    itemsMissed: [],
    delayed: [],
    voicesShown: [],
    notes: [],
    deadlines: [],
    flags: {},
    press: null,
    prologue: { comment: '', predictedHours: null },
    startedAt: '2026-11-08T00:00:00Z',
    pendingDraft: null,
    finished: false,
    ...patch,
  };
}

describe('時計と期限', () => {
  it('時刻を 2 桁で出す', () => {
    expect(formatClock(at(0, 540))).toBe('09:00');
    expect(formatClock(at(0, 0))).toBe('00:00');
    expect(formatClock(at(0, 1445))).toBe('00:05');
    expect(formatClock(at(3, 75))).toBe('01:15');
  });

  it('日をまたぐ分数を計算する', () => {
    expect(minutesBetween(at(0, 540), at(1, 600))).toBe(1500);
    expect(minutesBetween(at(1, 600), at(0, 540))).toBe(-1500);
  });

  it('期限の残りと状態を返す', () => {
    const state = makeState({
      clock: at(0, 540),
      deadlines: [
        { id: 'dl-prelim', dueAt: at(3, 540), warned: false, done: false, over: false },
      ],
    });
    const views = deadlineViews(state, fixture);
    expect(views).toHaveLength(1);
    expect(views[0]?.status).toBe('safe');
    expect(views[0]?.label?.ja).toBe('速報');
    expect(views[0]?.textKey).toBe('sb.deadline.remaining');
    expect(views[0]?.vars).toEqual({ hours: 72, minutes: 0 });

    const warn = deadlineViews(makeState({
      clock: at(3, 0),
      deadlines: [{ id: 'dl-prelim', dueAt: at(3, 540), warned: false, done: false, over: false }],
    }), fixture);
    expect(warn[0]?.status).toBe('warn');
    expect(warn[0]?.vars).toEqual({ hours: 9, minutes: 0 });

    const over = deadlineViews(makeState({
      clock: at(3, 630),
      deadlines: [{ id: 'dl-prelim', dueAt: at(3, 540), warned: true, done: false, over: false }],
    }), fixture);
    expect(over[0]?.status).toBe('over');
    expect(over[0]?.textKey).toBe('sb.deadline.over');
    expect(over[0]?.vars).toEqual({ hours: 1, minutes: 30 });
  });

  it('済んだ期限は出さない', () => {
    const state = makeState({
      deadlines: [{ id: 'dl-prelim', dueAt: at(1, 540), warned: false, done: true, over: false }],
    });
    expect(deadlineViews(state, fixture)).toHaveLength(0);
  });
});

describe('ゲージ', () => {
  it('4ゲージを数値と文字で返す', () => {
    const gauges = gaugeViews({ damage: 20, flame: 72, trust: 70, stamina: 19 });
    expect(gauges.map((g) => g.key)).toEqual(['damage', 'flame', 'trust', 'stamina']);
    expect(gauges[1]?.value).toBe(72);
    expect(gauges[1]?.labelKey).toBe('sb.gauge.flame');
    expect(gauges[1]?.levelKey).toBe('sb.level.flame.danger');
    expect(gauges[3]?.levelKey).toBe('sb.level.stamina.exhausted');
  });

  it('範囲外は 0〜100 に丸める', () => {
    const gauges = gaugeViews({ damage: 150, flame: -20, trust: 30, stamina: 80 });
    expect(gauges[0]?.value).toBe(100);
    expect(gauges[0]?.levelKey).toBe('sb.level.damage.severe');
    expect(gauges[1]?.value).toBe(0);
    expect(gauges[1]?.levelKey).toBe('sb.level.flame.calm');
    expect(gauges[2]?.levelKey).toBe('sb.level.trust.thin');
    expect(gauges[3]?.levelKey).toBe('sb.level.stamina.full');
  });
});

describe('選択肢', () => {
  it('数字キー 1〜9 を index に変換する', () => {
    expect(choiceIndexFromKey('1', 3)).toBe(0);
    expect(choiceIndexFromKey('3', 3)).toBe(2);
    expect(choiceIndexFromKey('4', 3)).toBeNull();
    expect(choiceIndexFromKey('0', 3)).toBeNull();
    expect(choiceIndexFromKey('a', 3)).toBeNull();
    expect(choiceIndexFromKey('10', 12)).toBeNull();
  });

  it('体力が低いときは後ろ側を薄くする', () => {
    const text = '隔離して、社内に報告する';
    const split = splitForFatigue(text, 19);
    expect(split.normal).toBe('隔離して、');
    expect(split.faded).toBe('社内に報告する');
    expect(split.normal + split.faded).toBe(text);
  });

  it('体力が 20 以上なら薄くしない', () => {
    expect(splitForFatigue('隔離して、社内に報告する', 20)).toEqual({
      normal: '隔離して、社内に報告する',
      faded: '',
    });
  });

  it('短い文言や句読点で終わる文言でも欠けない', () => {
    expect(splitForFatigue('隔離', 5).faded).toBe('');
    const split = splitForFatigue('全員に連絡する。', 5);
    expect(split.faded.length).toBeGreaterThan(0);
    expect(split.normal + split.faded).toBe('全員に連絡する。');
  });
});

describe('世間の声', () => {
  it('媒体のアイコンと文言キーを返す', () => {
    expect(mediaGlyph('sns')).toBe('@');
    expect(mediaGlyph('news')).toBe('N');
    expect(mediaGlyph('boss')).toBe('☎');
    expect(mediaLabelKey('vendor')).toBe('sb.media.vendor');
  });

  it('表示済みの声だけを順番に返し、誘導情報は含めない', () => {
    const state = makeState({
      voicesShown: [
        { voiceId: 'v-p1-mis', at: at(0, 540), pointId: 'p1' },
        { voiceId: 'v-p1-ok', at: at(0, 555), pointId: 'p1' },
        { voiceId: 'missing', at: at(0, 570), pointId: 'p1' },
      ],
    });
    const voices = voiceViews(state, fixture);
    expect(voices.map((v) => v.id)).toEqual(['v-p1-mis', 'v-p1-ok']);
    expect(voices[0]?.media).toBe('sns');
    expect('misleading' in (voices[0] ?? {})).toBe(false);
    expect(voices[0]?.at).toEqual(at(0, 540));
  });
});

describe('音の字幕', () => {
  it('音・声・表示・遅延・時計から字幕を作る', () => {
    const cues: Cue[] = [
      { kind: 'se', id: 'phone_ring' },
      { kind: 'se', id: 'unknown_se' },
      { kind: 'voice', voiceId: 'v-p1-mis', media: 'vendor' },
      { kind: 'caption', text: { ja: '表示', en: 'show' } },
      { kind: 'delayedHit', reason: { ja: '遅れ', en: 'late' } },
      { kind: 'clock', from: at(0, 540), to: at(0, 600) },
      { kind: 'bgm', id: 'calm' },
      { kind: 'fx', id: 'shake' },
    ];
    const captions = cueCaptions(cues);
    expect(captions.map((c) => c.kind)).toEqual(['se', 'se', 'voice', 'text', 'text', 'clock']);
    expect(captions[0]).toEqual({ kind: 'se', id: 'phone_ring' });
    expect(captions[2]).toEqual({ kind: 'voice', media: 'vendor' });
    expect(captions[3]).toEqual({ kind: 'text', text: { ja: '表示', en: 'show' } });
    expect(captions[4]).toMatchObject({ kind: 'text', prefixKey: 'sb.caption.delayed' });
    expect(captions[5]).toMatchObject({ kind: 'clock', to: at(0, 600) });
  });

  it('音が無いキューには字幕を作らない', () => {
    expect(cueCaptions([{ kind: 'fx', id: 'flash' }, { kind: 'bgm', id: 'calm' }])).toEqual([]);
  });

  it('同じキューの配列は一度だけ再生する', () => {
    const cues: Cue[] = [{ kind: 'se', id: 'phone_ring' }];
    expect(claimCues(cues)).toBe(true);
    expect(claimCues(cues)).toBe(false);
    expect(claimCues([{ kind: 'se', id: 'phone_ring' }])).toBe(true);
  });
});

describe('文案作成', () => {
  const draft = fixture.roles.executive?.drafts?.draft1;

  it('pendingDraft から文案を引く', () => {
    expect(draftFor(makeState({ pendingDraft: 'draft1' }), fixture)?.title.ja).toBe('第1報の文案');
    expect(draftFor(makeState({ pendingDraft: null }), fixture)).toBeNull();
  });

  it('auto の部品は経過時間で決まる', () => {
    if (!draft) throw new Error('fixture draft missing');
    const timing = draft.slots[0];
    const scope = draft.slots[1];
    if (!timing || !scope) throw new Error('fixture slot missing');
    expect(autoItem(timing, makeState({ clock: at(0, 540) }), fixture)?.id).toBe('t-24h');
    expect(autoItem(timing, makeState({ clock: at(2, 540) }), fixture)?.id).toBe('t-late');
    expect(autoItem(scope, makeState(), fixture)).toBeNull();
  });

  it('初期選択は auto だけ埋める', () => {
    if (!draft) throw new Error('fixture draft missing');
    expect(initialSelections(draft, makeState(), fixture)).toEqual({ timing: 't-24h' });
  });

  it('部品から組み上がった文を作る', () => {
    if (!draft) throw new Error('fixture draft missing');
    const text = composeDraft(
      draft,
      { timing: 't-24h', scope: 's-all' },
      (value) => value.ja,
      { separator: '、', autoText: '自動' },
    );
    expect(text).toBe('時刻：自動、範囲：全員');
  });

  it('すべて選ぶまで確定できない', () => {
    if (!draft) throw new Error('fixture draft missing');
    expect(draftComplete(draft, { timing: 't-24h' })).toBe(false);
    expect(draftComplete(draft, { timing: 't-24h', scope: 's-all' })).toBe(true);
  });
});
