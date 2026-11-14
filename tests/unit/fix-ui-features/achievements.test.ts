// レビュー指摘 #1（本番モードの記録が累積称号に反映される）と
// #2（未完了のプレイで制覇称号を獲得できる）の確認。
import { describe, expect, it } from 'vitest';
import type { Achievement, EndingResult, PlayState, PlaysStore } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import {
  evaluateAchievements, firstReportHours, playTotals,
} from '../../../src/app/achievements';

function state(over: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 1,
    clock: { day: 1, minutes: 600 },
    phase: 'after',
    pointId: null,
    gauges: { damage: 20, flame: 30, trust: 60, stamina: 80 },
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
    finished: true,
    ...over,
  };
}

const RESULT: EndingResult = {
  raw: 300, multiplier: 1, official: 300, rank: 'B', sales: 100, fatal: false, playCount: 1,
};

function record(first: boolean, bestRank: 'S' | 'A' | 'B' | 'C' | 'D' | null = null) {
  return {
    count: 1,
    first: first ? { rank: 'B' as const, score: 300, raw: 300, at: '2026-11-08T00:00:00Z' } : null,
    best: bestRank ? { rank: bestRank, score: 1200, count: 1 } : null,
  };
}

function ids(plays: PlaysStore, scenarioIds?: string[]): string[] {
  return evaluateAchievements({
    state: state(), scenario: fixture, result: RESULT, plays, scenarioIds,
  }).map((item: Achievement) => item.id).sort();
}

describe('プレイ記録のキー（本番モード）', () => {
  it('末尾の /hard を難易度として外し、シナリオとロールを読む', () => {
    const plays: PlaysStore = {
      'no01-nebula/executive/hard': record(true),
      'no01-nebula/officer': record(true),
      'no01-nebula/lead/normal': record(true),
    };
    const totals = playTotals(plays);
    expect([...totals.scenarios.keys()]).toEqual(['no01-nebula']);
    expect(totals.scenarios.get('no01-nebula')?.roles).toEqual(new Set(['executive', 'officer', 'lead']));
    expect(totals.totalPlays).toBe(3);
  });

  it('本番モードだけでも全ロール達成を数える', () => {
    const plays: PlaysStore = {
      'no01-nebula/executive': record(true),
      'no01-nebula/officer': record(true),
      'no01-nebula/lead': record(true),
      'no01-nebula/analyst/hard': record(true),
    };
    expect(ids(plays)).toContain('all-roles');
  });

  it('本番モードの最高ランクも S の判定に入る', () => {
    const plays: PlaysStore = {
      'a/executive/hard': record(true, 'S'),
      'b/lead/normal': record(true, 'S'),
    };
    expect(ids(plays)).toContain('rank-s-two');
  });
});

describe('未完了のプレイ', () => {
  it('開始しただけのロールは制覇の条件に数えない', () => {
    const plays: PlaysStore = {
      'no01-nebula/executive': record(true),
      'no01-nebula/officer': record(true),
      'no01-nebula/lead': record(true),
      // 4人目は開始しただけで中断
      'no01-nebula/analyst': record(false),
    };
    expect(ids(plays)).not.toContain('all-roles');
  });

  it('開始しただけのシナリオは全シナリオ制覇に数えない', () => {
    const plays: PlaysStore = {
      'a/executive': record(true),
      'b/lead': record(false),
    };
    const got = ids(plays, ['a', 'b']);
    expect(got).not.toContain('all-scenarios');
    expect(got).not.toContain('graduate');
  });

  it('開始回数の合計は従来どおり数える', () => {
    const totals = playTotals({ 'a/executive': { count: 4, first: null, best: null } });
    expect(totals.totalPlays).toBe(4);
    expect(totals.scenarios.size).toBe(0);
  });
});

describe('初報の時刻（先送りの選択）', () => {
  const delay = {
    pointId: 'p3',
    choiceId: 'delay',
    at: { day: 0, minutes: 1080 },
    policyPoints: -100,
    itemPoints: 0,
    voicesBefore: [],
  };

  it('公表を見送った選択は初報の時刻にしない', () => {
    expect(firstReportHours(state({ history: [delay] }), fixture)).toBeNull();
  });

  it('公表した選択だけを初報の時刻にする', () => {
    const publish = { ...delay, choiceId: 'publish' };
    expect(firstReportHours(state({ history: [delay, publish] }), fixture)).toBe(11);
  });

  it('先送りだけなら fast-report を返さない', () => {
    const got = evaluateAchievements({
      state: state({ history: [delay] }), scenario: fixture, result: RESULT, plays: {},
    }).map((item) => item.id);
    expect(got).not.toContain('fast-report');
    expect(got).not.toContain('prediction-hit');
  });
});
