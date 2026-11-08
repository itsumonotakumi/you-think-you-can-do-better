// ゴールデンテストと同じ期待値を、engine-core 単体で確認する。
import { describe, it, expect } from 'vitest';
import { startPlay, currentPoint, addNote } from '../../../src/engine/state';
import { choose, submitDraft } from '../../../src/engine/choices';
import { finalizeBeforeEnding, updateDeadlines } from '../../../src/engine/deadlines';
import { fixture, fixtureRefs } from '../../fixtures/scenario';
import type { StepResult } from '../../../src/engine/types';

const begin = (count = 1): StepResult =>
  startPlay(fixture, 'executive', count, { comment: '', predictedHours: null }, '2026-11-08T00:00:00Z', fixtureRefs);

describe('startPlay', () => {
  it('初期状態と期限を作る', () => {
    const r = begin();
    expect(r.next).toBe('point');
    expect(r.state.clock).toEqual({ day: 0, minutes: 540 });
    expect(r.state.gauges).toEqual({ damage: 20, flame: 0, trust: 70, stamina: 100 });
    expect(currentPoint(r.state, fixture)?.id).toBe('p1');
    expect(r.state.deadlines).toEqual([
      { id: 'dl-prelim', dueAt: { day: 3, minutes: 540 }, warned: false, done: false, over: false },
    ]);
    expect(r.cues.some((c) => c.kind === 'voice' && c.voiceId === 'v-p1-mis')).toBe(true);
  });
});

describe('ゴールデン走行（A: 良い対応）', () => {
  it('点数・時計・フェーズ・次画面', () => {
    let r = begin();
    const before = structuredClone(r.state);
    const r2 = choose(r.state, fixture, 'isolate');
    expect(r.state).toEqual(before); // 引数を変更しない
    r = r2;
    expect(r.state.rawScore).toBe(105);
    expect(r.state.clock).toEqual({ day: 0, minutes: 600 });

    r = choose(r.state, fixture, 'escalate');
    expect(r.state.rawScore).toBe(125);
    expect(r.state.clock).toEqual({ day: 0, minutes: 1080 }); // p3 の at まで進む

    r = choose(r.state, fixture, 'publish');
    expect(r.state.gauges.flame).toBe(10); // 12:00 のイベントを通過
    expect(r.state.phase).toBe('notify');
    expect(r.next).toBe('draft');

    r = submitDraft(r.state, fixture, { scope: 's-all' });
    expect(r.state.rawScore).toBe(445);
    expect(currentPoint(r.state, fixture)?.id).toBe('p4');
    expect(r.state.phase).toBe('recover');

    r = choose(r.state, fixture, 'resume-safe');
    expect(r.state.clock).toEqual({ day: 1, minutes: 0 });
    expect(r.next).toBe('press');

    const fin = finalizeBeforeEnding(r.state, fixture);
    expect(fin.rawScore).toBe(475);
    expect(fin.deadlines[0]?.done).toBe(true);
    expect(fin.deadlines[0]?.over).toBe(false);
  });
});

describe('ゴールデン走行（B: fatalAlternate と遅延）', () => {
  it('致命的な失点・代替点・未適用の遅延', () => {
    let r = begin(2);
    r = choose(r.state, fixture, 'wipe');
    expect(r.state.fatal).toBe(true);
    r = choose(r.state, fixture, 'escalate');
    r = choose(r.state, fixture, 'publish');
    expect(r.state.rawScore).toBe(-225); // -250 +20 +5(fatalAlternate)

    r = submitDraft(r.state, fixture, { scope: 's-current' });
    expect(r.state.rawScore).toBe(-235); // +10(auto) -20
    expect(r.next).toBe('press');

    const fin = finalizeBeforeEnding(r.state, fixture);
    expect(fin.rawScore).toBe(-255); // 未適用の遅延 -20
    expect(fin.deadlines[0]?.done).toBe(true);
  });
});

describe('ゴールデン走行（C: 臆病ゲージと期限切れ）', () => {
  it('連続した保留・遅延の適用・期限未達', () => {
    let r = begin(3);
    r = choose(r.state, fixture, 'wait');
    expect(r.state.cowardStreak).toBe(1);

    r = choose(r.state, fixture, 'hold');
    expect(r.state.cowardStreak).toBe(2);
    expect(r.state.rawScore).toBe(-120); // -50 -30 -10、遅延 -30
    expect(r.cues.some((c) => c.kind === 'voice' && c.voiceId === 'v-c2')).toBe(true);

    const delayed = r.state.delayed.find((d) => d.sourceChoiceId === 'wait');
    expect(delayed?.applied).toBe(true);

    r = choose(r.state, fixture, 'delay');
    expect(r.state.rawScore).toBe(-240);
    expect(r.next).toBe('press');

    const fin = finalizeBeforeEnding(r.state, fixture);
    expect(fin.rawScore).toBe(-290); // 期限未達 -50
    expect(fin.deadlines[0]?.over).toBe(true);
  });
});

describe('演出キュー', () => {
  it('正誤情報を入れない', () => {
    const r = choose(begin().state, fixture, 'wipe');
    expect(JSON.stringify(r.cues)).not.toMatch(/misleading|correct|fatal|category|points/);
  });

  it('時計・早送り・声の効果音', () => {
    const r = choose(begin().state, fixture, 'wipe');
    expect(r.cues.some((c) => c.kind === 'clock')).toBe(true);
    expect(r.cues.some((c) => c.kind === 'fx' && c.id === 'fastforward')).toBe(true); // 180分

    const v = choose(begin().state, fixture, 'wait');
    expect(v.cues.some((c) => c.kind === 'voice' && c.voiceId === 'v-c2')).toBe(false);
  });
});

describe('時計とゲージ', () => {
  it('時刻イベントを通過時に一度だけ発火する', () => {
    let r = begin();
    r = choose(r.state, fixture, 'wait'); // 11:00
    expect(r.state.clock).toEqual({ day: 0, minutes: 660 });
    expect(r.state.gauges.flame).toBe(0);
    r = choose(r.state, fixture, 'hold'); // 12:00 でイベント、その後 p3 の at まで進む
    expect(r.state.clock).toEqual({ day: 0, minutes: 1080 });
    expect(r.state.gauges.flame).toBe(30); // +20(選択) +10(イベント)
    expect(r.state.flags['ev:ev-news']).toBe(true);
  });

  it('深夜帯は体力の減少が1.5倍', () => {
    const s = begin().state;
    s.clock = { day: 0, minutes: 1380 }; // 23:00
    const r = choose(s, fixture, 'isolate');
    expect(r.state.gauges.stamina).toBe(85); // -10 → -15
    expect(r.state.clock).toEqual({ day: 1, minutes: 0 });
  });

  it('期限の警告と超過は一度だけ', () => {
    const s = begin().state;
    const cues: Parameters<typeof updateDeadlines>[2] = [];
    s.clock = { day: 3, minutes: 400 };
    updateDeadlines(s, fixture, cues);
    expect(s.deadlines[0]?.warned).toBe(true);
    expect(cues?.some((c) => c.kind === 'se' && c.id === 'deadline_warn')).toBe(true);

    s.clock = { day: 3, minutes: 600 };
    updateDeadlines(s, fixture, cues);
    expect(s.deadlines[0]?.over).toBe(true);
    expect(s.rawScore).toBe(-50);
    updateDeadlines(s, fixture, cues);
    expect(s.rawScore).toBe(-50);
  });
});

describe('文案作成', () => {
  it('自動の時刻と選択した部品を記録する', () => {
    let r = begin();
    r = choose(r.state, fixture, 'isolate');
    r = choose(r.state, fixture, 'escalate');
    r = choose(r.state, fixture, 'publish');
    r = submitDraft(r.state, fixture, { scope: 's-all' });
    expect(r.state.itemsEarned).toContain('t-24h');
    expect(r.state.itemsEarned).toContain('s-all');
    expect(r.state.itemsMissed).toContain('t-late');
    expect(r.state.itemsMissed).toContain('s-current');
    expect(r.state.pendingDraft).toBeNull();
  });
});

describe('その他', () => {
  it('記録を追加できる', () => {
    const r = begin();
    const st = addNote(r.state, { id: 'note-warning', text: { ja: '事前に警告', en: '' }, at: r.state.clock });
    expect(st.notes.map((n) => n.id)).toContain('note-warning');
    expect(r.state.notes).toHaveLength(0);
  });

  it('同じ選択なら同じ結果', () => {
    const run = () => {
      let r = begin();
      for (const c of ['isolate', 'escalate', 'publish']) r = choose(r.state, fixture, c);
      return submitDraft(r.state, fixture, { scope: 's-all' }).state;
    };
    expect(run()).toEqual(run());
  });
});
