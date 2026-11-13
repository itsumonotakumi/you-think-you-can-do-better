// レビュー指摘 #4（発表を延期した選択でも「迅速な公表」になる）の確認。
import { describe, expect, it } from 'vitest';
import type { PlayState } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import {
  headlineFor, isNotificationChoice, pickHeadline,
} from '../../../src/app/headline';

function state(over: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 1,
    clock: { day: 1, minutes: 600 },
    phase: 'after',
    pointId: null,
    gauges: { damage: 20, flame: 10, trust: 80, stamina: 60 },
    cowardStreak: 0,
    rawScore: 1200,
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
    finished: true,
    ...over,
  };
}

const baseRecord = {
  pointId: 'p3',
  at: { day: 0, minutes: 1080 },
  policyPoints: 0,
  itemPoints: 0,
  voicesBefore: [],
};

describe('通知・公表の選択', () => {
  it('先送り（coward / 失点）は公表に数えない', () => {
    const point = fixture.roles.executive?.points.find((item) => item.id === 'p3');
    const delay = point?.choices.find((item) => item.id === 'delay');
    const publish = point?.choices.find((item) => item.id === 'publish');
    expect(delay && isNotificationChoice(delay)).toBe(false);
    expect(publish && isNotificationChoice(publish)).toBe(true);
  });

  it('延期した選択だけなら「迅速な公表」にしない', () => {
    const pick = pickHeadline(state({
      history: [{ ...baseRecord, choiceId: 'delay' }],
    }), fixture);
    expect(pick.situation).toBe('plain');
  });

  it('延期の後に公表しても、延期した時刻では判定しない', () => {
    const pick = pickHeadline(state({
      history: [
        { ...baseRecord, choiceId: 'delay' },
        { ...baseRecord, choiceId: 'publish', at: { day: 4, minutes: 1080 } },
      ],
    }), fixture);
    expect(pick.situation).toBe('plain');
  });

  it('公表した時刻が早ければ「迅速な公表」のまま', () => {
    const pick = pickHeadline(state({
      history: [{ ...baseRecord, choiceId: 'publish' }],
    }), fixture);
    expect(pick.situation).toBe('quick');
    expect(headlineFor(state({ history: [{ ...baseRecord, choiceId: 'publish' }] }), fixture).ja)
      .toContain('迅速な公表');
  });
});
