// 「続きから」の再開先と BGM・版の比較。
import { describe, expect, it } from 'vitest';
import type { PlayState, PressState, Scenario } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import * as s01Module from '../../../src/app/screens/S01Title.svelte';

// tsc は .svelte の module script の export を型として読めないため、形を明示して受け取る
const s01 = s01Module as unknown as {
  resumeScreen: (state: PlayState) => string;
  resumeBgm: (state: PlayState, scenario: Scenario) => string;
  versionChanged: (saved: PlayState, scenario: Scenario) => boolean;
};

const pressState: PressState = { questionIds: ['q1'], index: 0, answers: [] };

function state(patch: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 1,
    clock: { day: 0, minutes: 540 },
    phase: 'detect',
    pointId: 'p1',
    gauges: { damage: 20, flame: 0, trust: 70, stamina: 100 },
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
    finished: false,
    ...patch,
  };
}

describe('再開先', () => {
  it('通常の進行中は本編', () => {
    expect(s01.resumeScreen(state())).toBe('S05');
  });

  it('文案作成待ちは文案画面', () => {
    expect(s01.resumeScreen(state({ pendingDraft: 'draft1' }))).toBe('S06');
  });

  it('会見中は会見画面', () => {
    expect(s01.resumeScreen(state({ press: pressState }))).toBe('S07');
  });

  it('終了済みはエンディング画面', () => {
    expect(s01.resumeScreen(state({ finished: true }))).toBe('S08');
  });

  it('終了が最優先で、会見や文案が残っていてもエンディング', () => {
    expect(s01.resumeScreen(state({ finished: true, press: pressState, pendingDraft: 'draft1' }))).toBe('S08');
  });

  it('会見は文案より優先する', () => {
    expect(s01.resumeScreen(state({ press: pressState, pendingDraft: 'draft1' }))).toBe('S07');
  });
});

describe('再開時の BGM', () => {
  it('会見中は press', () => {
    expect(s01.resumeBgm(state({ press: pressState }), fixture)).toBe('press');
  });

  it('フェーズに曲があればその曲', () => {
    expect(s01.resumeBgm(state({ phase: 'notify' }), fixture)).toBe('tension_mid');
  });

  it('フェーズに曲が無ければ既定曲', () => {
    expect(s01.resumeBgm(state({ phase: 'detect' }), fixture)).toBe('tension_low');
  });
});

describe('シナリオの版', () => {
  it('同じ版なら再開できる', () => {
    expect(s01.versionChanged(state(), fixture)).toBe(false);
  });

  it('版が違えば再開しない', () => {
    expect(s01.versionChanged(state({ scenarioVersion: '0.9.0' }), fixture)).toBe(true);
  });
});
