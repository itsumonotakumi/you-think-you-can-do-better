// 不具合修正の再現テスト: イベントの setFlags 反映と、発生時刻ごとの時計進行。
import { describe, it, expect } from 'vitest';
import { advanceClock } from '../../../src/engine/events';
import { startPlay } from '../../../src/engine/state';
import { fixture, fixtureRefs } from '../../fixtures/scenario';
import type { Cue, Scenario, StepResult } from '../../../src/engine/types';

function begin(scenario: Scenario = fixture): StepResult {
  return startPlay(scenario, 'executive', 1, { comment: '', predictedHours: null }, '2026-11-08T00:00:00Z', fixtureRefs);
}

function scenarioWithEvents(events: NonNullable<Scenario['roles']['executive']>['events']): Scenario {
  const scenario = structuredClone(fixture);
  const script = scenario.roles.executive;
  if (!script) throw new Error('executive role missing');
  script.events = events;
  return scenario;
}

describe('イベントの setFlags', () => {
  it('発火したイベントの setFlags を状態に反映する', () => {
    const scenario = scenarioWithEvents([
      { id: 'ev-open', at: { day: 0, minutes: 700 }, setFlags: { opened: true } },
    ]);
    const r = begin(scenario);
    advanceClock(r.state, scenario, 300, []); // 9:00 → 14:00
    expect(r.state.flags['opened']).toBe(true);
    expect(r.state.flags['ev:ev-open']).toBe(true);
  });

  it('setFlags で立った旗を後続イベントの when が参照できる', () => {
    const scenario = scenarioWithEvents([
      { id: 'ev-open', at: { day: 0, minutes: 700 }, setFlags: { opened: true } },
      { id: 'ev-after', at: { day: 0, minutes: 710 }, when: { flags: { opened: true } }, gauges: { flame: 5 } },
    ]);
    const r = begin(scenario);
    advanceClock(r.state, scenario, 300, []);
    expect(r.state.flags['ev:ev-after']).toBe(true);
    expect(r.state.gauges.flame).toBe(5);
  });
});

describe('通過イベントは発生時刻で適用する', () => {
  it('深夜帯のイベントは深夜の体力減少と時刻で処理する', () => {
    const scenario = scenarioWithEvents([
      { id: 'ev-night', at: { day: 0, minutes: 1380 }, gauges: { stamina: -10 }, voices: ['v-news'] },
    ]);
    const r = begin(scenario);
    r.state.clock = { day: 0, minutes: 1260 }; // 21:00
    const cues: Cue[] = [];
    advanceClock(r.state, scenario, 600, cues); // 翌 7:00 まで
    expect(r.state.clock).toEqual({ day: 1, minutes: 420 });
    expect(r.state.gauges.stamina).toBe(85); // 23:00 なので -10 × 1.5
    expect(r.state.voicesShown.find((v) => v.voiceId === 'v-news')?.at).toEqual({ day: 0, minutes: 1380 });
  });

  it('複数イベントを時刻順に、それぞれの時刻で適用する', () => {
    const scenario = scenarioWithEvents([
      { id: 'ev-morning', at: { day: 1, minutes: 480 }, gauges: { stamina: -10 }, voices: ['v-news'] },
      { id: 'ev-night', at: { day: 0, minutes: 1380 }, gauges: { stamina: -10 }, voices: ['v-c2'] },
    ]);
    const r = begin(scenario);
    r.state.clock = { day: 0, minutes: 1260 }; // 21:00
    advanceClock(r.state, scenario, 600, []); // 翌 7:00（8:00 のイベントは範囲外）
    expect(r.state.gauges.stamina).toBe(85);
    expect(r.state.flags['ev:ev-night']).toBe(true);
    expect(r.state.flags['ev:ev-morning']).toBeFalsy();

    const r2 = begin(scenario);
    r2.state.clock = { day: 0, minutes: 1260 };
    advanceClock(r2.state, scenario, 660, []); // 翌 8:00 まで
    expect(r2.state.gauges.stamina).toBe(75); // -15（深夜）+ -10（朝）
    expect(r2.state.voicesShown.slice(-2).map((v) => v.voiceId)).toEqual(['v-c2', 'v-news']);
    expect(r2.state.voicesShown.slice(-2).map((v) => v.at)).toEqual([
      { day: 0, minutes: 1380 },
      { day: 1, minutes: 480 },
    ]);
  });
});
