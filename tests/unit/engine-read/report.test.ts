import { describe, it, expect } from 'vitest';
import { fixture } from '../../fixtures/scenario';
import { buildReport, allDetailItems } from '../../../src/engine/report';
import { computeResult } from '../../../src/engine/scoring';
import type { ChoiceRecord, DelayedEffect, PlayState } from '../../../src/engine/types';
import { makeState } from './helpers';

const record = (over: Partial<ChoiceRecord>): ChoiceRecord => ({
  pointId: 'p1',
  choiceId: 'isolate',
  at: { day: 0, minutes: 600 },
  policyPoints: 100,
  itemPoints: 5,
  voicesBefore: [],
  ...over,
});

const delayed = (over: Partial<DelayedEffect>): DelayedEffect => ({
  sourcePointId: 'p1',
  sourceChoiceId: 'wait',
  dueAtPhaseIndex: 2,
  points: -30,
  reason: { ja: '被害が拡大', en: 'damage spread' },
  applied: true,
  ...over,
});

describe('allDetailItems', () => {
  it('選択肢の細目と文案の細目をすべて集める', () => {
    const ids = allDetailItems(fixture.roles.executive).map((item) => item.id);
    expect(ids).toEqual(['i-iso-record', 't-24h', 't-late', 's-all', 's-current']);
  });
});

describe('buildReport', () => {
  const state: PlayState = makeState({
    rawScore: 125,
    history: [record({ voicesBefore: ['v-p1-mis', 'v-p1-ok', 'v-unknown'] })],
    itemsEarned: ['i-iso-record'],
    delayed: [delayed({}), delayed({ applied: false })],
  });

  it('結果とプレイ回数を入れる', () => {
    const report = buildReport(state, fixture);
    expect(report.playCount).toBe(1);
    expect(report.result).toEqual(computeResult(state, fixture));
  });

  it('判断ごとの点数と根拠を入れる', () => {
    const entry = buildReport(state, fixture).entries[0];
    expect(entry).toMatchObject({
      pointId: 'p1', choiceId: 'isolate', at: { day: 0, minutes: 600 },
      policyPoints: 100, itemPoints: 5, refs: ['ref-a'],
    });
  });

  it('あなたを動かした声を voicesBefore から作る', () => {
    const entry = buildReport(state, fixture).entries[0];
    expect(entry?.movedBy).toEqual([
      { voiceId: 'v-p1-mis', misleading: true, type: 'boss-pressure' },
      { voiceId: 'v-p1-ok', misleading: false, type: undefined },
    ]);
  });

  it('適用済みの遅れて来る効果だけを結び付ける', () => {
    const withWait = makeState({ history: [record({ choiceId: 'wait' })], delayed: [delayed({})] });
    expect(buildReport(withWait, fixture).entries[0]?.delayedHits).toEqual([
      { reason: { ja: '被害が拡大', en: 'damage spread' }, points: -30 },
    ]);
  });

  it('取れた細目と取りこぼした細目を出す', () => {
    const report = buildReport(state, fixture);
    expect(report.itemsEarned).toEqual([
      { id: 'i-iso-record', points: 5, axis: 'record', refs: ['ref-a'] },
    ]);
    // points > 0 かつ未取得だけ。マイナスの細目は出さない
    expect(report.itemsMissed).toEqual([
      { id: 't-24h', points: 10, axis: 'time', refs: ['ref-prelim'] },
      { id: 's-all', points: 10, axis: 'content', refs: ['ref-a'] },
    ]);
  });

  it('記者会見の回答を入れる', () => {
    const answered = makeState({
      press: { questionIds: ['q1'], index: 1, answers: [{ questionId: 'q1', answerId: 'a1', points: 30 }] },
    });
    expect(buildReport(answered, fixture).pressAnswers).toEqual([
      { questionId: 'q1', answerId: 'a1', points: 30 },
    ]);
    expect(buildReport(makeState(), fixture).pressAnswers).toEqual([]);
  });

  it('引数の状態を変更しない', () => {
    const before = structuredClone(state);
    buildReport(state, fixture);
    expect(state).toEqual(before);
  });
});
