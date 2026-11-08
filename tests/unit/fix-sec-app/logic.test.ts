// 再開時の版の確認と、危険キーを含む参照の防御
import { describe, expect, it } from 'vitest';
import type { PlayState, RoleId, Scenario } from '../../../src/engine/types';
import { fixture } from '../../fixtures/scenario';
import {
  deadlineViews, draftFor, versionChanged, voiceViews,
} from '../../../src/app/parts/logic';

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

describe('versionChanged', () => {
  it('同じ版なら false', () => {
    expect(versionChanged(state(), fixture)).toBe(false);
  });

  it('版が違えば true', () => {
    expect(versionChanged(state({ scenarioVersion: '0.9.0' }), fixture)).toBe(true);
  });
});

describe('draftFor', () => {
  it('正しいキーなら文案を引ける', () => {
    expect(draftFor(state({ pendingDraft: 'draft1' }), fixture)?.title.ja).toBe('第1報の文案');
  });

  it('未定義のキーなら null', () => {
    expect(draftFor(state({ pendingDraft: 'missing' }), fixture)).toBeNull();
  });

  for (const key of ['constructor', 'prototype', '__proto__']) {
    it(`危険キー ${key} でも例外にせず null`, () => {
      expect(() => draftFor(state({ pendingDraft: key }), fixture)).not.toThrow();
      expect(draftFor(state({ pendingDraft: key }), fixture)).toBeNull();
    });
  }

  it('危険なロール名でも例外にせず null', () => {
    const s = state({ role: 'constructor' as unknown as RoleId, pendingDraft: 'draft1' });
    expect(() => draftFor(s, fixture)).not.toThrow();
    expect(draftFor(s, fixture)).toBeNull();
  });
});

describe('危険なロール名の参照', () => {
  it('voiceViews は空配列を返す', () => {
    const s = state({ role: 'toString' as unknown as RoleId });
    expect(voiceViews(s, fixture)).toEqual([]);
  });

  it('deadlineViews は空配列を返す', () => {
    const s = state({ role: 'hasOwnProperty' as unknown as RoleId });
    expect(deadlineViews(s, fixture)).toEqual([]);
  });

  it('roles を持たないシナリオでも落ちない', () => {
    const empty = { ...fixture, roles: {} } as Scenario;
    expect(draftFor(state({ pendingDraft: 'draft1' }), empty)).toBeNull();
    expect(voiceViews(state(), empty)).toEqual([]);
    expect(deadlineViews(state(), empty)).toEqual([]);
  });
});
