import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { render } from 'svelte/server';
import type { NoticeId, PlayState } from '../../../src/engine/types';
import { initI18n, setLang } from '../../../src/i18n';
import { fixture } from '../../fixtures/scenario';
import { play, scenario, settings } from '../../../src/app/store';
import { DEFAULT_SETTINGS } from '../../../src/storage';
import S07Press from '../../../src/app/screens/S07Press.svelte';
import S08Ending from '../../../src/app/screens/S08Ending.svelte';
import S09Review from '../../../src/app/screens/S09Review.svelte';

const localeSources = import.meta.glob<string>('/locales/ja/ui/screens-c.yaml', {
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

const strings = flatten(parse(Object.values(localeSources)[0] ?? ''));
const notices = parse(Object.values(noticeSources)[0] ?? '') as Record<NoticeId, string>;
initI18n({
  ja: { strings, notices },
  en: { strings: {}, notices } as { strings: Record<string, string>; notices: Record<NoticeId, string> },
});
setLang('ja');

function baseState(patch: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 2,
    clock: { day: 3, minutes: 600 },
    phase: 'after',
    pointId: null,
    gauges: { damage: 30, flame: 40, trust: 60, stamina: 70 },
    cowardStreak: 0,
    rawScore: 700,
    fatal: false,
    history: [
      {
        pointId: 'p1', choiceId: 'isolate', at: { day: 0, minutes: 540 },
        policyPoints: 100, itemPoints: 5, voicesBefore: ['v-p1-mis', 'v-p1-ok'],
      },
    ],
    itemsEarned: ['i-iso-record'],
    itemsMissed: [],
    delayed: [
      {
        sourcePointId: 'p1', sourceChoiceId: 'isolate', dueAtPhaseIndex: 1,
        points: -30, reason: { ja: '被害が拡大', en: 'Damage spread' }, applied: true,
      },
    ],
    voicesShown: [],
    notes: [{ id: 'note-warning', text: { ja: '事前に警告があった', en: 'A warning came' }, at: { day: 0, minutes: 540 } }],
    deadlines: [],
    flags: {},
    press: { questionIds: ['q1'], index: 0, answers: [] },
    prologue: { comment: '対応が遅い', predictedHours: 48 },
    startedAt: '2026-11-08T00:00:00Z',
    pendingDraft: null,
    finished: true,
    ...patch,
  };
}

describe('画面のスモーク（SSR）', () => {
  it('S07 が質問と回答を出す', () => {
    scenario.set(fixture);
    settings.set({ ...DEFAULT_SETTINGS });
    play.set(baseState());
    const { body } = render(S07Press);
    expect(body).toContain('記者会見');
    expect(body).toContain('事前に指摘は');
    expect(body).toContain('調査中');
  });

  it('S08 がランクと売上見通しを出す', () => {
    scenario.set(fixture);
    settings.set({ ...DEFAULT_SETTINGS });
    play.set(baseState());
    const { body } = render(S08Ending);
    expect(body).toContain('エンディング');
    expect(body).toContain('架空');
    expect(body).toContain('対応が遅い');
  });

  it('S09 が判断を出し、最高点の時は誘導の声と細目を出さない', () => {
    scenario.set(fixture);
    settings.set({ ...DEFAULT_SETTINGS });
    play.set(baseState());
    const { body } = render(S09Review);
    expect(body).toContain('振り返り');
    expect(body).toContain('隔離');
    expect(body).not.toContain('i-iso-record'); // 細目は ?debug=1 の時だけ
    expect(body).not.toContain('黙っておけ'); // 最高点を選んだので誘導の声は出さない
  });
});
