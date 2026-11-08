import { describe, expect, it } from 'vitest';
import { MISLEADING_TYPES } from '../../../src/engine/types';
import type { Axis, GameTime, PlayState, PressQuestion, Rank, Scenario } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import * as s07Module from '../../../src/app/screens/S07Press.svelte';
import * as s08Module from '../../../src/app/screens/S08Ending.svelte';
import * as s09Module from '../../../src/app/screens/S09Review.svelte';

// tsc は .svelte の module script の export を型として読めないため、形を明示して受け取る
const s07 = s07Module as unknown as {
  DEFAULT_PRESS_SECONDS: number;
  PRESS_WARN_SECONDS: number;
  displaySeconds: (remaining: number) => number;
  pressSeconds: (question: PressQuestion, scale: number) => number;
};
const s08 = s08Module as unknown as {
  rankClass: (rank: Rank) => string;
  publicationHours: (state: PlayState, scenario: Scenario) => number | null;
};
const s09 = s09Module as unknown as {
  axisLabelKey: (axis: Axis) => string;
  typeLabelKey: (type: (typeof MISLEADING_TYPES)[number]) => string;
  signed: (points: number) => string;
  publicationHours: (state: PlayState, scenario: Scenario) => number | null;
};

const question = fixture.press?.questions[0] as PressQuestion;

function stateWithHistory(pointId: string, choiceId: string, at: GameTime): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 1,
    clock: at,
    phase: 'notify',
    pointId: null,
    gauges: { damage: 0, flame: 0, trust: 50, stamina: 100 },
    cowardStreak: 0,
    rawScore: 0,
    fatal: false,
    history: [{ pointId, choiceId, at, policyPoints: 0, itemPoints: 0, voicesBefore: [] }],
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
  };
}

describe('S07 記者会見の制限時間', () => {
  it('seconds が無ければ既定30秒', () => {
    expect(s07.DEFAULT_PRESS_SECONDS).toBe(30);
    expect(s07.pressSeconds({ ...question, seconds: undefined }, 1)).toBe(30);
    expect(s07.pressSeconds({ ...question, seconds: 0 }, 1)).toBe(30);
  });

  it('設定の倍率を掛ける', () => {
    expect(s07.pressSeconds({ ...question, seconds: 30 }, 1)).toBe(30);
    expect(s07.pressSeconds({ ...question, seconds: 25 }, 1.5)).toBe(38);
    expect(s07.pressSeconds({ ...question, seconds: 20 }, 2)).toBe(40);
    expect(s07.pressSeconds({ ...question, seconds: undefined }, 2)).toBe(60);
  });

  it('残り秒数は0未満にせず、端数は切り上げる', () => {
    expect(s07.displaySeconds(0)).toBe(0);
    expect(s07.displaySeconds(-3)).toBe(0);
    expect(s07.displaySeconds(0.2)).toBe(1);
    expect(s07.displaySeconds(12)).toBe(12);
    expect(s07.PRESS_WARN_SECONDS).toBe(5);
  });
});

describe('S08 エンディング', () => {
  it('ランクの見た目クラスを作る', () => {
    for (const rank of ['S', 'A', 'B', 'C', 'D'] as Rank[]) {
      expect(s08.rankClass(rank)).toBe(`rank-${rank.toLowerCase()}`);
    }
  });

  it('最初の公表判断までの時間を出す', () => {
    expect(s08.publicationHours(
      stateWithHistory('p3', 'publish', { day: 0, minutes: 1080 }), fixture,
    )).toBe(11);
    expect(s08.publicationHours(
      stateWithHistory('p1', 'isolate', { day: 0, minutes: 540 }), fixture,
    )).toBeNull();
  });
});

describe('S09 振り返り', () => {
  it('細目の軸に文言キーがある', () => {
    for (const axis of ['time', 'order', 'wording', 'content', 'record', 'care'] as Axis[]) {
      expect(s09.axisLabelKey(axis)).toBe(`sc.review.axis.${axis}`);
    }
  });

  it('誘導の型すべてに文言キーがある', () => {
    for (const type of MISLEADING_TYPES) {
      expect(s09.typeLabelKey(type)).toBe(`sc.review.type.${type}`);
    }
  });

  it('点数を符号付きで出す', () => {
    expect(s09.signed(5)).toBe('+5');
    expect(s09.signed(0)).toBe('0');
    expect(s09.signed(-30)).toBe('-30');
  });

  it('最初の公表判断までの時間を出す', () => {
    expect(s09.publicationHours(
      stateWithHistory('p3', 'publish', { day: 0, minutes: 1080 }), fixture,
    )).toBe(11);
  });
});
