import { describe, it, expect } from 'vitest';
import { fixture } from '../../fixtures/scenario';
import {
  availableAnswers, answerPress, currentQuestion, pressQuestions, startPress, DEFAULT_TIMEOUT_POINTS,
} from '../../../src/engine/press';
import type { Scenario } from '../../../src/engine/types';
import { makeState } from './helpers';

const note = { id: 'note-warning', text: { ja: '事前に警告', en: 'warning' }, at: { day: 0, minutes: 600 } };

describe('pressQuestions', () => {
  it('条件を満たす追加質問だけを足す', () => {
    const ids = (flags: Record<string, boolean>) =>
      pressQuestions(makeState({ flags }), fixture).map((question) => question.id);
    expect(ids({})).toEqual(['q1', 'qx']); // 未設定の旗は false
    expect(ids({ contained: false })).toEqual(['q1', 'qx']);
    expect(ids({ contained: true })).toEqual(['q1']);
  });

  it('記者会見が無ければ空', () => {
    const scenario: Scenario = { ...fixture, press: undefined };
    expect(pressQuestions(makeState(), scenario)).toEqual([]);
  });
});

describe('startPress', () => {
  it('質問を並べて会見を始める', () => {
    const state = makeState();
    const result = startPress(state, fixture);
    expect(result.next).toBe('press');
    expect(result.state.press).toEqual({ questionIds: ['q1', 'qx'], index: 0, answers: [] });
    expect(currentQuestion(result.state, fixture)?.id).toBe('q1');
    expect(result.cues).toContainEqual({ kind: 'se', id: 'shutter' });
    expect(result.cues).toContainEqual({ kind: 'fx', id: 'flash' });
  });

  it('引数の状態を変更しない', () => {
    const state = makeState();
    const before = structuredClone(state);
    startPress(state, fixture);
    expect(state).toEqual(before);
  });

  it('質問が無ければエンディングへ', () => {
    const scenario: Scenario = { ...fixture, press: undefined };
    const result = startPress(makeState(), scenario);
    expect(result.next).toBe('ending');
    expect(result.state.finished).toBe(true);
  });
});

describe('availableAnswers', () => {
  it('記録が無ければ requiresNote の回答を除く', () => {
    const state = startPress(makeState(), fixture).state;
    expect(availableAnswers(state, fixture).map((answer) => answer.id)).toEqual(['a1', 'a3']);
  });

  it('記録があれば requiresNote の回答を出せる', () => {
    const state = startPress(makeState({ notes: [note] }), fixture).state;
    expect(availableAnswers(state, fixture).map((answer) => answer.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('会見中でなければ空', () => {
    expect(availableAnswers(makeState(), fixture)).toEqual([]);
  });
});

describe('answerPress', () => {
  it('1問進めて次の質問を出す', () => {
    const started = startPress(makeState(), fixture).state;
    const result = answerPress(started, fixture, 'a1');
    expect(result.next).toBe('press');
    expect(result.state.press?.index).toBe(1);
    expect(result.state.press?.answers).toEqual([{ questionId: 'q1', answerId: 'a1', points: 30 }]);
    expect(currentQuestion(result.state, fixture)?.id).toBe('qx');
    expect(result.cues).toContainEqual({ kind: 'se', id: 'shutter' });
    expect(result.cues).toContainEqual({ kind: 'fx', id: 'flash' });
  });

  it('最後の問の後にエンディングへ進む', () => {
    let state = startPress(makeState({ flags: { contained: false } }), fixture).state;
    state = answerPress(state, fixture, 'a3').state;
    const result = answerPress(state, fixture, 'ax1');
    expect(result.next).toBe('ending');
    expect(result.state.finished).toBe(true);
    expect(result.state.press?.answers).toEqual([
      { questionId: 'q1', answerId: 'a3', points: -100 },
      { questionId: 'qx', answerId: 'ax1', points: 20 },
    ]);
  });

  it('時間切れは既定 −30 点', () => {
    const started = startPress(makeState({ flags: { contained: true } }), fixture).state;
    const result = answerPress(started, fixture, null);
    expect(result.next).toBe('ending');
    expect(result.state.press?.answers).toEqual([
      { questionId: 'q1', answerId: null, points: DEFAULT_TIMEOUT_POINTS },
    ]);
    expect(DEFAULT_TIMEOUT_POINTS).toBe(-30);
  });

  it('質問ごとの timeoutPoints を使う', () => {
    const scenario: Scenario = structuredClone(fixture);
    const question = scenario.press?.questions[0];
    if (!question) throw new Error('質問が無い');
    question.timeoutPoints = -55;
    const started = startPress(makeState({ flags: { contained: true } }), scenario).state;
    const result = answerPress(started, scenario, null);
    expect(result.state.press?.answers[0]?.points).toBe(-55);
  });

  it('記録が無い回答は時間切れとして扱う', () => {
    const started = startPress(makeState({ flags: { contained: true } }), fixture).state;
    const result = answerPress(started, fixture, 'a2');
    expect(result.state.press?.answers).toEqual([
      { questionId: 'q1', answerId: null, points: DEFAULT_TIMEOUT_POINTS },
    ]);
  });

  it('回答の点数を素点に足す', () => {
    const started = startPress(makeState({ flags: { contained: true }, rawScore: 100 }), fixture).state;
    expect(started.rawScore).toBe(100); // 会見開始では採点しない
    const result = answerPress(started, fixture, 'a1');
    expect(result.state.rawScore).toBeGreaterThanOrEqual(130);
  });

  it('会見中でなければエンディングを返すだけ', () => {
    const result = answerPress(makeState(), fixture, 'a1');
    expect(result.next).toBe('ending');
    expect(result.state.press).toBeNull();
  });
});
