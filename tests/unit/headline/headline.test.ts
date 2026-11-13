import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { render } from 'svelte/server';
import jaSource from '../../../locales/ja/ui/headline.yaml?raw';
import enSource from '../../../locales/en/ui/headline.yaml?raw';
import {
  HEADLINE_THRESHOLDS,
  headlineFor,
  pickHeadline,
  tierFor,
} from '../../../src/app/headline';
import { initI18n, setLang } from '../../../src/i18n';
import { fixture } from '../../fixtures/scenario';
import type { PlayState, Scenario } from '../../../src/engine/types';
import { checkC26 } from '../../../tools/validate/checks.ts';
import type { Project } from '../../../tools/validate/project.ts';
import Headline from '../../../src/app/parts/Headline.svelte';

function state(patch: Partial<PlayState> = {}): PlayState {
  return {
    scenarioId: fixture.id,
    scenarioVersion: fixture.version,
    role: 'executive',
    playCount: 1,
    clock: { day: 1, minutes: 600 },
    phase: 'after',
    pointId: null,
    gauges: { damage: 20, flame: 10, trust: 80, stamina: 60 },
    cowardStreak: 0,
    rawScore: 1200,
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
    finished: true,
    ...patch,
  };
}

/** 最初の通知の判断（p3）を 11 時間で終えた履歴 */
const earlyNotifyHistory: PlayState['history'] = [{
  pointId: 'p3',
  choiceId: 'publish',
  at: { day: 0, minutes: 1080 },
  policyPoints: 300,
  itemPoints: 0,
  voicesBefore: [],
}];

function projectWith(scenario: Record<string, unknown>): Project {
  return {
    scenarios: [{
      file: 'scenarios/fixture/scenario.yaml',
      roleSources: new Map(),
      scenario: {},
      sceneSource: { data: scenario },
    }],
  } as unknown as Project;
}

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[full] = child;
    else Object.assign(out, flatten(child, full));
  }
  return out;
}

const ja = flatten(parse(jaSource));
const en = flatten(parse(enSource));
const templateKeys = (strings: Record<string, string>) =>
  Object.keys(strings).filter((key) => key.startsWith('headline.template.'));

describe('状況の判定', () => {
  it('ランクを high / mid / low にまとめる', () => {
    expect(tierFor('S')).toBe('high');
    expect(tierFor('A')).toBe('high');
    expect(tierFor('B')).toBe('mid');
    expect(tierFor('C')).toBe('mid');
    expect(tierFor('D')).toBe('low');
  });

  it('迅速な公表は quick になる', () => {
    const pick = pickHeadline(state({ history: earlyNotifyHistory }), fixture);
    expect(pick.rank).toBe('S');
    expect(pick.situation).toBe('quick');
    expect(pick.key).toBe('headline.template.quick.high');
  });

  it('公表が遅いだけでは quick にならない', () => {
    const late: PlayState['history'] = [{
      pointId: 'p3', choiceId: 'publish', at: { day: 3, minutes: 1080 },
      policyPoints: 300, itemPoints: 0, voicesBefore: [],
    }];
    const pick = pickHeadline(state({ history: late, rawScore: 500 }), fixture);
    expect(pick.situation).toBe('plain');
    expect(pick.key).toBe('headline.template.plain.A');
  });

  it('hid* の旗が立っていれば隠蔽ぎみ', () => {
    const pick = pickHeadline(state({ flags: { hidFacts: true } }), fixture);
    expect(pick.situation).toBe('coverup');
    expect(pick.key).toBe('headline.template.coverup.high');
  });

  it('期限超過は deadline になる', () => {
    const pick = pickHeadline(state({
      deadlines: [{ id: 'dl-prelim', dueAt: { day: 1, minutes: 0 }, warned: true, done: false, over: true }],
    }), fixture);
    expect(pick.situation).toBe('deadline');
    expect(pick.key).toBe('headline.template.deadline.high');
  });

  it('時間切れの回答があれば会見失敗として先に出す', () => {
    const pick = pickHeadline(state({
      flags: { hidFacts: true },
      press: {
        questionIds: ['q1'], index: 1,
        answers: [{ questionId: 'q1', answerId: null, points: -30 }],
      },
    }), fixture);
    expect(pick.situation).toBe('pressFail');
  });

  it('会見の合計がマイナスでも会見失敗', () => {
    const pick = pickHeadline(state({
      press: {
        questionIds: ['q1'], index: 1,
        answers: [{ questionId: 'q1', answerId: 'a1', points: -10 }],
      },
    }), fixture);
    expect(pick.situation).toBe('pressFail');
  });

  it('炎上・被害の大きさ・信頼の低さで状況が変わる', () => {
    const flame = pickHeadline(state({ gauges: { damage: 20, flame: 90, trust: 60, stamina: 60 } }), fixture);
    expect(flame.situation).toBe('flame');
    expect(flame.key).toBe('headline.template.flame.high');

    const damage = pickHeadline(state({
      gauges: { damage: HEADLINE_THRESHOLDS.damage, flame: 10, trust: 60, stamina: 60 },
    }), fixture);
    expect(damage.situation).toBe('damage');

    const trusted = pickHeadline(state({
      gauges: { damage: 10, flame: 10, trust: HEADLINE_THRESHOLDS.trust - 1, stamina: 60 },
    }), fixture);
    expect(trusted.situation).toBe('trustLost');
  });

  it('致命的な失点・身代金・該当なしも判定できる', () => {
    expect(pickHeadline(state({ fatal: true }), fixture).situation).toBe('fatal');
    expect(pickHeadline(state({ flags: { paidRansom: true } }), fixture).situation).toBe('ransom');
    const plain = pickHeadline(state({ rawScore: -100, gauges: { damage: 10, flame: 0, trust: 40, stamina: 50 } }), fixture);
    expect(plain.rank).toBe('D');
    expect(plain.situation).toBe('plain');
    expect(plain.key).toBe('headline.template.plain.D');
  });

  it('ランク D では迅速な公表の見出しにしない', () => {
    const pick = pickHeadline(state({
      rawScore: -100,
      flags: { fullDisclosure: true },
      gauges: { damage: 10, flame: 0, trust: 90, stamina: 50 },
    }), fixture);
    expect(pick.rank).toBe('D');
    expect(pick.situation).toBe('plain');
  });
});

describe('headlineFor', () => {
  it('会社名を日英それぞれに差し込む', () => {
    const headline = headlineFor(state({ history: earlyNotifyHistory }), fixture);
    expect(headline.ja).toContain('テスト株式会社');
    expect(headline.ja).toContain('迅速な公表');
    expect(headline.en).toContain('EN:テスト株式会社');
    expect(headline.ja).not.toContain('{company}');
    expect(headline.en).not.toContain('{company}');
  });

  it('シナリオの上書き見出しを優先する', () => {
    const custom: Scenario = {
      ...fixture,
      headlines: {
        A: { ja: '{company}の独自見出し', en: '{company} custom headline' },
      },
    };
    const headline = headlineFor(state({ rawScore: 500 }), custom);
    expect(headline.ja).toBe('テスト株式会社の独自見出し');
    expect(headline.en).toBe('EN:テスト株式会社 custom headline');
  });

  it('上書きが無いランクは共通の雛形を使う', () => {
    const custom: Scenario = {
      ...fixture,
      headlines: { A: { ja: 'Aだけ', en: 'A only' } },
    };
    const headline = headlineFor(state({ rawScore: -100 }), custom);
    expect(headline.ja).not.toBe('Aだけ');
    expect(headline.ja).toContain('テスト株式会社');
  });

  it('state を変更せず、同じ入力なら同じ結果になる', () => {
    const input = state({
      history: earlyNotifyHistory,
      flags: { hidFacts: true, paidRansom: true },
      deadlines: [{ id: 'dl-prelim', dueAt: { day: 1, minutes: 0 }, warned: true, done: false, over: true }],
    });
    const before = JSON.stringify(input);
    const first = headlineFor(input, fixture);
    const second = headlineFor(input, fixture);
    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('見出しの雛形（locales/*/ui/headline.yaml）', () => {
  it('日英それぞれ20種以上の雛形があり、キーが一致する', () => {
    const jaKeys = templateKeys(ja);
    const enKeys = templateKeys(en);
    expect(jaKeys.length).toBeGreaterThanOrEqual(20);
    expect(new Set(jaKeys)).toEqual(new Set(enKeys));
  });

  it('すべての雛形に会社名の差し込みがあり、日英とも空でない', () => {
    for (const key of templateKeys(ja)) {
      expect(ja[key]).toContain('{company}');
      expect(en[key]).toContain('{company}');
      expect(ja[key]?.trim().length).toBeGreaterThan(0);
      expect(en[key]?.trim().length).toBeGreaterThan(0);
    }
  });

  it('実在の新聞名を使っていない', () => {
    const forbidden = ['朝日新聞', '読売新聞', '毎日新聞', '産経新聞', '日本経済新聞',
      'Asahi Shimbun', 'Yomiuri Shimbun', 'Mainichi Shimbun'];
    for (const source of [jaSource, enSource]) {
      for (const name of forbidden) expect(source).not.toContain(name);
    }
  });

  it('紙名・注記のUI文言がある', () => {
    for (const key of ['headline.region', 'headline.paper', 'headline.edition', 'headline.date', 'headline.note']) {
      expect(ja[key]?.trim().length).toBeGreaterThan(0);
      expect(en[key]?.trim().length).toBeGreaterThan(0);
    }
    expect(ja['headline.paper']).toBe('東都日報');
  });
});

describe('Headline の表示', () => {
  it('紙名・見出し・注記を出す', () => {
    initI18n({
      ja: { strings: flatten(parse(jaSource)), notices: {} },
      en: { strings: flatten(parse(enSource)), notices: {} },
    } as never);
    setLang('ja');

    const { body } = render(Headline, {
      props: { state: state({ history: earlyNotifyHistory }), scenario: fixture },
    });
    expect(body).toContain('東都日報');
    expect(body).toContain('テスト株式会社');
    expect(body).toContain('迅速な公表');
    expect(body).toContain('フィクション');
  });
});

describe('C26 Scenario.headlines の検査', () => {
  it('指定が無ければエラーにしない', () => {
    expect(checkC26(projectWith({}))).toEqual([]);
  });

  it('ランクごとの Localized は通る', () => {
    const issues = checkC26(projectWith({
      headlines: { S: { ja: '{company}の見出し', en: '{company} headline' } },
    }));
    expect(issues).toEqual([]);
  });

  it('オブジェクトでない・未知のランク・空の文言を止める', () => {
    const notObject = checkC26(projectWith({ headlines: '見出し' }));
    expect(notObject.map((issue) => issue.code)).toEqual(['C26']);

    const unknownRank = checkC26(projectWith({ headlines: { X: { ja: 'x', en: 'x' } } }));
    expect(unknownRank[0]?.message).toContain('S/A/B/C/D');

    const empty = checkC26(projectWith({ headlines: { A: { ja: '', en: '' } } }));
    expect(empty[0]?.code).toBe('C26');

    const unknownLang = checkC26(projectWith({ headlines: { A: { ja: 'a', fr: 'b' } } }));
    expect(unknownLang.some((issue) => issue.message.includes('未知の言語'))).toBe(true);
  });
});
