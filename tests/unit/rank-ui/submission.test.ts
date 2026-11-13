import { describe, expect, it } from 'vitest';
import type { PlayState } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import {
  buildRankingSubmission, canSubmitRanking, collectChoices, collectDraftChoices, collectPress,
} from '../../../src/app/ranking/submission';

function state(patch: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 1,
    clock: { day: 0, minutes: 1260 },
    phase: 'after',
    pointId: null,
    gauges: { damage: 10, flame: 20, trust: 70, stamina: 70 },
    cowardStreak: 0,
    rawScore: 500,
    fatal: false,
    history: [
      { pointId: 'p1', choiceId: 'isolate', at: { day: 0, minutes: 540 }, policyPoints: 100, itemPoints: 5, voicesBefore: [] },
      { pointId: 'p3', choiceId: 'publish', at: { day: 0, minutes: 1080 }, policyPoints: 300, itemPoints: 10, voicesBefore: [] },
      { pointId: 'missing', choiceId: 'gone', at: { day: 0, minutes: 1200 }, policyPoints: 0, itemPoints: 0, voicesBefore: [] },
    ],
    itemsEarned: ['i-iso-record', 't-24h', 's-all'],
    itemsMissed: [],
    delayed: [],
    voicesShown: [],
    notes: [],
    deadlines: [],
    flags: { reported: true },
    press: {
      questionIds: ['q1'],
      index: 1,
      answers: [{ questionId: 'q1', answerId: 'a1', points: 30 }],
    },
    prologue: { comment: '対応が遅い', predictedHours: 12 },
    startedAt: '2026-11-08T00:00:00Z',
    pendingDraft: null,
    finished: true,
    ...patch,
  };
}

const input = { nickname: 'たろう', clientId: 'client-1', turnstileToken: '' };

describe('送信できる条件', () => {
  it('初回プレイの終了後だけ送れる', () => {
    expect(canSubmitRanking(state(), fixture)).toBe(true);
    expect(canSubmitRanking(state({ playCount: 2 }), fixture)).toBe(false);
    expect(canSubmitRanking(state({ finished: false }), fixture)).toBe(false);
    expect(canSubmitRanking(state(), null)).toBe(false);
  });

  it('シナリオの版が違えば送らない', () => {
    expect(canSubmitRanking(state({ scenarioVersion: '0.9.0' }), fixture)).toBe(false);
    expect(canSubmitRanking(state({ scenarioId: 'other' }), fixture)).toBe(false);
  });
});

describe('送信データ', () => {
  it('点数は送らず、選択・報告書・会見を組み立てる', () => {
    const payload = buildRankingSubmission(state(), fixture, input);
    expect(payload).not.toBeNull();
    if (!payload) return;

    expect(payload.scenarioId).toBe(fixture.id);
    expect(payload.scenarioVersion).toBe(fixture.version);
    expect(payload.role).toBe('executive');
    expect(payload.mode).toBe('normal');
    expect(payload.nickname).toBe('たろう');
    expect(payload.clientId).toBe('client-1');
    expect(payload.turnstileToken).toBe('');
    expect(Object.hasOwn(payload, 'score')).toBe(false);

    // 存在しない判断は落とす。順番は履歴のまま
    expect(payload.choices).toEqual([
      { pointId: 'p1', choiceId: 'isolate' },
      { pointId: 'p3', choiceId: 'publish' },
    ]);
    // auto の枠（timing）はサーバーが時計から決めるので送らない
    expect(payload.drafts).toEqual([{ draftKey: 'draft1', slotId: 'scope', optionId: 's-all' }]);
    expect(payload.press).toEqual([{ questionId: 'q1', answerId: 'a1' }]);
  });

  it('本番モードを送る', () => {
    const payload = buildRankingSubmission(state({ mode: 'hard' }), fixture, input);
    expect(payload?.mode).toBe('hard');
  });

  it('初回でなければ null', () => {
    expect(buildRankingSubmission(state({ playCount: 3 }), fixture, input)).toBeNull();
  });

  it('報告書まで到達していなければ送らない', () => {
    const withoutDraft = state();
    withoutDraft.history = withoutDraft.history.filter((record) => record.pointId !== 'p3');
    expect(collectDraftChoices(withoutDraft, fixture)).toEqual([]);
  });

  it('会見の時間切れ（回答なし）も送れる', () => {
    const payload = buildRankingSubmission(state({
      press: { questionIds: ['q1'], index: 1, answers: [{ questionId: 'q1', answerId: null, points: -30 }] },
    }), fixture, input);
    expect(payload?.press).toEqual([{ questionId: 'q1', answerId: null }]);
  });

  it('会見をしていなければ空', () => {
    expect(collectPress(state({ press: null }))).toEqual([]);
  });

  it('シナリオに無い選択肢は送らない', () => {
    const broken = state();
    broken.history = [{ ...broken.history[0]!, choiceId: 'tampered' }];
    expect(collectChoices(broken, fixture)).toEqual([]);
  });
});
