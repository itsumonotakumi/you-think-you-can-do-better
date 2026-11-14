// 自動登録の送信内容（#7）。点数は送らず、削除用の鍵だけを足す。
import { describe, expect, it } from 'vitest';
import type { PlayState } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import {
  buildRankingSubmission, canSubmitRanking, submissionInput,
} from '../../../src/app/ranking/submission';
import type { RankingProfile } from '../../../src/app/ranking/profile';

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
    ],
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
    finished: true,
    ...patch,
  };
}

const profile: RankingProfile = {
  nickname: 'たろう',
  optOut: false,
  clientId: 'client-1',
  lastSubmittedAt: '',
};

describe('自動登録の送信内容', () => {
  it('削除用の鍵を足し、点数は送らない', () => {
    const payload = buildRankingSubmission(state(), fixture, {
      ...submissionInput(profile, ''),
      deleteKey: 'f'.repeat(64),
    });
    expect(payload).not.toBeNull();
    if (!payload) return;
    expect(payload.deleteKey).toBe('f'.repeat(64));
    expect(payload.nickname).toBe('たろう');
    expect(payload.clientId).toBe('client-1');
    expect(Object.hasOwn(payload, 'score')).toBe(false);
  });

  it('鍵が無ければ付けない（保存できない端末でも登録はできる）', () => {
    const payload = buildRankingSubmission(state(), fixture, submissionInput(profile, ''));
    expect(payload).not.toBeNull();
    expect(payload && Object.hasOwn(payload, 'deleteKey')).toBe(false);
  });

  it('初回の終了後だけ送れる', () => {
    expect(canSubmitRanking(state(), fixture)).toBe(true);
    expect(canSubmitRanking(state({ playCount: 2 }), fixture)).toBe(false);
  });
});
