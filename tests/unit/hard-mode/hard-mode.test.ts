// 本番モード（#10）: エンジンの時間切れ判定・保存キー・画面の表示。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { parse } from 'yaml';
import { choose, currentPoint, decisionSeconds, HARD_SECONDS, startPlay, timeoutChoice } from '../../../src/engine';
import type { DecisionPoint, PlayState, PlayMode, StepResult } from '../../../src/engine/types';
import { fixture, fixtureRefs } from '../../fixtures/scenario';

const L = (ja: string) => ({ ja, en: `EN:${ja}` });

type StorageModule = typeof import('../../../src/storage/index.ts');

const begin = (mode?: PlayMode): StepResult =>
  startPlay(fixture, 'executive', 1, { comment: '', predictedHours: null }, '2026-11-13T00:00:00Z', fixtureRefs, mode);

function pointById(id: string): DecisionPoint {
  const point = fixture.roles.executive?.points.find((item) => item.id === id);
  if (!point) throw new Error(`point not found: ${id}`);
  return point;
}

describe('startPlay のモード', () => {
  it('省略時は通常モード', () => {
    expect(begin().state.mode).toBe('normal');
  });

  it('本番モードを指定すると状態に残る', () => {
    const r = begin('hard');
    expect(r.state.mode).toBe('hard');
    expect(r.next).toBe('point');
  });

  it('モードが違っても進行と採点は同じ（エンジンは決定的）', () => {
    const run = (mode: PlayMode): PlayState => {
      let r = begin(mode);
      for (const id of ['isolate', 'escalate', 'publish']) r = choose(r.state, fixture, id);
      return r.state;
    };
    const normal = run('normal');
    const hard = run('hard');
    expect({ ...hard, mode: 'normal' }).toEqual(normal);
    expect(run('hard')).toEqual(hard);
  });

  it('選んだ後もモードは変わらない', () => {
    const r = choose(begin('hard').state, fixture, 'isolate');
    expect(r.state.mode).toBe('hard');
  });
});

describe('decisionSeconds', () => {
  it('基準は60秒で、設定の倍率を掛ける', () => {
    expect(HARD_SECONDS).toBe(60);
    expect(decisionSeconds(1)).toBe(60);
    expect(decisionSeconds(1.5)).toBe(90);
    expect(decisionSeconds(2)).toBe(120);
  });

  it('おかしな倍率は等倍に丸める', () => {
    expect(decisionSeconds(0)).toBe(60);
    expect(decisionSeconds(-1)).toBe(60);
    expect(decisionSeconds(Number.NaN)).toBe(60);
  });
});

describe('timeoutChoice（判断の先送り）', () => {
  it('臆病な選択があれば、その中で最も点数の低いものを選ぶ', () => {
    expect(timeoutChoice(pointById('p1'))?.id).toBe('wait');
    expect(timeoutChoice(pointById('p2'))?.id).toBe('hold');
    expect(timeoutChoice(pointById('p3'))?.id).toBe('delay');
  });

  it('臆病な選択が無ければ、全体で最も点数の低いものを選ぶ', () => {
    const point: DecisionPoint = {
      id: 'x', phase: 'detect', text: L('合成'),
      choices: [
        { id: 'a', text: L('A'), minutes: 15, category: 'maintain', points: 10, refs: [] },
        { id: 'b', text: L('B'), minutes: 15, category: 'hurt', points: -20, refs: [] },
        { id: 'c', text: L('C'), minutes: 15, category: 'hurt', points: -20, refs: [] },
      ],
    };
    expect(timeoutChoice(point)?.id).toBe('b');
    expect(timeoutChoice(pointById('p4'))?.id).toBe('resume-safe');
  });

  it('同点は並び順で先のものを選び、引数を変えない', () => {
    const point: DecisionPoint = {
      id: 'y', phase: 'detect', text: L('合成'),
      choices: [
        { id: 'first', text: L('先'), minutes: 15, category: 'maintain', points: 0, refs: [] },
        { id: 'second', text: L('後'), minutes: 15, category: 'maintain', points: 0, refs: [] },
      ],
    };
    const before = structuredClone(point);
    expect(timeoutChoice(point)?.id).toBe('first');
    expect(timeoutChoice(point)?.id).toBe('first');
    expect(point).toEqual(before);
  });

  it('選択肢が無ければ null', () => {
    const point: DecisionPoint = { id: 'z', phase: 'detect', text: L('空'), choices: [] };
    expect(timeoutChoice(point)).toBeNull();
  });

  it('時間切れを続けてもエンディングまで進める', () => {
    let r = begin('hard');
    let guard = 0;
    while (r.next === 'point' && guard < 10) {
      const point = currentPoint(r.state, fixture);
      const choice = point ? timeoutChoice(point) : null;
      expect(choice).not.toBeNull();
      r = choose(r.state, fixture, choice!.id);
      guard += 1;
    }
    // 先送りだけで判断を使い切ると、記者会見かエンディングへ進む
    expect(['press', 'draft', 'ending']).toContain(r.next);
    expect(r.state.history.length).toBeGreaterThan(0);
  });
});

// ---------------- 保存キー ----------------
class FakeStorage implements Storage {
  readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
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

describe('プレイ回数のキー', () => {
  it('通常モードは従来のキー、本番モードは /hard を足す', async () => {
    const { STORAGE_KEYS } = await import('../../../src/engine/types');
    expect(storage.nextPlayCount('sc1', 'lead')).toBe(1);
    expect(storage.registerPlayStart('sc1', 'lead')).toBe(1);
    expect(storage.registerPlayStart('sc1', 'lead', 'hard')).toBe(1);
    expect(storage.registerPlayStart('sc1', 'lead', 'hard')).toBe(2);

    const plays = JSON.parse(fake.getItem(STORAGE_KEYS.plays) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(plays).sort()).toEqual(['sc1/lead', 'sc1/lead/hard']);
    expect(storage.nextPlayCount('sc1', 'lead')).toBe(2);
    expect(storage.nextPlayCount('sc1', 'lead', 'hard')).toBe(3);
  });

  it('以前の保存（/hard が無いキー）はそのまま読める', async () => {
    const { STORAGE_KEYS } = await import('../../../src/engine/types');
    fake.setItem(STORAGE_KEYS.plays, JSON.stringify({
      'sc2/analyst': { count: 4, first: null, best: null },
    }));
    expect(storage.nextPlayCount('sc2', 'analyst')).toBe(5);
    expect(storage.nextPlayCount('sc2', 'analyst', 'hard')).toBe(1);
  });

  it('結果の記録もモードごとに分かれる', async () => {
    storage.recordResult('sc3', 'officer', { rank: 'A', score: 700, raw: 700, playCount: 1, at: '2026-11-13T00:00:00Z' }, 'hard');
    const plays = storage.loadPlays();
    expect(plays['sc3/officer/hard']?.best?.score).toBe(700);
    expect(plays['sc3/officer']).toBeUndefined();
  });
});

// ---------------- 文言 ----------------
const localeSources = import.meta.glob<string>('../../../locales/*/ui/*.yaml', {
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

function load(lang: 'ja' | 'en'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, text] of Object.entries(localeSources)) {
    if (!path.includes(`/locales/${lang}/`)) continue;
    Object.assign(out, flatten(parse(text)));
  }
  return out;
}

const ja = load('ja');
const en = load('en');

const REQUIRED_KEYS = [
  'sa.roles.mode.legend',
  'sa.roles.mode.normal',
  'sa.roles.mode.hard',
  'sa.roles.mode.hint',
  'sa.roles.mode.hardNotice',
  'sb.main.timer.heading',
  'sb.main.timer.remaining',
  'sb.main.timer.scale',
  'sb.main.timer.hint',
  'sb.main.timer.timeoutResult',
  'sc.review.mode.normal',
  'sc.review.mode.hard',
  'sc.review.modeNote',
];

describe('文言', () => {
  it('本番モードの文言が日英そろっている', () => {
    for (const key of REQUIRED_KEYS) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
      expect(ja[key]?.trim().length ?? 0, `ja: ${key}`).toBeGreaterThan(0);
      expect(en[key]?.trim().length ?? 0, `en: ${key}`).toBeGreaterThan(0);
    }
  });

  it('制限時間の倍率を差し込める', () => {
    expect(ja['sb.main.timer.remaining']).toContain('{seconds}');
    expect(en['sb.main.timer.remaining']).toContain('{seconds}');
    expect(ja['sb.main.timer.scale']).toContain('{scale}');
    expect(ja['sb.main.timer.timeoutResult']).toContain('{choice}');
  });
});

// ---------------- 画面 ----------------
const screenSources = import.meta.glob<string>('../../../src/app/screens/*.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

function screen(name: string): string {
  const text = screenSources[`../../../src/app/screens/${name}.svelte`]
    ?? Object.entries(screenSources).find(([path]) => path.endsWith(`/${name}.svelte`))?.[1];
  if (text === undefined) throw new Error(`missing ${name}`);
  return text;
}

describe('画面', () => {
  it('S04 で難易度を選び、開始時にエンジンと保存へ渡す', () => {
    const text = screen('S04RoleSelect');
    expect(text).toContain('value="hard"');
    expect(text).toContain('value="normal"');
    expect(text).toMatch(/bind:group=\{mode\}/);
    expect(text).toMatch(/startPlay\([^)]*mode\)/);
    expect(text).toMatch(/registerPlayStart\([^)]*mode\)/);
    expect(text).toMatch(/nextPlayCount\([^)]*mode\)/);
  });

  it('S05 は判断ごとに残り秒数を数字で出し、時間切れで timeoutChoice を選ぶ', () => {
    const text = screen('S05Main');
    expect(text).toContain('timeoutChoice');
    expect(text).toContain('decisionSeconds');
    expect(text).toMatch(/role="timer"/);
    expect(text).toContain("t('sb.main.timer.remaining'");
    expect(text).toContain('sb.main.timer.timeoutResult');
    // 数字は演出を減らしても残す（バーだけを止める）
    const digits = text.indexOf("t('sb.main.timer.remaining'");
    const bar = text.indexOf('{#if !$settings.reduceMotion}');
    expect(digits).toBeGreaterThan(-1);
    expect(bar).toBeGreaterThan(-1);
    expect(digits).toBeLessThan(bar);
  });

  it('S05 の本番モードは記録（メモ）を出さない', () => {
    const text = screen('S05Main');
    expect(text).toMatch(/\{#if !hardMode\}[\s\S]*panel--notes[\s\S]*\{\/if\}/);
  });

  it('S09 はモードを表示する', () => {
    const text = screen('S09Review');
    expect(text).toContain('sc.review.mode');
    expect(text).toContain('sc.review.modeNote');
    expect(text).toContain('data-mode=');
  });

  for (const name of ['S04RoleSelect', 'S05Main', 'S09Review']) {
    it(`${name} がコンパイルできる`, () => {
      const result = compile(screen(name), { filename: `${name}.svelte`, generate: 'client' });
      expect(result.js.code.length).toBeGreaterThan(0);
    });
  }
});
