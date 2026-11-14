// 再読み込み時の復元（store）の検証。シナリオ読み込みは差し替える。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayState, Scenario } from '../../../src/engine/types';

type StoreModule = typeof import('../../../src/app/store.ts');
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

function makeScenario(id = 'fixture'): Scenario {
  return {
    id, version: '1.0.0', status: 'latest', published: '2026-11-01',
    sourcePeriod: { ja: '', en: '' }, difficulty: 3, languages: ['ja'],
    referencesVersion: '1', legalPack: 'jp',
    title: { ja: '題', en: '' }, tagline: { ja: '', en: '' },
    company: { name: { ja: '', en: '' }, industry: { ja: '', en: '' }, size: { ja: '', en: '' }, people: [] },
    start: { day: 0, minutes: 540 },
    initialGauges: { damage: 20, flame: 0, trust: 70, stamina: 100 },
    audio: { bgmDefault: 'calm' },
    roles: {}, endings: {} as Scenario['endings'],
    salesModel: { base: 100, trustWeight: 1, fatalPenalty: 100, min: 0, max: 100 },
  } as unknown as Scenario;
}

function state(patch: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: 'fixture', scenarioVersion: '1.0.0', role: 'executive', playCount: 1,
    clock: { day: 0, minutes: 540 }, phase: 'detect', pointId: 'p1',
    gauges: { damage: 20, flame: 0, trust: 70, stamina: 100 },
    cowardStreak: 0, rawScore: 0, fatal: false,
    history: [], itemsEarned: [], itemsMissed: [], delayed: [], voicesShown: [],
    notes: [], deadlines: [], flags: {}, press: null,
    prologue: { comment: '', predictedHours: null },
    startedAt: '2026-11-08T00:00:00Z', pendingDraft: null, finished: false,
    ...patch,
  };
}

let fake: FakeStorage;
let storage: StorageModule;
let store: StoreModule;
let loadScenario: ReturnType<typeof vi.fn>;

async function boot(throws = false): Promise<void> {
  vi.resetModules();
  fake = new FakeStorage();
  vi.stubGlobal('localStorage', fake);
  vi.stubGlobal('window', {});
  loadScenario = vi.fn(async () => {
    if (throws) throw new Error('not found');
    return makeScenario();
  });
  vi.doMock('../../../src/data/loader', () => ({
    loadScenario,
    loadAudioManifest: async () => [],
  }));
  storage = await import('../../../src/storage/index.ts');
  store = await import('../../../src/app/store.ts');
}

beforeEach(async () => {
  await boot();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../../../src/data/loader');
  vi.resetModules();
});

function screenOf(mod: StoreModule): string {
  let value = '';
  const unsubscribe = mod.screen.subscribe((s) => { value = s; });
  unsubscribe();
  return value;
}

describe('restoreSession', () => {
  it('進行中のプレイは同じ画面（本編）へ戻す', async () => {
    const saved = state();
    storage.saveProgress(saved);
    storage.saveResume({
      screen: 'S05', scenarioId: saved.scenarioId, backTo: 'S01', playRef: null, overlay: null,
    });

    await store.restoreSession();

    expect(screenOf(store)).toBe('S05');
    expect(loadScenario).toHaveBeenCalledWith('fixture');
    let play: PlayState | null = null;
    store.play.subscribe((s) => { play = s; })();
    expect(play).toEqual(saved);
  });

  it('文案待ち・会見中は状態に合った画面へ戻す', async () => {
    const saved = state({ pendingDraft: 'press-release' });
    storage.saveProgress(saved);
    storage.saveResume({
      screen: 'S06', scenarioId: saved.scenarioId, backTo: 'S01', playRef: null, overlay: null,
    });

    await store.restoreSession();
    expect(screenOf(store)).toBe('S06');
  });

  it('終えている進行中データがあればタイトルへ戻す', async () => {
    storage.saveProgress(state({ finished: true }));
    storage.saveResume({
      screen: 'S05', scenarioId: 'fixture', backTo: 'S01', playRef: null, overlay: null,
    });

    await store.restoreSession();
    expect(screenOf(store)).toBe('S01');
    expect(storage.loadProgress()).toBeNull();
  });

  it('シナリオが読めなければタイトルへ戻す', async () => {
    await boot(true);
    storage.saveProgress(state());
    storage.saveResume({
      screen: 'S05', scenarioId: 'fixture', backTo: 'S01', playRef: null, overlay: null,
    });

    await store.restoreSession();
    expect(screenOf(store)).toBe('S01');
  });

  it('結果画面は最後に終えたプレイから戻す', async () => {
    const finished = state({ finished: true, pointId: null, rawScore: 420 });
    storage.saveLastPlay(finished);
    storage.saveResume({
      screen: 'S09', scenarioId: finished.scenarioId, backTo: 'S01',
      playRef: finished.startedAt, overlay: null,
    });

    await store.restoreSession();

    expect(screenOf(store)).toBe('S09');
    let play: PlayState | null = null;
    store.play.subscribe((s) => { play = s; })();
    expect(play).toEqual(finished);
  });

  it('最後のプレイと startedAt が合わなければタイトルへ戻す', async () => {
    storage.saveLastPlay(state({ finished: true }));
    storage.saveResume({
      screen: 'S08', scenarioId: 'fixture', backTo: 'S01',
      playRef: 'other-play', overlay: null,
    });

    await store.restoreSession();
    expect(screenOf(store)).toBe('S01');
  });

  it('ランキング画面はプレイが無くても開ける', async () => {
    storage.saveResume({
      screen: 'S12', scenarioId: null, backTo: 'S01', playRef: null, overlay: null,
    });

    await store.restoreSession();
    expect(screenOf(store)).toBe('S12');
  });

  it('ロール選択は選んだシナリオを復元する', async () => {
    storage.saveResume({
      screen: 'S04', scenarioId: 'fixture', backTo: 'S01', playRef: null, overlay: null,
    });

    await store.restoreSession();

    expect(screenOf(store)).toBe('S04');
    let id: string | null = null;
    store.selectedScenarioId.subscribe((s) => { id = s; })();
    expect(id).toBe('fixture');
  });

  it('設定・クレジットは戻り先も復元する', async () => {
    storage.saveResume({
      screen: 'S10', scenarioId: null, backTo: 'S03', playRef: null, overlay: null,
    });

    await store.restoreSession();

    expect(screenOf(store)).toBe('S10');
    let back = '';
    store.backTo.subscribe((s) => { back = s; })();
    expect(back).toBe('S03');
  });

  it('タイトルで開いていた称号画面も戻す', async () => {
    storage.saveResume({
      screen: 'S01', scenarioId: null, backTo: 'S01', playRef: null, overlay: 'achievements',
    });

    await store.restoreSession();

    expect(screenOf(store)).toBe('S01');
    let overlay: string | null = null;
    store.titleOverlay.subscribe((s) => { overlay = s; })();
    expect(overlay).toBe('achievements');
  });
});

describe('画面の保存', () => {
  it('画面を移ると保存し、再読み込みで同じ画面に戻る', () => {
    store.screen.set('S03');
    expect(storage.loadResume()).toEqual({
      screen: 'S03', scenarioId: null, backTo: 'S01', playRef: null, overlay: null,
    });
  });

  it('終えたプレイの結果画面では、プレイの startedAt を残す', () => {
    const finished = state({ finished: true });
    store.play.set(finished);
    store.screen.set('S09');
    expect(storage.loadResume()?.playRef).toBe(finished.startedAt);
  });

  it('途中のプレイの画面ではプレイの startedAt は残さない', () => {
    store.play.set(state());
    store.screen.set('S05');
    expect(storage.loadResume()?.playRef).toBeNull();
  });
});
