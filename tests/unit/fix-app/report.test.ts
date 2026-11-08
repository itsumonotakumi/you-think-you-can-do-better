import { describe, expect, it } from 'vitest';
import { buildReport } from '../../../src/engine/report';
import { fixture } from '../../fixtures/scenario';
import type { ChoiceRecord, PlayState } from '../../../src/engine/types';

function makeState(over: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: 'fixture',
    scenarioVersion: '1.0.0',
    role: 'executive',
    playCount: 1,
    clock: { day: 0, minutes: 600 },
    phase: 'detect',
    pointId: 'p1',
    gauges: { damage: 20, flame: 0, trust: 70, stamina: 100 },
    cowardStreak: 0,
    rawScore: 125,
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

const record = (over: Partial<ChoiceRecord> = {}): ChoiceRecord => ({
  pointId: 'p1',
  choiceId: 'isolate',
  at: { day: 0, minutes: 600 },
  policyPoints: 100,
  itemPoints: 5,
  voicesBefore: ['v-p1-mis'],
  ...over,
});

describe('buildReport の防御（壊れた history）', () => {
  it('voicesBefore が無い記録でも落ちない', () => {
    const withoutVoices = record() as Partial<ChoiceRecord>;
    delete withoutVoices.voicesBefore;
    const state = makeState({ history: [withoutVoices as ChoiceRecord] });

    const report = buildReport(state, fixture);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]?.movedBy).toEqual([]);
    expect(report.entries[0]?.choiceId).toBe('isolate');
  });

  it('voicesBefore が配列でなくても落ちない', () => {
    const broken = { ...record(), voicesBefore: 'v-p1-mis' } as unknown as ChoiceRecord;
    const report = buildReport(makeState({ history: [broken] }), fixture);
    expect(report.entries[0]?.movedBy).toEqual([]);
  });

  it('history が配列でなくても落ちない', () => {
    const state = makeState({ history: undefined as unknown as ChoiceRecord[] });
    expect(buildReport(state, fixture).entries).toEqual([]);
  });

  it('history に null が混ざっても落ちない', () => {
    const state = makeState({ history: [null as unknown as ChoiceRecord] });
    const report = buildReport(state, fixture);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]?.pointId).toBe('');
  });

  it('at が壊れていても時計で補う', () => {
    const broken = { ...record(), at: { day: 'x' } } as unknown as ChoiceRecord;
    const state = makeState({ history: [broken] });
    expect(buildReport(state, fixture).entries[0]?.at).toEqual(state.clock);
  });

  it('点数が数値でなくても 0 として扱う', () => {
    const broken = { ...record(), policyPoints: '100' } as unknown as ChoiceRecord;
    expect(buildReport(makeState({ history: [broken] }), fixture).entries[0]?.policyPoints).toBe(0);
  });
});

describe('buildReport の防御（その他の配列）', () => {
  it('delayed が無くても落ちない', () => {
    const state = makeState({
      history: [record()],
      delayed: undefined as unknown as PlayState['delayed'],
    });
    expect(buildReport(state, fixture).entries[0]?.delayedHits).toEqual([]);
  });

  it('delayed の reason が壊れていても落ちない', () => {
    const state = makeState({
      history: [record()],
      delayed: [{
        sourcePointId: 'p1', sourceChoiceId: 'isolate', dueAtPhaseIndex: 1,
        points: -30, reason: undefined as never, applied: true,
      }],
    });
    expect(buildReport(state, fixture).entries[0]?.delayedHits).toEqual([
      { reason: { ja: '', en: '' }, points: -30 },
    ]);
  });

  it('itemsEarned に文字列以外が混ざっても落ちない', () => {
    const state = makeState({ itemsEarned: [1 as unknown as string, 'i-iso-record'] });
    expect(buildReport(state, fixture).itemsEarned.map((item) => item.id)).toEqual(['i-iso-record']);
  });

  it('press の answers が壊れていても落ちない', () => {
    const state = makeState({ press: { answers: 'x' } as unknown as PlayState['press'] });
    expect(buildReport(state, fixture).pressAnswers).toEqual([]);
  });

  it('press の回答に questionId が無いものは捨てる', () => {
    const state = makeState({
      press: { questionIds: ['q1'], index: 0, answers: [{ points: 10 } as never] },
    });
    expect(buildReport(state, fixture).pressAnswers).toEqual([]);
  });
});
