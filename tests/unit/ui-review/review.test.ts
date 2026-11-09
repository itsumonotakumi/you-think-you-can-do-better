import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { render } from 'svelte/server';
import type { ChoiceRecord, PlayState, Scenario } from '../../../src/engine/types';
import { initI18n, setLang } from '../../../src/i18n';
import { fixture } from '../../fixtures/scenario';
import { play, scenario, settings } from '../../../src/app/store';
import { DEFAULT_SETTINGS } from '../../../src/storage';
import { bestChoiceOf, draftReviews, hasLocalized, isBestChoice } from '../../../src/app/parts/review';
import S09Review from '../../../src/app/screens/S09Review.svelte';

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
} as Parameters<typeof initI18n>[0]);
setLang('ja');

const L = (ja: string) => ({ ja, en: `EN:${ja}` });

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
    itemsEarned: ['i-iso-record'],
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
    finished: true,
    ...over,
  };
}

function history(pointId: string, choiceId: string): ChoiceRecord[] {
  return [{
    pointId, choiceId, at: { day: 0, minutes: 600 },
    policyPoints: 0, itemPoints: 0, voicesBefore: ['v-p1-mis'],
  }];
}

function withReviewText(): Scenario {
  const copy = structuredClone(fixture);
  const role = copy.roles.executive;
  if (!role) throw new Error('fixture role missing');
  const point = role.points.find((item) => item.id === 'p1');
  if (!point) throw new Error('fixture point missing');
  point.lesson = L('まず止めてから知らせる');
  point.choices[0]!.explain = L('隔離は被害を広げない');
  point.choices[1]!.explain = L('様子見は被害を広げる');
  return copy;
}

function withDraftText(): Scenario {
  const copy = structuredClone(fixture);
  const draft = copy.roles.executive?.drafts?.draft1;
  if (!draft) throw new Error('fixture draft missing');
  const slot = draft.slots.find((item) => item.id === 'scope');
  if (!slot?.options) throw new Error('fixture draft options missing');
  slot.options[0]!.explain = L('全員に出すのが正確');
  slot.options[1]!.explain = L('一部だけでは訂正が必要');
  return copy;
}

function setLocation(href: string | undefined): void {
  if (href === undefined) {
    delete (globalThis as { location?: unknown }).location;
    return;
  }
  (globalThis as { location?: { href: string } }).location = { href };
}

beforeEach(() => {
  scenario.set(fixture);
  settings.set({ ...DEFAULT_SETTINGS });
  setLocation(undefined);
});

afterEach(() => {
  setLocation(undefined);
});

describe('S09 の解説表示', () => {
  it('explain と lesson が無ければ見出しを出さない', () => {
    play.set(baseState());
    const { body } = render(S09Review);
    expect(body).toContain('隔離');
    expect(body).not.toContain('なぜこの点数か');
    expect(body).not.toContain('こうするとよかった');
  });

  it('選んだ選択肢の explain と判断の lesson を出す', () => {
    scenario.set(withReviewText());
    play.set(baseState());
    const { body } = render(S09Review);
    expect(body).toContain('なぜこの点数か');
    expect(body).toContain('隔離は被害を広げない');
    expect(body).toContain('こうするとよかった');
    expect(body).toContain('まず止めてから知らせる');
  });

  it('最高点でなければ、模範の選択の本文と explain を出す', () => {
    scenario.set(withReviewText());
    play.set(baseState({ history: history('p1', 'wait') }));
    const { body } = render(S09Review);
    expect(body).toContain('様子見は被害を広げる');
    expect(body).toContain('模範の選択');
    expect(body).toContain('隔離');
    expect(body).toContain('隔離は被害を広げない');
  });

  it('最高点を選んだときは模範の選択を出さない', () => {
    scenario.set(withReviewText());
    play.set(baseState());
    const { body } = render(S09Review);
    expect(body).not.toContain('模範の選択');
  });
});

describe('S09 の誘導の声', () => {
  it('最高点でない判断でだけ「誤った方向へ誘う声」を出す', () => {
    play.set(baseState({ history: history('p1', 'wait') }));
    const { body } = render(S09Review);
    expect(body).toContain('この判断の前に届いていた、誤った方向へ誘う声');
    expect(body).toContain('黙っておけ');
  });

  it('最高点を選んだ判断では誘導の声を出さない', () => {
    play.set(baseState());
    const { body } = render(S09Review);
    expect(body).not.toContain('この判断の前に届いていた、誤った方向へ誘う声');
    expect(body).not.toContain('黙っておけ');
  });
});

describe('S09 の細目（debug 表示）', () => {
  it('通常は細目点・取れた細目・取りこぼした細目を出さない', () => {
    play.set(baseState());
    const { body } = render(S09Review);
    expect(body).not.toContain('細目点');
    expect(body).not.toContain('取れた細目');
    expect(body).not.toContain('i-iso-record');
    expect(body).toContain('方針点');
  });

  it('?debug=1 のときだけ細目を出す', () => {
    setLocation('http://localhost:5173/?debug=1');
    play.set(baseState());
    const { body } = render(S09Review);
    expect(body).toContain('デバッグ表示');
    expect(body).toContain('細目点');
    expect(body).toContain('取れた細目');
    expect(body).toContain('取りこぼした細目');
    expect(body).toContain('i-iso-record');
  });

  it('#debug でも細目を出す', () => {
    setLocation('http://localhost:5173/#debug');
    play.set(baseState());
    const { body } = render(S09Review);
    expect(body).toContain('取れた細目');
  });
});

describe('S09 の報告書（ドラフト）の振り返り', () => {
  it('選んだ option の explain と最高点の option を出す', () => {
    scenario.set(withDraftText());
    play.set(baseState({ itemsEarned: ['s-current'] }));
    const { body } = render(S09Review);
    expect(body).toContain('報告書（文案）の振り返り');
    expect(body).toContain('現会員のみ');
    expect(body).toContain('一部だけでは訂正が必要');
    expect(body).toContain('模範の選択');
    expect(body).toContain('全員');
    expect(body).toContain('全員に出すのが正確');
  });

  it('explain が無いドラフトでも壊れず、その欄を出さない', () => {
    play.set(baseState({ itemsEarned: ['s-current'] }));
    const { body } = render(S09Review);
    expect(body).toContain('報告書（文案）の振り返り');
    expect(body).toContain('現会員のみ');
    expect(body).not.toContain('なぜこの点数か');
  });
});

describe('振り返り用の純粋関数', () => {
  it('最高点の選択肢を返し、同点は最高点とみなす', () => {
    const point = fixture.roles.executive!.points[0]!;
    const best = bestChoiceOf(point);
    expect(best?.id).toBe('isolate');
    expect(best ? isBestChoice(point, best) : false).toBe(true);
    const tie = structuredClone(point);
    tie.choices[1]!.points = tie.choices[0]!.points;
    expect(isBestChoice(tie, tie.choices[1]!)).toBe(true);
    expect(isBestChoice(point, point.choices[1]!)).toBe(false);
  });

  it('文言の有無を判定する', () => {
    expect(hasLocalized(undefined)).toBe(false);
    expect(hasLocalized({ ja: '', en: '  ' })).toBe(false);
    expect(hasLocalized({ ja: '説明', en: '' })).toBe(true);
    expect(hasLocalized({ ja: '', en: 'Explanation' })).toBe(true);
  });

  it('取れた細目からドラフトの選択と模範を復元する', () => {
    const role = fixture.roles.executive;
    expect(draftReviews(role, [])).toEqual([]);
    const best = draftReviews(role, ['s-all']);
    expect(best).toHaveLength(1);
    expect(best[0]?.slots[0]?.chosen.id).toBe('s-all');
    expect(best[0]?.slots[0]?.best).toBeNull();
    const worse = draftReviews(role, ['s-current']);
    expect(worse[0]?.slots[0]?.best?.id).toBe('s-all');
    expect(draftReviews(undefined, ['s-all'])).toEqual([]);
  });
});
