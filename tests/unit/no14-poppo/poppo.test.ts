// No.14 ハルカゼマート / 4ロールのデータと経路の検査。
// 検査ツール（validate）とは別に、担当シナリオの約束をここで固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no14-poppo/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no14-poppo/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no14-poppo/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no14-poppo/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no14-poppo/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import {
  answerPress,
  availableAnswers,
  choose,
  computeResult,
  currentPoint,
  startPlay,
  startPress,
  submitDraft,
} from '../../../src/engine/index';
import { CATEGORY_RANGE, MISLEADING_TYPES, PHASES } from '../../../src/engine/types';
import type { Reference, RoleId, RoleScript, Scenario } from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const roles: Record<RoleId, RoleScript> = {
  executive: parse(executiveYaml) as RoleScript,
  officer: parse(officerYaml) as RoleScript,
  lead: parse(leadYaml) as RoleScript,
  analyst: parse(analystYaml) as RoleScript,
};
const scenario: Scenario = { ...base, roles };
const refs = parse(referencesYaml) as Reference[];
const refIds = new Set(refs.map((r) => r.id));

const roleIds = Object.keys(roles) as RoleId[];

function detailItems(script: RoleScript) {
  return [
    ...script.points.flatMap((p) => p.choices.flatMap((c) => c.items ?? [])),
    ...Object.values(script.drafts ?? {}).flatMap((d) =>
      d.slots.flatMap((s) => [...(s.items ?? []), ...(s.options ?? [])]),
    ),
  ];
}

function pickIndex(points: number[], mode: 'max' | 'min' | 'near20'): number {
  if (mode === 'max') return points.indexOf(Math.max(...points));
  if (mode === 'min') return points.indexOf(Math.min(...points));
  return points.reduce(
    (best, p, i) => (Math.abs(p - 20) < Math.abs((points[best] ?? 0) - 20) ? i : best),
    0,
  );
}

function play(role: RoleId, mode: 'max' | 'min' | 'near20'): { rank: string; fatal: boolean; raw: number } {
  const started = startPlay(
    scenario,
    role,
    1,
    { comment: '', predictedHours: null },
    '2026-11-13T00:00:00.000Z',
    refs,
  );
  let state = started.state;
  let next = started.next;
  let guard = 0;
  while (next !== 'ending' && guard < 400) {
    guard += 1;
    if (next === 'point') {
      const point = currentPoint(state, scenario);
      if (!point) throw new Error(`${role}: 判断ポイントがない`);
      const choice = point.choices[pickIndex(point.choices.map((c) => c.points), mode)];
      if (!choice) throw new Error(`${role}: 選択肢がない`);
      const step = choose(state, scenario, choice.id);
      state = step.state;
      next = step.next;
    } else if (next === 'draft') {
      const key = state.pendingDraft;
      const draft = key ? roles[role].drafts?.[key] : undefined;
      if (!draft) throw new Error(`${role}: 文案がない`);
      const selections: Record<string, string> = {};
      for (const slot of draft.slots) {
        if (slot.auto) continue;
        const options = slot.options ?? slot.items ?? [];
        if (options.length === 0) continue;
        const picked = options[pickIndex(options.map((o) => o.points), mode)];
        if (picked) selections[slot.id] = picked.id;
      }
      const step = submitDraft(state, scenario, selections);
      state = step.state;
      next = step.next;
    } else if (next === 'press') {
      const opened = startPress(state, scenario);
      state = opened.state;
      next = opened.next;
      while (next === 'press') {
        const answers = availableAnswers(state, scenario);
        const answer = answers[pickIndex(answers.map((a) => a.points), mode)];
        const step = answerPress(state, scenario, answer?.id ?? null);
        state = step.state;
        next = step.next;
      }
    } else {
      throw new Error(`${role}: 未知の遷移 ${String(next)}`);
    }
  }
  const result = computeResult(state, scenario);
  return { rank: result.rank, fatal: result.fatal, raw: result.raw };
}

describe('scenario no14-poppo', () => {
  it('メタ情報と架空の会社・人物が揃っている', () => {
    expect(scenario.id).toBe('no14-poppo');
    expect(scenario.languages).toEqual(['ja']);
    expect(scenario.sourcePeriod.ja).toContain('フィクション');
    expect(scenario.company.people.length).toBeGreaterThanOrEqual(5);
    expect(scenario.start.minutes % 15).toBe(0);
    expect(scenario.roles.executive).toBeDefined();
    expect(scenario.roles.officer).toBeDefined();
    expect(scenario.roles.lead).toBeDefined();
    expect(scenario.roles.analyst).toBeDefined();
    for (const rank of ['S', 'A', 'B', 'C', 'D'] as const) {
      expect(scenario.endings[rank].bgm).toBe(`ending_${rank.toLowerCase()}`);
      expect(scenario.endings[rank].text.ja).toContain('被害の責任は攻撃者にある');
    }
  });

  for (const role of roleIds) {
    describe(role, () => {
      const script = roles[role];

      it('判断ポイントは15以上、選択肢と細目の形式が正しい', () => {
        expect(script.points.length).toBeGreaterThanOrEqual(15);
        expect(script.points.length).toBeLessThanOrEqual(role === 'executive' ? 18 : 25);
        const pointIds = new Set<string>();
        let lastAt = 0;
        for (const point of script.points) {
          expect(pointIds.has(point.id), `判断IDの重複: ${point.id}`).toBe(false);
          pointIds.add(point.id);
          expect((PHASES as readonly string[]).includes(point.phase), `${point.id} の phase`).toBe(true);
          expect(point.choices.length).toBeGreaterThanOrEqual(3);
          if (point.at) {
            expect(point.at.minutes % 15, `${point.id} の at`).toBe(0);
            const abs = point.at.day * 1440 + point.at.minutes;
            expect(abs, `${point.id} の時刻が戻っている`).toBeGreaterThanOrEqual(lastAt);
            lastAt = abs;
          }
          for (const choice of point.choices) {
            expect(choice.minutes % 15, `${choice.id} の minutes`).toBe(0);
            const [min, max] = CATEGORY_RANGE[choice.category];
            expect(choice.points, `${choice.id} の点数`).toBeGreaterThanOrEqual(min);
            expect(choice.points, `${choice.id} の点数`).toBeLessThanOrEqual(max);
            expect(choice.refs.length, `${choice.id} の refs`).toBeGreaterThan(0);
            for (const ref of choice.refs) expect(refIds.has(ref), `${choice.id}: ${ref}`).toBe(true);
          }
        }
      });

      it('細目は80以上、±1〜20、IDは一意、6軸を使い、根拠がある', () => {
        const items = detailItems(script);
        expect(items.length).toBeGreaterThanOrEqual(80);
        const ids = new Set<string>();
        const axes = new Set<string>();
        for (const item of items) {
          expect(ids.has(item.id), `細目IDの重複: ${item.id}`).toBe(false);
          ids.add(item.id);
          expect(Math.abs(item.points)).toBeGreaterThanOrEqual(1);
          expect(Math.abs(item.points)).toBeLessThanOrEqual(20);
          axes.add(item.axis);
          expect(item.refs.length).toBeGreaterThan(0);
          for (const ref of item.refs) expect(refIds.has(ref), `${item.id}: ${ref}`).toBe(true);
        }
        for (const axis of ['time', 'order', 'wording', 'content', 'record', 'care']) {
          expect(axes.has(axis), `軸 ${axis} の細目がない`).toBe(true);
        }
      });

      it('選択肢の長さが揃い、最高点の位置が偏らない', () => {
        const positions = new Map<number, number>();
        for (const point of script.points) {
          const lengths = point.choices.map((c) => c.text.ja.length);
          expect(Math.max(...lengths) * 10).toBeLessThanOrEqual(Math.min(...lengths) * 13);
          const top = point.choices.reduce(
            (best, c, i) => (c.points > (point.choices[best]?.points ?? -Infinity) ? i : best),
            0,
          );
          positions.set(top, (positions.get(top) ?? 0) + 1);
        }
        const worst = Math.max(...positions.values());
        expect(worst).toBeLessThan(script.points.length / 2);
      });

      it('報告書の選択肢も長さが揃い、最高点の位置が偏らない', () => {
        for (const draft of Object.values(script.drafts ?? {})) {
          const positions = new Map<number, number>();
          let slots = 0;
          for (const slot of draft.slots) {
            if (!slot.options) continue;
            slots += 1;
            const lengths = slot.options.map((o) => o.text.ja.length);
            expect(Math.max(...lengths) * 10).toBeLessThanOrEqual(Math.min(...lengths) * 13);
            const top = slot.options.reduce(
              (best, o, i) => (o.points > (slot.options?.[best]?.points ?? -Infinity) ? i : best),
              0,
            );
            positions.set(top, (positions.get(top) ?? 0) + 1);
          }
          const worst = Math.max(...positions.values());
          expect(worst).toBeLessThan(slots / 2);
        }
      });

      it('ミスリードは半数以上の判断にあり、型は8種以上', () => {
        const voices = new Map(script.voices.map((v) => [v.id, v]));
        let covered = 0;
        const types = new Set<string>();
        for (const point of script.points) {
          let has = false;
          for (const id of point.voices ?? []) {
            const voice = voices.get(id);
            expect(voice, `声 ${id} が見つからない`).toBeTruthy();
            if (voice?.misleading) {
              has = true;
              expect(voice.type).toBeTruthy();
              expect((MISLEADING_TYPES as readonly string[]).includes(voice.type as string)).toBe(true);
              types.add(voice.type as string);
            }
          }
          if (has) covered += 1;
        }
        expect(covered * 2).toBeGreaterThanOrEqual(script.points.length);
        expect(types.size).toBeGreaterThanOrEqual(8);
      });

      it('臆病な選択肢と、臆病ゲージの声、正しい選択の直後の批判がある', () => {
        expect(script.points.flatMap((p) => p.choices).filter((c) => c.coward).length).toBeGreaterThanOrEqual(1);
        const voices = new Map(script.voices.map((v) => [v.id, v]));
        for (const key of ['2', '3', '4'] as const) {
          const voice = voices.get(script.cowardVoices[key]);
          expect(voice, `臆病ゲージ${key}`).toBeTruthy();
          expect(voice?.trigger).toEqual({ at: 'manual' });
        }
        const choices = new Map(script.points.flatMap((p) => p.choices.map((c) => [c.id, c] as const)));
        const after = script.voices.filter((v) => 'at' in v.trigger && v.trigger.at === 'after');
        expect(after.some((v) => {
          const trigger = v.trigger;
          return 'at' in trigger && trigger.at === 'after' && !!trigger.choice
            && (choices.get(trigger.choice)?.points ?? 0) > 0;
        })).toBe(true);
      });

      it('全選択肢にexplain、全判断にlesson、報告書の選択肢にもexplainがある', () => {
        for (const point of script.points) {
          expect(point.lesson?.ja.length ?? 0).toBeGreaterThanOrEqual(80);
          expect(point.lesson?.ja.length ?? 0).toBeLessThanOrEqual(200);
          for (const choice of point.choices) {
            expect(choice.explain?.ja.length ?? 0).toBeGreaterThanOrEqual(40);
            expect(choice.explain?.ja.length ?? 0).toBeLessThanOrEqual(120);
          }
        }
        for (const draft of Object.values(script.drafts ?? {})) {
          for (const slot of draft.slots) {
            for (const option of slot.options ?? []) {
              expect(option.explain?.ja.length ?? 0).toBeGreaterThanOrEqual(40);
              expect(option.explain?.ja.length ?? 0).toBeLessThanOrEqual(120);
            }
          }
        }
      });

      it('法定期限の根拠と doneFlag があり、速報と確報の期限を正しく使う', () => {
        const deadlines = script.deadlines ?? [];
        expect(deadlines.length).toBeGreaterThanOrEqual(2);
        const prelim = deadlines.find((d) => d.ref === 'ppc-report-prelim');
        const final = deadlines.find((d) => d.ref === 'ppc-report-final-malicious');
        expect(prelim).toBeTruthy();
        expect(final).toBeTruthy();
        const choices = script.points.flatMap((p) => p.choices);
        for (const d of deadlines) {
          expect(refIds.has(d.ref), `${d.id} の根拠`).toBe(true);
          expect(choices.some((c) => c.setFlags?.[d.doneFlag]), `${d.doneFlag} を立てる選択肢がない`).toBe(true);
        }
      });

      it('文言は日本語だけで、HTML・ASCIIのカンマとコロンを含まない', () => {
        const blob = JSON.stringify(script);
        const localized = blob.match(/\{"ja":"[^"]*","en":"[^"]*"\}/g) ?? [];
        expect(localized.length).toBeGreaterThan(50);
        for (const raw of localized) {
          const text = JSON.parse(raw) as { ja: string; en: string };
          expect(text.ja.length).toBeGreaterThan(0);
          expect(text.en).toBe('');
          expect(text.ja).not.toMatch(/<[^>]+>|\{@html\}/);
          expect(text.ja).not.toMatch(/[,:]/);
        }
      });
    });
  }

  describe('経路', () => {
    for (const role of roleIds) {
      it(`${role}: 最善でS、最悪でDに届く`, () => {
        const best = play(role, 'max');
        expect(best.fatal).toBe(false);
        expect(best.rank).toBe('S');
        const worst = play(role, 'min');
        expect(worst.rank).toBe('D');
      });

      it(`${role}: 中くらいの選択でもエンディングに着く`, () => {
        const mid = play(role, 'near20');
        expect(Number.isFinite(mid.raw)).toBe(true);
      });
    }
  });

  describe('記者会見', () => {
    it('基本は3問で、記録が必要な回答が1つ以上ある', () => {
      const press = scenario.press;
      expect(press).toBeTruthy();
      expect(press?.questions.length).toBe(3);
      for (const question of press?.questions ?? []) {
        expect(question.answers.length).toBeGreaterThanOrEqual(3);
        expect(question.text.ja.length).toBeGreaterThan(0);
      }
      expect((press?.questions ?? []).some((q) => q.answers.some((a) => !!a.requiresNote))).toBe(true);
    });

    it('条件付きの追加質問が4つあり、嘘の回答をwhenで出し分ける', () => {
      const extra = scenario.press?.extraQuestions ?? [];
      expect(extra.length).toBe(4);
      const keys = extra.flatMap((e) => Object.keys(e.when.flags ?? {}));
      expect(keys).toContain('appStopped');
      expect(keys).toContain('saidNotOurLeak');
      expect(keys).toContain('blamedUsers');
      expect(keys).toContain('fullRefund');
      for (const entry of extra) {
        expect(entry.question.answers.length).toBeGreaterThanOrEqual(3);
      }
      expect((scenario.press?.questions ?? []).some((q) => q.answers.some((a) => a.when !== undefined))).toBe(true);
    });

    it('補償の回答は fullRefund の有無で切り替わる', () => {
      const comp = scenario.press?.questions.find((q) => q.id === 'q-comp');
      expect(comp).toBeTruthy();
      const full = comp?.answers.find((a) => a.id === 'a-comp-full');
      const scope = comp?.answers.find((a) => a.id === 'a-comp-scope');
      expect(full?.when?.flags?.fullRefund).toBe(true);
      expect(scope?.when?.flags?.fullRefund).toBe(false);
    });
  });

  it('禁止リストの実在社名・サービス名・国名を含まない', () => {
    const deny = parse(denylistYaml) as Record<string, string[]>;
    const blob = JSON.stringify(scenario);
    for (const list of [deny.companies, deny.services, deny.people, deny.countries]) {
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word}`).toBe(false);
    }
  });
});
