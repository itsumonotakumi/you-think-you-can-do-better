// ゴールデンテスト（オーケストレーター所有。編集禁止）。engine 担当はこれを通す。
import { describe, it, expect } from 'vitest';
import { startPlay, choose, submitDraft, startPress, answerPress, addNote, computeResult, multiplierFor, rankFor, currentPoint }
  from '../../../src/engine';
import { fixture, fixtureRefs } from '../../fixtures/scenario';
import type { StepResult } from '../../../src/engine/types';

const begin = (count = 1) =>
  startPlay(fixture, 'executive', count, { comment: '', predictedHours: null }, '2026-11-08T00:00:00Z', fixtureRefs);

function press(r: StepResult, answers: (string | null)[]): StepResult {
  expect(r.next).toBe('press');
  r = startPress(r.state, fixture);
  for (const a of answers) r = answerPress(r.state, fixture, a);
  expect(r.next).toBe('ending');
  return r;
}

describe('定数', () => {
  it('係数', () => {
    expect([1, 2, 3, 4, 9].map(multiplierFor)).toEqual([1.2, 1.0, 0.8, 0.6, 0.6]);
  });
  it('ランク', () => {
    expect(rankFor(1200, false)).toBe('S');
    expect(rankFor(1200, true)).toBe('A');
    expect(rankFor(600, false)).toBe('A');
    expect(rankFor(200, false)).toBe('B');
    expect(rankFor(0, false)).toBe('C');
    expect(rankFor(-1, false)).toBe('D');
  });
});

describe('ゴールデン走行', () => {
  it('A: 良い対応', () => {
    let r = begin();
    expect(r.next).toBe('point');
    expect(currentPoint(r.state, fixture)?.id).toBe('p1');
    const before = structuredClone(r.state);
    const r2 = choose(r.state, fixture, 'isolate');
    expect(r.state).toEqual(before); // 引数を変更しない
    r = r2;
    expect(r.state.rawScore).toBe(105);
    expect(r.state.clock).toEqual({ day: 0, minutes: 600 });
    r = choose(r.state, fixture, 'escalate');
    expect(r.state.rawScore).toBe(125);
    r = choose(r.state, fixture, 'publish');
    expect(r.state.gauges.flame).toBe(10); // 12:00 のイベントを通過
    expect(r.state.phase).toBe('notify');
    expect(r.next).toBe('draft');
    r = submitDraft(r.state, fixture, { scope: 's-all' });
    expect(r.state.rawScore).toBe(445);
    expect(currentPoint(r.state, fixture)?.id).toBe('p4');
    r = choose(r.state, fixture, 'resume-safe');
    expect(r.state.clock).toEqual({ day: 1, minutes: 0 });
    r = press(r, ['a1']);
    const res = computeResult(r.state, fixture);
    expect(res).toMatchObject({ raw: 505, multiplier: 1.2, official: 606, rank: 'A', sales: 110, fatal: false, playCount: 1 });
  });

  it('B: 致命的な失点（fatalAlternate・遅延・追加質問）', () => {
    let r = begin(2);
    r = choose(r.state, fixture, 'wipe');
    expect(r.state.fatal).toBe(true);
    r = choose(r.state, fixture, 'escalate');
    r = choose(r.state, fixture, 'publish');
    expect(r.state.rawScore).toBe(-225);
    r = submitDraft(r.state, fixture, { scope: 's-current' });
    expect(r.state.rawScore).toBe(-235);
    r = press(r, ['a3', 'ax1']);
    const res = computeResult(r.state, fixture);
    expect(res).toMatchObject({ raw: -335, official: -335, rank: 'D', sales: 100, fatal: true, playCount: 2 });
  });

  it('C: 臆病ゲージと期限切れ', () => {
    let r = begin(3);
    r = choose(r.state, fixture, 'wait');
    expect(r.state.cowardStreak).toBe(1);
    r = choose(r.state, fixture, 'hold');
    expect(r.state.cowardStreak).toBe(2);
    // -50 -30 -10(臆病2)、次の p3 でフェーズが detect→notify に変わり wait の遅延 -30 が適用
    expect(r.state.rawScore).toBe(-120);
    expect(r.cues.some((c) => c.kind === 'voice' && c.voiceId === 'v-c2')).toBe(true);
    r = choose(r.state, fixture, 'delay');
    expect(r.state.rawScore).toBe(-240); // -120 -100 -20(臆病3)
    r = press(r, [null, null]);
    const res = computeResult(r.state, fixture);
    // -50 -30 -10 -100 -20 -30(遅延) -50(期限未達) -30 -30(時間切れ×2)
    expect(res).toMatchObject({ raw: -350, rank: 'D', fatal: false, playCount: 3 });
  });

  it('記録があると requiresNote の回答が選べる', () => {
    let r = begin();
    r = choose(r.state, fixture, 'isolate');
    const st = addNote(r.state, { id: 'note-warning', text: { ja: '事前に警告', en: '' }, at: r.state.clock });
    expect(st.notes.map((n) => n.id)).toContain('note-warning');
  });

  it('決定性: 同じ選択なら同じ結果', () => {
    const run = () => {
      let r = begin();
      for (const c of ['isolate', 'escalate', 'publish']) r = choose(r.state, fixture, c);
      return submitDraft(r.state, fixture, { scope: 's-all' }).state;
    };
    expect(run()).toEqual(run());
  });

  it('演出キューに正誤情報を入れない', () => {
    const r = choose(begin().state, fixture, 'wipe');
    expect(JSON.stringify(r.cues)).not.toMatch(/misleading|correct|fatal|category|points/);
  });
});
