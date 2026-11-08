import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { render } from 'svelte/server';
import type { ChoiceRecord, PlayState } from '../../../src/engine/types';
import { initI18n, setLang } from '../../../src/i18n';
import { fixture } from '../../fixtures/scenario';
import { play, scenario, settings } from '../../../src/app/store';
import { DEFAULT_SETTINGS } from '../../../src/storage';
import S09Review from '../../../src/app/screens/S09Review.svelte';
import * as s09Module from '../../../src/app/screens/S09Review.svelte';

const s09 = s09Module as unknown as {
  publicationHours: (state: PlayState, scenario: typeof fixture) => number | null;
};

const localeSources = import.meta.glob<string>('/locales/ja/ui/*.yaml', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const noticeSources = import.meta.glob<string>('/locales/ja/notices.yaml', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[full] = child;
    else Object.assign(out, flatten(child, full));
  }
  return out;
}

const strings: Record<string, string> = {};
for (const source of Object.values(localeSources)) Object.assign(strings, flatten(parse(source)));
const notices = parse(Object.values(noticeSources)[0] ?? '') as Record<string, string>;
initI18n({
  ja: { strings, notices },
  en: { strings: {}, notices },
} as unknown as Parameters<typeof initI18n>[0]);
setLang('ja');

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
    rawScore: 125,
    fatal: false,
    history: [{
      pointId: 'p1', choiceId: 'isolate', at: { day: 0, minutes: 600 },
      policyPoints: 100, itemPoints: 5, voicesBefore: ['v-p1-mis'],
    }],
    itemsEarned: [],
    itemsMissed: [],
    delayed: [],
    voicesShown: [],
    notes: [],
    deadlines: [],
    flags: {},
    press: null,
    prologue: { comment: '対応が遅い', predictedHours: 48 },
    startedAt: '2026-11-08T00:00:00Z',
    pendingDraft: null,
    finished: true,
    ...over,
  };
}

beforeEach(() => {
  scenario.set(fixture);
  settings.set({ ...DEFAULT_SETTINGS });
});

describe('S09 振り返りの防御', () => {
  it('voicesBefore が無い history でも描画できる', () => {
    const withoutVoices = baseState().history[0] as Partial<ChoiceRecord>;
    delete withoutVoices.voicesBefore;
    play.set(baseState({ history: [withoutVoices as ChoiceRecord] }));

    expect(() => render(S09Review)).not.toThrow();
    const { body } = render(S09Review);
    expect(body).toContain('振り返り');
    expect(body).toContain('隔離');
  });

  it('history が配列でなくても描画できる', () => {
    play.set(baseState({ history: undefined as unknown as ChoiceRecord[] }));
    expect(() => render(S09Review)).not.toThrow();
    const { body } = render(S09Review);
    expect(body).toContain('振り返り');
  });

  it('history に null が混ざっても描画できる', () => {
    play.set(baseState({ history: [null as unknown as ChoiceRecord] }));
    expect(() => render(S09Review)).not.toThrow();
  });

  it('prologue が壊れていても描画できる', () => {
    play.set(baseState({ prologue: { comment: 3 } as unknown as PlayState['prologue'] }));
    expect(() => render(S09Review)).not.toThrow();
  });

  it('publicationHours は at の壊れた記録を飛ばす', () => {
    const broken = { ...baseState().history[0], at: { day: 'x' } } as unknown as ChoiceRecord;
    const state = baseState({ history: [broken] });
    expect(() => s09.publicationHours(state, fixture)).not.toThrow();
    expect(s09.publicationHours(state, fixture)).toBeNull();
  });

  it('publicationHours は history が配列でなくても落ちない', () => {
    const state = baseState({ history: undefined as unknown as ChoiceRecord[] });
    expect(s09.publicationHours(state, fixture)).toBeNull();
  });
});
