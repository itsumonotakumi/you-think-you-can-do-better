// No.10 ネクサス半導体 / レビュー指摘（docs/reviews/no10-nexus.md）の修正を固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no10-nexus/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no10-nexus/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no10-nexus/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no10-nexus/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no10-nexus/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import {
  answerPress,
  availableAnswers,
  startPlay,
  startPress,
} from '../../../src/engine/index';
import { CATEGORY_RANGE } from '../../../src/engine/types';
import type {
  Choice,
  DecisionPoint,
  Draft,
  PressAnswer,
  Reference,
  RoleScript,
  Scenario,
} from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const executive = parse(executiveYaml) as unknown as RoleScript;
const officer = parse(officerYaml) as unknown as RoleScript;
const lead = parse(leadYaml) as unknown as RoleScript;
const analyst = parse(analystYaml) as unknown as RoleScript;
const scenario: Scenario = { ...base, roles: { executive, officer, lead, analyst } };
const refs = parse(referencesYaml) as Reference[];

function pointOf(role: RoleScript, id: string): DecisionPoint {
  const point = role.points.find((p) => p.id === id);
  expect(point, `判断ポイント ${id} が見つからない`).toBeTruthy();
  return point!;
}

function choiceOf(role: RoleScript, pointId: string, choiceId: string): Choice {
  const choice = pointOf(role, pointId).choices.find((c) => c.id === choiceId);
  expect(choice, `選択肢 ${choiceId} が見つからない`).toBeTruthy();
  return choice!;
}

function voiceText(role: RoleScript, id: string): string {
  const voice = role.voices.find((v) => v.id === id);
  expect(voice, `声 ${id} が見つからない`).toBeTruthy();
  return voice!.text.ja;
}

function draftOf(role: RoleScript, key: string): Draft {
  const draft = role.drafts?.[key];
  expect(draft, `文案 ${key} が見つからない`).toBeTruthy();
  return draft!;
}

function autoThresholds(role: RoleScript, key: string): number[] {
  const slot = draftOf(role, key).slots.find((s) => s.auto);
  expect(slot, `${key} に auto の枠がない`).toBeTruthy();
  return (slot!.items ?? [])
    .map((item) => item.when.withinHours)
    .filter((hours): hours is number => typeof hours === 'number');
}

function elapsedHours(role: RoleScript, pointId: string, choiceId: string): number {
  const point = pointOf(role, pointId);
  const choice = choiceOf(role, pointId, choiceId);
  expect(point.at).toBeTruthy();
  const at = point.at!.day * 1440 + point.at!.minutes + choice.minutes;
  const start = scenario.start.day * 1440 + scenario.start.minutes;
  return (at - start) / 60;
}

function pressAnswers(flags: Record<string, boolean>, notes: string[], index: number): PressAnswer[] {
  const started = startPlay(
    scenario,
    'executive',
    1,
    { comment: '', predictedHours: null },
    '2026-11-08T00:00:00.000Z',
    refs,
  );
  const state = structuredClone(started.state);
  state.flags = { ...state.flags, ...flags };
  state.notes = notes.map((id) => ({ id, text: '', at: { day: 0, minutes: 0 } }));
  let step = startPress(state, scenario);
  while (step.next === 'press' && (step.state.press?.index ?? 0) < index) {
    step = answerPress(step.state, scenario, null);
  }
  return availableAnswers(step.state, scenario);
}

function unconditional(answers: PressAnswer[]): PressAnswer[] {
  return answers.filter((a) => a.when === undefined && (a.requiresNote === undefined || a.requiresNote === false));
}

describe('掲示板の書き込み（指摘3）', () => {
  it('未確認の書き込みに反応する選択肢が減点になり、正解は突き合わせ', () => {
    const point = pointOf(officer, 'p13-leak');
    expect(new Set(point.choices.map((c) => c.id))).toEqual(
      new Set(['p13-react', 'p13-ignore', 'p13-verify', 'p13-verify-plan']),
    );
    const best = [...point.choices].sort((a, b) => b.points - a.points)[0]!;
    expect(best.id).toBe('p13-verify-plan');
    expect(best.text.ja).toContain('突き合わせ');
    expect(choiceOf(officer, 'p13-leak', 'p13-react').points).toBe(-120);
    expect(choiceOf(officer, 'p13-leak', 'p13-ignore').points).toBe(-80);
    const react = choiceOf(officer, 'p13-leak', 'p13-react');
    expect(react.delayed?.[0]?.reason.ja).toContain('二転三転');
  });

  it('攻撃者がいない事案なので、攻撃者の声を出さない', () => {
    for (const role of [executive, officer, lead, analyst]) {
      const attackers = role.voices.filter((v) => v.media === 'attacker');
      expect(attackers, '攻撃者の声が残っている').toEqual([]);
    }
    const ids = pointOf(officer, 'p13-leak').voices ?? [];
    for (const id of ids) {
      const voice = officer.voices.find((v) => v.id === id)!;
      expect(voice.type, `${id} が攻撃者の揺さぶり型`).not.toBe('attacker-shake');
    }
  });
});

describe('役員ロールの流用痕（指摘4・13）', () => {
  it('p16-own は本編にある事実だけを責任として説明する', () => {
    const text = choiceOf(officer, 'p16-board', 'p16-own').text.ja;
    expect(text).toContain('経営の責任');
    expect(text).not.toContain('事前の指摘');
    expect(text).not.toContain('上申を止めた');
  });

  it('調査報告書の原因と責任も、本編の事実に合わせる', () => {
    const report = draftOf(officer, 'final-report');
    const options = report.slots.flatMap((s) => s.options ?? []);
    const warning = options.find((o) => o.id === 'fr-w-include')!;
    const responsibility = options.find((o) => o.id === 'fr-r-own')!;
    expect(warning.text.ja).toContain('利用実態');
    expect(warning.text.ja).not.toContain('事前');
    expect(responsibility.text.ja).toContain('ルールを決めなかった');
    expect(responsibility.text.ja).not.toContain('上申');
  });

  it('役員ロールの入力者は表彰されておらず、処分の判断にも表彰が出てこない', () => {
    expect(pointOf(officer, 'p03-employee').text.ja).not.toContain('表彰');
    const note = (pointOf(officer, 'p03-employee').notable ?? []).find((n) => n.id === 'note-employee-intent')!;
    expect(note.text.ja).not.toContain('表彰');
    expect(pointOf(officer, 'p11-hr').text.ja).not.toContain('表彰');
    expect(voiceText(officer, 'v11-boss')).not.toContain('表彰');
  });
});

describe('役員ロールの本文の事実関係（指摘9・10・11・14・27）', () => {
  it('親会社の決定は経営会議の前日になっている', () => {
    expect(pointOf(officer, 'p09-restart').text.ja).toContain('明日の経営会議');
    expect(pointOf(officer, 'p09-restart').text.ja).not.toContain('グループ全体で生成AIを止めると決めた');
  });

  it('停止しているのは生成AIで、不審な通信は出てこない', () => {
    const text = pointOf(officer, 'p14-resume').text.ja;
    expect(text).toContain('エラーコード検索');
    expect(text).not.toContain('保守受付システムを止めて');
    const delayed = choiceOf(officer, 'p14-resume', 'p14-standalone').delayed?.[0];
    expect(delayed?.reason.ja).toContain('同じ入力');
    expect(delayed?.reason.ja).not.toContain('不審な通信');
  });

  it('無謀な再開は致命的ではなく、大きな減点で表す', () => {
    const alone = choiceOf(officer, 'p09-restart', 'p09-alone');
    expect(alone.category).toBe('hurt');
    expect(alone.points).toBeGreaterThanOrEqual(CATEGORY_RANGE.hurt[0]);
    expect(alone.points).toBeLessThanOrEqual(CATEGORY_RANGE.hurt[1]);
    expect(alone.delayed?.length).toBeGreaterThan(0);
  });

  it('顧客はA社に統一され、速報は連名にしない', () => {
    expect(pointOf(officer, 'p12-audit').text.ja).toContain('A社');
    for (const point of officer.points) {
      expect(point.text.ja, `${point.id} にB社が残っている`).not.toContain('B社');
    }
    const joint = choiceOf(officer, 'p06-ppc', 'p06-joint').text.ja;
    expect(joint).toContain('子会社として速報を出し');
    expect(joint).not.toContain('連名');
  });
});

describe('公表の時刻の判定（指摘5・6）', () => {
  it('経営者の第1報は選択後の51.5時間でも最上位の加点に届く', () => {
    const [first] = autoThresholds(executive, 'release');
    expect(first).toBeGreaterThanOrEqual(elapsedHours(executive, 'p07-release', 'p07-full'));
  });

  it('役員の第1報は選択後の74.5時間でも最上位の加点に届く', () => {
    const [first] = autoThresholds(officer, 'release');
    expect(first).toBeGreaterThanOrEqual(elapsedHours(officer, 'p10-release', 'p10-full'));
  });

  it('担当者の技術資料は選択後の51.5時間でも最上位の加点に届く', () => {
    const [first] = autoThresholds(analyst, 'tech-brief');
    expect(first).toBeGreaterThanOrEqual(elapsedHours(analyst, 'an11-release-support', 'an11-facts-plus'));
  });
});

describe('担当者ロールの細目の桁（指摘17・18・19）', () => {
  const plusChoices = ['an09-escalate-plus', 'an10-materials-plus', 'an13-enforce', 'an16-open', 'an19-open'];

  it('plus 選択肢の方針点と細目が他の選択肢と揃っている', () => {
    const pointsById = new Map(
      analyst.points.flatMap((p) => p.choices.map((c) => [c.id, c] as const)),
    );
    for (const id of plusChoices) {
      const choice = pointsById.get(id)!;
      expect(choice.points, `${id} の方針点`).toBe(80);
      for (const item of choice.items ?? []) {
        expect(Math.abs(item.points), `${item.id} の細目`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('報告しない判断は、決裁権のない担当者の方が軽い', () => {
    const none = choiceOf(analyst, 'an10-ppc', 'an10-none');
    expect(none.category).toBe('hurt');
    expect(none.points).toBeGreaterThan(choiceOf(executive, 'p06-ppc', 'p06-none').points);
  });

  it('上司の入力も同じ基準で扱う選択肢と、外せという圧力がある', () => {
    const bossChoice = choiceOf(analyst, 'an05-employee', 'an05-boss-input');
    expect(bossChoice.category).toBe('maintain');
    expect(bossChoice.text.ja).toContain('上司を飛ばして');
    expect(voiceText(analyst, 'va05-boss')).toContain('一覧から外して');
  });
});

describe('記者会見の回答の条件（嘘が得にならない）', () => {
  it('処分の質問は、実際に処分した内容と食い違う回答を選べない', () => {
    const dismissed = pressAnswers({ employeeDismissed: true }, ['note-employee-intent'], 1);
    const ids = dismissed.map((a) => a.id);
    expect(ids).toContain('a-emp-fire');
    expect(ids).not.toContain('a-emp-warn');
    expect(ids).not.toContain('a-emp-own');
    expect(unconditional(dismissed).length).toBeGreaterThan(0);

    const kept = pressAnswers({}, ['note-employee-intent'], 1);
    const keptIds = kept.map((a) => a.id);
    expect(keptIds).toContain('a-emp-warn');
    expect(keptIds).toContain('a-emp-own');
    expect(keptIds).not.toContain('a-emp-fire');
  });

  it('禁止したのに「使い続ける」「管理環境で使う」とは答えられない', () => {
    const banned = pressAnswers({ bannedAI: true }, [], 3).map((a) => a.id);
    expect(banned).not.toContain('a-ban-yes');
    expect(banned).not.toContain('a-ban-managed');
    expect(banned).not.toContain('a-ban-design');
    expect(banned).toContain('a-ban-review');

    const managed = pressAnswers({ managedAI: true }, [], 3).map((a) => a.id);
    expect(managed).toContain('a-ban-design');
  });

  it('どの質問にも、条件なしで選べる回答が残っている', () => {
    for (let index = 0; index < 4; index += 1) {
      const answers = pressAnswers({}, [], index);
      expect(answers.length, `質問 ${index} に回答がない`).toBeGreaterThan(0);
      expect(unconditional(answers).length, `質問 ${index} に条件なしの回答がない`).toBeGreaterThan(0);
    }
  });
});

describe('その他の指摘（7・12・16・20・21・22・23・24・25・26・28・29・30）', () => {
  it('正しい方向へ押す声に misleading を付けない', () => {
    for (const [role, id] of [
      [executive, 'v07-public'],
      [officer, 'v10-public'],
      [lead, 'v10-public'],
    ] as const) {
      const voice = role.voices.find((v) => v.id === id)!;
      expect(voice.misleading, `${id} が misleading`).toBe(false);
      expect(voice.type, `${id} に type が残っている`).toBeUndefined();
    }
  });

  it('経営者ロールの見積もりは30分', () => {
    expect(executive.estimateMinutes).toBe(30);
  });

  it('人気の声はゲーム外のプレイヤーに言及しない', () => {
    expect(voiceText(executive, 'v09-popular')).not.toContain('プレイヤー');
    expect(voiceText(executive, 'v09-popular')).toContain('他の会社');
  });

  it('責任の範囲は監査結果とあわせて示す', () => {
    for (const role of [executive, officer]) {
      const text = choiceOf(role, role === executive ? 'p12-audit' : 'p12-audit', 'p12-open').text.ja;
      expect(text).toContain('監査結果');
      expect(text).not.toContain('責任を認めて');
    }
  });

  it('一度だけの研修は減点になる', () => {
    const execOnce = choiceOf(executive, 'p16-training', 'p16-once');
    expect(execOnce.category).toBe('hurt');
    expect(execOnce.points).toBe(-30);
    const analystOnce = choiceOf(analyst, 'an20-share', 'an20-once');
    expect(analystOnce.category).toBe('hurt');
    expect(analystOnce.points).toBe(-30);
  });

  it('呼び出しの選択肢は、まだ本人が分からない前提に合わせる', () => {
    expect(choiceOf(executive, 'p01-code', 'p01-scold').text.ja).toContain('全員を呼び出して');
    expect(choiceOf(analyst, 'an01-input-alert', 'an01-ask').text.ja).toContain('全員を呼び出して');
  });

  it('遅らせた効果の理由は、その時点で知り得る事実だけを書く', () => {
    for (const [role, pointId, choiceId] of [
      [executive, 'p01-code', 'p01-later'],
      [lead, 'p01-log', 'p01-later'],
      [officer, 'p01-call', 'p01-wait'],
    ] as const) {
      const reason = choiceOf(role, pointId, choiceId).delayed?.[0]?.reason.ja ?? '';
      expect(reason).toContain('同じ種類の入力');
      expect(reason).not.toContain('顧客情報');
    }
  });

  it('統計の話をする声は自称専門家の型にする', () => {
    for (const [role, id] of [
      [executive, 'v02-law'],
      [lead, 'v02-law'],
      [analyst, 'va02-law'],
    ] as const) {
      const voice = role.voices.find((v) => v.id === id)!;
      expect(voice.type).toBe('fake-expert');
      expect(voice.text.ja).toContain('サンプル調査');
    }
  });

  it('欠損の埋め方は、もっともらしい改ざん誘導にする', () => {
    expect(voiceText(lead, 'v09-expert')).toContain('推定で埋めて');
  });

  it('補償の判断は、開示と経営の根拠を使う', () => {
    const point = pointOf(officer, 'p15-compensation');
    for (const choice of point.choices) {
      expect(choice.refs).toContain('meti-csm-guideline');
      for (const item of choice.items ?? []) {
        expect(item.refs).not.toContain('ppc-notify-person');
      }
    }
  });

  it('新規事業は無償の支援として書く', () => {
    expect(choiceOf(executive, 'p17-board', 'p17-grow').text.ja).toContain('無償で始める');
    expect(choiceOf(officer, 'p19-summary', 'p19-grow').text.ja).toContain('無償で始める');
  });

  it('復旧計画はマルウェア前提の作業を入れない', () => {
    const plan = draftOf(lead, 'recovery-plan');
    const options = plan.slots.flatMap((s) => s.options ?? []);
    const ids = options.map((o) => o.id);
    expect(ids).toContain('rp-c-gateway');
    expect(ids).toContain('rp-k-personal');
    expect(ids).not.toContain('rp-c-new');
    expect(ids).not.toContain('rp-k-all');
    expect(choiceOf(lead, 'p15-audit', 'p15-plan-verify').text.ja).toContain('共有アカウントの廃止');
  });
});
