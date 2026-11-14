import { describe, expect, it } from 'vitest';
import type { Achievement, EndingResult, PlayState, PlaysStore } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import {
  ACHIEVEMENTS, ACHIEVEMENTS_LABEL_KEY, achievementById, evaluateAchievements,
  firstReportHours, playTotals, representativeTitle,
} from '../../../src/app/achievements';

function baseState(over: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 1,
    clock: { day: 0, minutes: 600 },
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

function baseResult(over: Partial<EndingResult> = {}): EndingResult {
  return { raw: 300, multiplier: 1, official: 300, rank: 'B', sales: 100, fatal: false, playCount: 1, ...over };
}

function playRecord(count: number, bestRank: 'S' | 'A' | 'B' | 'C' | 'D' | null = null) {
  return {
    count,
    // 制覇の判定は完了した記録だけを数える（first が入っていれば完了）
    first: { rank: 'B' as const, score: 300, raw: 300, at: '2026-11-08T00:00:00Z' },
    best: bestRank === null ? null : { rank: bestRank, score: 1200, count },
  };
}

function ids(over: {
  state?: Partial<PlayState>;
  result?: Partial<EndingResult>;
  plays?: PlaysStore;
  scenarioIds?: string[];
  earned?: string[];
} = {}): string[] {
  return evaluateAchievements({
    state: baseState(over.state),
    scenario: fixture,
    result: baseResult(over.result),
    plays: over.plays ?? {},
    scenarioIds: over.scenarioIds,
    earned: over.earned,
  }).map((item) => item.id).sort();
}

const REPORT = { pointId: 'p3', choiceId: 'publish', at: { day: 0, minutes: 1080 }, policyPoints: 300, itemPoints: 0, voicesBefore: [] };

describe('称号の定義', () => {
  it('15〜25個あり、id が重複しない', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(15);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(25);
    const unique = new Set(ACHIEVEMENTS.map((def) => def.id));
    expect(unique.size).toBe(ACHIEVEMENTS.length);
  });

  it('日英の文言とヒントが空でない', () => {
    for (const def of ACHIEVEMENTS) {
      expect(def.title.ja.trim().length, def.id).toBeGreaterThan(0);
      expect(def.title.en.trim().length, def.id).toBeGreaterThan(0);
      expect(def.description.ja.trim().length, def.id).toBeGreaterThan(0);
      expect(def.description.en.trim().length, def.id).toBeGreaterThan(0);
      expect(def.hint.ja.trim().length, def.id).toBeGreaterThan(0);
      expect(def.hint.en.trim().length, def.id).toBeGreaterThan(0);
    }
  });

  it('重みは正の数で、play と total の両方がある', () => {
    for (const def of ACHIEVEMENTS) expect(def.weight, def.id).toBeGreaterThan(0);
    expect(ACHIEVEMENTS.some((def) => def.scope === 'play')).toBe(true);
    expect(ACHIEVEMENTS.some((def) => def.scope === 'total')).toBe(true);
  });

  it('id から定義を引ける。知らない id は null', () => {
    expect(achievementById('rank-s')?.title.ja).toBe('S級の対応');
    expect(achievementById('unknown')).toBeNull();
  });

  it('一覧ボタンの文言キーは ach. で始まる', () => {
    expect(ACHIEVEMENTS_LABEL_KEY.startsWith('ach.')).toBe(true);
  });
});

describe('1回のプレイで決まる称号', () => {
  it('条件を満たすものだけを返す', () => {
    expect(ids()).toEqual(['coward-zero', 'damage-low', 'first-clear', 'no-fatal']);
  });

  it('エンディング前は first-clear を返さない', () => {
    expect(ids({ state: { finished: false } })).not.toContain('first-clear');
  });

  it('炎上度0で flame-zero', () => {
    expect(ids({ state: { gauges: { damage: 20, flame: 0, trust: 60, stamina: 80 } } }))
      .toContain('flame-zero');
    expect(ids()).not.toContain('flame-zero');
  });

  it('72時間以内の初報で fast-report', () => {
    expect(ids({ state: { history: [REPORT] } })).toContain('fast-report');
    const late = { ...REPORT, at: { day: 4, minutes: 1080 } };
    expect(ids({ state: { history: [late] } })).not.toContain('fast-report');
  });

  it('会見で時間切れがないときだけ press-no-timeout', () => {
    const answered = { questionIds: ['q1'], index: 1, answers: [{ questionId: 'q1', answerId: 'a1', points: 30 }] };
    expect(ids({ state: { press: answered } })).toContain('press-no-timeout');
    const timedOut = { ...answered, answers: [{ questionId: 'q1', answerId: null, points: -30 }] };
    expect(ids({ state: { press: timedOut } })).not.toContain('press-no-timeout');
    expect(ids({ state: { press: { questionIds: [], index: 0, answers: [] } } }))
      .not.toContain('press-no-timeout');
  });

  it('臆病ゲージ0と致命傷なし', () => {
    expect(ids({ state: { cowardStreak: 0 } })).toContain('coward-zero');
    expect(ids({ state: { cowardStreak: 2 } })).not.toContain('coward-zero');
    expect(ids({ result: { fatal: true, rank: 'D' }, state: { fatal: true } })).not.toContain('no-fatal');
  });

  it('ランクSと、本番モードのA以上', () => {
    expect(ids({ result: { rank: 'S', official: 1200 } })).toContain('rank-s');
    expect(ids({ result: { rank: 'S' } })).not.toContain('hard-a');
    expect(ids({ state: { mode: 'hard' }, result: { rank: 'A' } })).toContain('hard-a');
    expect(ids({ state: { mode: 'hard' }, result: { rank: 'B' } })).not.toContain('hard-a');
  });

  it('細目を取りこぼさないと items-complete', () => {
    expect(ids({ state: { itemsEarned: ['i-1'], itemsMissed: [] } })).toContain('items-complete');
    expect(ids({ state: { itemsEarned: ['i-1'], itemsMissed: ['i-2'] } })).not.toContain('items-complete');
    expect(ids({ state: { itemsEarned: [], itemsMissed: [] } })).not.toContain('items-complete');
  });

  it('期限をすべて守ると deadline-all', () => {
    const done = { id: 'd1', dueAt: { day: 3, minutes: 540 }, warned: true, done: true, over: false };
    expect(ids({ state: { deadlines: [done] } })).toContain('deadline-all');
    expect(ids({ state: { deadlines: [{ ...done, done: false }] } })).not.toContain('deadline-all');
    expect(ids({ state: { deadlines: [{ ...done, over: true }] } })).not.toContain('deadline-all');
    expect(ids()).not.toContain('deadline-all');
  });

  it('記録3件で notes-3', () => {
    const notes = [1, 2, 3].map((n) => ({ id: `free-${n}`, text: 'メモ', at: { day: 0, minutes: 600 } }));
    expect(ids({ state: { notes } })).toContain('notes-3');
    expect(ids({ state: { notes: notes.slice(0, 2) } })).not.toContain('notes-3');
  });

  it('予想が3時間以内なら prediction-hit', () => {
    expect(ids({ state: { history: [REPORT], prologue: { comment: '', predictedHours: 12 } } }))
      .toContain('prediction-hit');
    expect(ids({ state: { history: [REPORT], prologue: { comment: '', predictedHours: 20 } } }))
      .not.toContain('prediction-hit');
    expect(ids({ state: { prologue: { comment: '', predictedHours: 12 } } }))
      .not.toContain('prediction-hit');
  });

  it('2日以上で long-haul、信頼70以上と被害20以下', () => {
    expect(ids({ state: { clock: { day: 2, minutes: 600 } } })).toContain('long-haul');
    expect(ids({ state: { clock: { day: 1, minutes: 600 } } })).not.toContain('long-haul');
    expect(ids({ state: { gauges: { damage: 20, flame: 30, trust: 70, stamina: 80 } } })).toContain('trust-70');
    expect(ids({ state: { gauges: { damage: 21, flame: 30, trust: 60, stamina: 80 } } })).not.toContain('damage-low');
  });

  it('獲得済みの id は返さない', () => {
    expect(ids({ earned: ['first-clear', 'no-fatal'] })).toEqual(['coward-zero', 'damage-low']);
  });
});

describe('積み重ねで決まる称号', () => {
  it('1シナリオを全4ロールでプレイすると all-roles', () => {
    const plays: PlaysStore = {
      'no01-nebula/executive': playRecord(1),
      'no01-nebula/officer': playRecord(1),
      'no01-nebula/lead': playRecord(1),
      'no01-nebula/analyst': playRecord(1),
    };
    expect(ids({ plays })).toContain('all-roles');
    delete plays['no01-nebula/analyst'];
    expect(ids({ plays })).not.toContain('all-roles');
  });

  it('公開中の全シナリオをプレイすると all-scenarios', () => {
    const plays: PlaysStore = { 'a/executive': playRecord(1), 'b/lead': playRecord(1) };
    expect(ids({ plays, scenarioIds: ['a', 'b'] })).toContain('all-scenarios');
    expect(ids({ plays, scenarioIds: ['a', 'b', 'c'] })).not.toContain('all-scenarios');
    expect(ids({ plays })).not.toContain('all-scenarios');
  });

  it('3シナリオで scenarios-3、通算回数で plays-10 と plays-20', () => {
    const plays: PlaysStore = { 'a/executive': playRecord(4), 'b/lead': playRecord(3), 'c/analyst': playRecord(3) };
    expect(ids({ plays })).toContain('scenarios-3');
    expect(ids({ plays })).toContain('plays-10');
    expect(ids({ plays })).not.toContain('plays-20');
    expect(ids({ plays: { 'a/executive': playRecord(2), 'b/lead': playRecord(2) } }))
      .not.toContain('scenarios-3');
  });

  it('全シナリオを全4ロールでプレイすると graduate（外野卒業）', () => {
    const roles = ['executive', 'officer', 'lead', 'analyst'] as const;
    const plays: PlaysStore = {};
    for (const role of roles) {
      plays[`a/${role}`] = playRecord(1);
      plays[`b/${role}`] = playRecord(1);
    }
    expect(ids({ plays, scenarioIds: ['a', 'b'] })).toContain('graduate');
    delete plays['b/analyst'];
    expect(ids({ plays, scenarioIds: ['a', 'b'] })).not.toContain('graduate');
    expect(ids({ plays })).not.toContain('graduate');
  });

  it('2シナリオでSを取ると rank-s-two', () => {
    const plays: PlaysStore = { 'a/executive': playRecord(2, 'S'), 'b/lead': playRecord(1, 'S') };
    expect(ids({ plays })).toContain('rank-s-two');
    expect(ids({ plays: { 'a/executive': playRecord(2, 'S'), 'b/lead': playRecord(1, 'A') } }))
      .not.toContain('rank-s-two');
  });

  it('playTotals は不正なキーと0回の記録を数えない', () => {
    const plays = {
      'a/executive': playRecord(2),
      'a/unknown-role': playRecord(5),
      broken: playRecord(3),
      'b/lead': playRecord(0),
      'c/lead': { count: Number.NaN, first: null, best: null },
    } as unknown as PlaysStore;
    const totals = playTotals(plays);
    expect(totals.totalPlays).toBe(2);
    expect([...totals.scenarios.keys()]).toEqual(['a']);
  });
});

describe('firstReportHours', () => {
  it('通知・公表の判断が無ければ null', () => {
    expect(firstReportHours(baseState(), fixture)).toBeNull();
  });

  it('壊れた記録は飛ばす', () => {
    const broken = { ...REPORT, at: { day: 'x' } } as unknown as PlayState['history'][number];
    expect(firstReportHours(baseState({ history: [broken] }), fixture)).toBeNull();
    const notArray = baseState({ history: undefined as unknown as PlayState['history'] });
    expect(() => firstReportHours(notArray, fixture)).not.toThrow();
  });
});

describe('representativeTitle', () => {
  const make = (id: string): Achievement => ({ id, title: { ja: id, en: id }, description: { ja: id, en: id } });

  it('空なら null', () => {
    expect(representativeTitle([])).toBeNull();
  });

  it('重みが大きいものを選ぶ', () => {
    const picked = representativeTitle([make('rank-s'), make('all-scenarios'), make('first-clear')]);
    expect(picked?.id).toBe('all-scenarios');
  });

  it('重みが同じなら先に来たものを選ぶ', () => {
    const picked = representativeTitle([make('rank-s'), make('hard-a')]);
    expect(picked?.id).toBe('rank-s');
  });

  it('知らない id でも落ちない', () => {
    const picked = representativeTitle([make('unknown'), make('first-clear')]);
    expect(picked?.id).toBe('first-clear');
  });
});
