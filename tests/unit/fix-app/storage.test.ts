import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../../src/engine/types';
import type {
  ChoiceRecord, PlayState, VoiceShown,
} from '../../../src/engine/types';

type StorageModule = typeof import('../../../src/storage/index.ts');

class FakeStorage implements Storage {
  readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

function validState(): PlayState {
  return {
    scenarioId: 'fixture', scenarioVersion: '1.0.0', role: 'executive', playCount: 1,
    clock: { day: 1, minutes: 600 }, phase: 'contain', pointId: 'p1',
    gauges: { damage: 20, flame: 30, trust: 70, stamina: 100 },
    cowardStreak: 0, rawScore: 100, fatal: false,
    history: [{
      pointId: 'p1', choiceId: 'isolate', at: { day: 1, minutes: 600 },
      policyPoints: 100, itemPoints: 5, voicesBefore: ['v1'],
    }],
    itemsEarned: ['i1'], itemsMissed: [],
    delayed: [{
      sourcePointId: 'p1', sourceChoiceId: 'isolate', dueAtPhaseIndex: 2,
      points: -30, gauges: { flame: 10 }, reason: { ja: '被害', en: 'damage' }, applied: false,
    }],
    voicesShown: [{ voiceId: 'v1', at: { day: 1, minutes: 600 }, pointId: 'p1' }],
    notes: [
      { id: 'n1', text: 'メモ', at: { day: 1, minutes: 600 } },
      { id: 'n2', text: { ja: '注意', en: 'warning' }, at: { day: 1, minutes: 600 } },
    ],
    deadlines: [{ id: 'd1', dueAt: { day: 2, minutes: 540 }, warned: false, done: false, over: false }],
    flags: { a: true },
    press: { questionIds: ['q1'], index: 0, answers: [{ questionId: 'q1', answerId: null, points: 0 }] },
    prologue: { comment: '', predictedHours: null },
    startedAt: '2026-11-08T00:00:00Z', pendingDraft: null, finished: false,
  };
}

let fake: FakeStorage;
let storage: StorageModule;

beforeEach(async () => {
  vi.resetModules();
  fake = new FakeStorage();
  vi.stubGlobal('localStorage', fake);
  storage = await import('../../../src/storage/index.ts');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadProgress の要素検証', () => {
  it('正しい進行中プレイは読み戻せる', () => {
    const state = validState();
    storage.saveProgress(state);
    expect(storage.loadProgress()).toEqual(state);
  });

  const broken: Array<[string, (s: PlayState) => void]> = [
    ['history の要素が空', (s) => { s.history = [{} as ChoiceRecord]; }],
    ['history の voicesBefore が無い', (s) => {
      delete (s.history[0] as Partial<ChoiceRecord>).voicesBefore;
    }],
    ['history の点数が文字列', (s) => {
      (s.history[0] as unknown as { policyPoints: unknown }).policyPoints = '100';
    }],
    ['history の at が無い', (s) => {
      delete (s.history[0] as Partial<ChoiceRecord>).at;
    }],
    ['voicesShown の at が無い', (s) => {
      delete (s.voicesShown[0] as Partial<VoiceShown>).at;
    }],
    ['notes の text が数値', (s) => {
      (s.notes[0] as unknown as { text: unknown }).text = 3;
    }],
    ['notes の text が片方の言語だけ', (s) => {
      (s.notes[0] as unknown as { text: unknown }).text = { ja: 'あ' };
    }],
    ['deadlines の warned が真偽値でない', (s) => {
      (s.deadlines[0] as unknown as { warned: unknown }).warned = 'yes';
    }],
    ['delayed の applied が真偽値でない', (s) => {
      (s.delayed[0] as unknown as { applied: unknown }).applied = 'no';
    }],
    ['delayed の gauges が数値でない', (s) => {
      (s.delayed[0] as unknown as { gauges: unknown }).gauges = { flame: 'x' };
    }],
    ['press の answers が配列でない', (s) => {
      (s.press as unknown as { answers: unknown }).answers = 'x';
    }],
    ['press の回答に questionId が無い', (s) => {
      (s.press as unknown as { answers: [unknown] }).answers = [{ points: 0 }];
    }],
    ['gauges が 100 を超える', (s) => { s.gauges.flame = 150; }],
    ['gauges が負', (s) => { s.gauges.trust = -1; }],
    ['flags の値が真偽値でない', (s) => {
      (s.flags as Record<string, unknown>).a = 'yes';
    }],
    ['itemsEarned に文字列以外', (s) => {
      (s.itemsEarned as unknown[]).push(1);
    }],
    ['playCount が整数でない', (s) => { s.playCount = 1.5; }],
    ['clock の day が負', (s) => { s.clock.day = -1; }],
    ['prologue の predictedHours が文字列', (s) => {
      (s.prologue as unknown as { predictedHours: unknown }).predictedHours = 'x';
    }],
  ];

  for (const [name, mutate] of broken) {
    it(`${name}なら null`, () => {
      const state = validState();
      mutate(state);
      fake.data.set(STORAGE_KEYS.progress, JSON.stringify(state));
      expect(storage.loadProgress()).toBeNull();
    });
  }

  it('時刻が Infinity なら null（例外にしない）', () => {
    const raw = JSON.stringify(validState()).replace('"minutes":600', '"minutes":1e999');
    fake.data.set(STORAGE_KEYS.progress, raw);
    expect(() => storage.loadProgress()).not.toThrow();
    expect(storage.loadProgress()).toBeNull();
  });

  it('JSON として壊れていても例外にしない', () => {
    fake.data.set(STORAGE_KEYS.progress, '{oops');
    expect(() => storage.loadProgress()).not.toThrow();
    expect(storage.loadProgress()).toBeNull();
  });
});

describe('loadPlays のプロトタイプ汚染対策', () => {
  it('__proto__ / constructor / prototype のキーは捨てる', () => {
    const record = '{"count":1,"first":null,"best":null}';
    fake.data.set(STORAGE_KEYS.plays, `{"__proto__":${record},"constructor":${record},"prototype":${record},"good":${record}}`);

    const plays = storage.loadPlays();
    expect(Object.keys(plays)).toEqual(['good']);
    expect(plays.constructor).toBe(Object);
    expect(Object.getPrototypeOf(plays)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).count).toBeUndefined();
    expect(storage.loadPlays()['good']?.count).toBe(1);
  });

  it('プロトタイプ汚染つきの保存でも回数は正しく数える', () => {
    fake.data.set(STORAGE_KEYS.plays, '{"__proto__":{"count":99,"first":null,"best":null}}');
    expect(storage.nextPlayCount('fixture', 'executive')).toBe(1);
    expect(storage.registerPlayStart('fixture', 'executive')).toBe(1);
  });

  it('壊れた記録は捨てて正しい記録だけ残す', () => {
    fake.data.set(STORAGE_KEYS.plays, '{"good":{"count":2,"first":null,"best":null},"bad":{"count":"x"}}');
    expect(storage.loadPlays()).toEqual({ good: { count: 2, first: null, best: null } });
  });
});

describe('notes の型', () => {
  it('文字列のメモと Localized のメモを両方読める', () => {
    const state = validState();
    storage.saveProgress(state);
    const loaded = storage.loadProgress();
    expect(loaded?.notes[0]?.text).toBe('メモ');
    expect(loaded?.notes[1]?.text).toEqual({ ja: '注意', en: 'warning' });
  });
});
