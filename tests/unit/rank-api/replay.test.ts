// 記録の再生（サーバー側の点数計算と改ざんの拒否）
import { describe, expect, it } from 'vitest';
import type { PlaySubmission, RoleId } from '../../../src/engine/types';
import { ROLES } from '../../../src/engine/types';
import { replaySubmission } from '../../../functions/_lib/replay';
import { playThrough, TEST_SCENARIO, TEST_STARTED_AT } from './play-helper';

const played = playThrough(TEST_SCENARIO, 'lead');

function submission(overrides: Partial<PlaySubmission> = {}): PlaySubmission {
  return {
    scenarioId: TEST_SCENARIO.id,
    scenarioVersion: TEST_SCENARIO.version,
    role: 'lead',
    mode: 'normal',
    choices: played.choices.map((entry) => ({ ...entry })),
    drafts: played.drafts.map((entry) => ({ ...entry })),
    press: played.press.map((entry) => ({ ...entry })),
    nickname: 'ためし',
    clientId: 'client-0001',
    turnstileToken: '',
    ...overrides,
  };
}

describe('replaySubmission', () => {
  it('正しい記録はエンジンで遊んだ点数と一致する', () => {
    const result = replaySubmission(submission(), TEST_SCENARIO, TEST_STARTED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score).toBe(played.score);
    expect(result.rank).toBe(played.rank);
  });

  it('4つのロールすべてで再生できる', () => {
    for (const role of ROLES as readonly RoleId[]) {
      const playedRole = playThrough(TEST_SCENARIO, role);
      const result = replaySubmission(
        submission({
          role,
          choices: playedRole.choices,
          drafts: playedRole.drafts,
          press: playedRole.press,
        }),
        TEST_SCENARIO,
        TEST_STARTED_AT,
      );
      expect(result.ok, role).toBe(true);
      if (!result.ok) continue;
      expect(result.score, role).toBe(playedRole.score);
    }
  });

  it('存在しない選択肢を拒否する', () => {
    const tampered = submission();
    tampered.choices[0] = { ...tampered.choices[0]!, choiceId: 'no-such-choice' };
    const result = replaySubmission(tampered, TEST_SCENARIO, TEST_STARTED_AT);
    expect(result).toEqual({ ok: false, error: 'unknown_choice' });
  });

  it('余分な選択を拒否する', () => {
    const tampered = submission();
    tampered.choices = [...tampered.choices, { pointId: 'no-such-point', choiceId: 'no-such-choice' }];
    const result = replaySubmission(tampered, TEST_SCENARIO, TEST_STARTED_AT);
    expect(result).toEqual({ ok: false, error: 'extra_choices' });
  });

  it('順序が違う選択を拒否する', () => {
    const tampered = submission();
    tampered.choices = [tampered.choices[1]!, tampered.choices[0]!, ...tampered.choices.slice(2)];
    const result = replaySubmission(tampered, TEST_SCENARIO, TEST_STARTED_AT);
    expect(result.ok).toBe(false);
  });

  it('選択が足りない記録を拒否する', () => {
    const tampered = submission();
    tampered.choices = tampered.choices.slice(0, 3);
    const result = replaySubmission(tampered, TEST_SCENARIO, TEST_STARTED_AT);
    expect(result.ok).toBe(false);
  });

  it('存在しない草案の選択肢を拒否する', () => {
    const tampered = submission();
    tampered.drafts = tampered.drafts.map((entry, index) =>
      index === 0 ? { ...entry, optionId: 'no-such-option' } : entry,
    );
    const result = replaySubmission(tampered, TEST_SCENARIO, TEST_STARTED_AT);
    expect(result).toEqual({ ok: false, error: 'unknown_option' });
  });

  it('草案の選択が欠けている記録を拒否する', () => {
    const tampered = submission();
    tampered.drafts = [];
    const result = replaySubmission(tampered, TEST_SCENARIO, TEST_STARTED_AT);
    expect(result).toEqual({ ok: false, error: 'draft_missing' });
  });

  it('余分な草案の選択を拒否する', () => {
    const tampered = submission();
    tampered.drafts = [...tampered.drafts, { draftKey: 'unknown-draft', slotId: 'a', optionId: 'b' }];
    const result = replaySubmission(tampered, TEST_SCENARIO, TEST_STARTED_AT);
    expect(result).toEqual({ ok: false, error: 'extra_drafts' });
  });

  it('余分な記者会見の回答を拒否する', () => {
    const tampered = submission();
    tampered.press = [...tampered.press, { questionId: 'unknown-question', answerId: null }];
    const result = replaySubmission(tampered, TEST_SCENARIO, TEST_STARTED_AT);
    expect(result).toEqual({ ok: false, error: 'extra_press' });
  });

  it('選べない記者会見の回答を拒否する', () => {
    const tampered = submission();
    tampered.press = tampered.press.map((entry, index) =>
      index === 0 ? { ...entry, answerId: 'no-such-answer' } : entry,
    );
    const result = replaySubmission(tampered, TEST_SCENARIO, TEST_STARTED_AT);
    expect(result).toEqual({ ok: false, error: 'press_answer_unavailable' });
  });

  it('シナリオの版が違う記録を拒否する', () => {
    const result = replaySubmission(
      submission({ scenarioVersion: '9.9.9' }),
      TEST_SCENARIO,
      TEST_STARTED_AT,
    );
    expect(result).toEqual({ ok: false, error: 'scenario_version_mismatch' });
  });
});
