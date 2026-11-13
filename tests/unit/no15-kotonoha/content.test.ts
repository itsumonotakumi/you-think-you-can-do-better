// No.15 コトノハ（シラカバソフトウェア）/ 4ロール共通のデータ検査。
// 検査ツール（tools/validate）とは別に、担当シナリオの約束をここで固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import scenarioYaml from '../../../scenarios/no15-kotonoha/scenario.yaml?raw';
import executiveYaml from '../../../scenarios/no15-kotonoha/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no15-kotonoha/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no15-kotonoha/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no15-kotonoha/roles/analyst.yaml?raw';
import referencesYaml from '../../../references/references.yaml?raw';
import denylistYaml from '../../../tools/validate/denylist.yaml?raw';
import { CATEGORY_RANGE, MISLEADING_TYPES, PHASES, ROLES } from '../../../src/engine/types';
import type {
  Choice,
  DetailItem,
  Draft,
  Localized,
  Reference,
  RoleId,
  RoleScript,
  Scenario,
  Voice,
} from '../../../src/engine/types';

const base = parse(scenarioYaml) as unknown as Omit<Scenario, 'roles'>;
const roles: Record<RoleId, RoleScript> = {
  executive: parse(executiveYaml) as RoleScript,
  officer: parse(officerYaml) as RoleScript,
  lead: parse(leadYaml) as RoleScript,
  analyst: parse(analystYaml) as RoleScript,
};
const scenario: Scenario = { ...base, roles };
const references = parse(referencesYaml) as Reference[];

const refIds = new Set(references.map((ref) => ref.id));
const refById = new Map(references.map((ref) => [ref.id, ref]));

function detailItems(role: RoleScript): DetailItem[] {
  const fromChoices = role.points.flatMap((p) => p.choices.flatMap((c) => c.items ?? []));
  const fromDrafts = Object.values(role.drafts ?? {}).flatMap((d: Draft) =>
    d.slots.flatMap((s) => [...(s.items ?? []), ...(s.options ?? [])]),
  );
  return [...fromChoices, ...fromDrafts];
}

function collectLocalized(node: unknown, out: Localized[] = []): Localized[] {
  if (Array.isArray(node)) {
    for (const v of node) collectLocalized(v, out);
    return out;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.ja === 'string' && typeof obj.en === 'string') {
      out.push(obj as unknown as Localized);
      return out;
    }
    for (const v of Object.values(obj)) collectLocalized(v, out);
  }
  return out;
}

function expectRefs(refs: string[], where: string): void {
  expect(refs.length, `${where} の refs が空`).toBeGreaterThan(0);
  for (const ref of refs) expect(refIds.has(ref), `${where} の根拠 ${ref} が references にない`).toBe(true);
}

function expectChoice(choice: Choice): void {
  expect(choice.minutes).toBeGreaterThan(0);
  expect(choice.minutes % 15, `${choice.id} の minutes が15の倍数でない`).toBe(0);
  const [min, max] = CATEGORY_RANGE[choice.category];
  expect(choice.points, `${choice.id} の点数が区分 ${choice.category} の範囲外`).toBeGreaterThanOrEqual(min);
  expect(choice.points, `${choice.id} の点数が区分 ${choice.category} の範囲外`).toBeLessThanOrEqual(max);
  expectRefs(choice.refs, choice.id);
  if (choice.category === 'fatal') expect(choice.points).toBeLessThanOrEqual(-200);
  expect(choice.explain?.ja.length, `${choice.id} の explain`).toBeGreaterThanOrEqual(40);
  expect(choice.explain?.ja.length, `${choice.id} の explain`).toBeLessThanOrEqual(120);
}

/** 最高点の選択肢（同点なら null） */
function topIndex(items: { points: number }[]): number | null {
  let top = -1;
  let points = Number.NEGATIVE_INFINITY;
  let tied = false;
  items.forEach((item, index) => {
    if (item.points > points) {
      points = item.points;
      top = index;
      tied = false;
    } else if (item.points === points) {
      tied = true;
    }
  });
  return top < 0 || tied ? null : top;
}

function jaLength(text: Localized | undefined): number {
  return text?.ja.length ?? 0;
}

describe('scenario no15-kotonoha', () => {
  it('メタ情報が契約どおり', () => {
    expect(scenario.id).toBe('no15-kotonoha');
    expect(scenario.languages).toEqual(['ja']);
    expect(scenario.difficulty).toBe(2);
    expect(scenario.start.minutes % 15).toBe(0);
    expect(scenario.sourcePeriod.ja).toContain('2020年代');
    expect(Object.keys(scenario.roles).sort()).toEqual([...ROLES].sort());
    for (const rank of ['S', 'A', 'B', 'C', 'D'] as const) {
      expect(scenario.endings[rank].bgm).toBe(`ending_${rank.toLowerCase()}`);
      expect(scenario.endings[rank].text.ja.length).toBeGreaterThan(20);
    }
    for (const role of ROLES) expect(scenario.roles[role]?.pressEnabled).toBe(true);
  });

  it('実在の企業・サービス・国名を含まず、フィクションとして書かれている', () => {
    const deny = parse(denylistYaml) as Record<string, string[]>;
    const blob = JSON.stringify(scenario);
    for (const list of [deny.companies, deny.services, deny.people, deny.countries]) {
      for (const word of list ?? []) expect(blob.includes(word), `禁止語 ${word} が含まれる`).toBe(false);
    }
    expect(scenario.company.name.ja).toContain('シラカバ');
    for (const person of scenario.company.people) {
      expect(person.name.ja.length).toBeGreaterThan(1);
    }
  });

  it('報告の期限は速報72時間・確報720時間（不正目的ではない）', () => {
    expect(refById.get('ppc-report-prelim')?.deadlineHours).toBe(72);
    expect(refById.get('ppc-report-final')?.deadlineHours).toBe(720);
    for (const role of ROLES) {
      const deadlines = roles[role].deadlines ?? [];
      const prelim = deadlines.find((d) => d.ref === 'ppc-report-prelim');
      const final = deadlines.find((d) => d.ref === 'ppc-report-final');
      expect(prelim, `${role} の速報の期限がない`).toBeTruthy();
      expect(final, `${role} の確報の期限がない`).toBeTruthy();
      expect(deadlines.some((d) => d.ref === 'ppc-report-final-malicious')).toBe(false);
      for (const deadline of [prelim, final]) {
        const setBy = roles[role].points
          .flatMap((p) => p.choices)
          .filter((c) => deadline && c.setFlags?.[deadline.doneFlag]);
        expect(setBy.length, `${role} の ${deadline?.id} を完了する選択肢がない`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('判断ポイントは各ロール15、選択肢・細目・根拠の形式が正しい', () => {
    for (const role of ROLES) {
      const script = roles[role];
      expect(script.points.length, `${role} の判断ポイント数`).toBe(15);
      const pointIds = new Set<string>();
      let lastAt = 0;
      for (const point of script.points) {
        expect(pointIds.has(point.id), `判断ポイントIDの重複: ${point.id}`).toBe(false);
        pointIds.add(point.id);
        expect((PHASES as readonly string[]).includes(point.phase), `${point.id} の phase`).toBe(true);
        expect(point.choices.length, `${point.id} の選択肢数`).toBeGreaterThanOrEqual(3);
        expect(point.lesson?.ja.length, `${point.id} の lesson`).toBeGreaterThanOrEqual(80);
        expect(point.lesson?.ja.length, `${point.id} の lesson`).toBeLessThanOrEqual(200);
        if (point.at) {
          expect(point.at.minutes % 15).toBe(0);
          const abs = point.at.day * 1440 + point.at.minutes;
          expect(abs, `${point.id} の時刻が戻っている`).toBeGreaterThanOrEqual(lastAt);
          lastAt = abs;
        }
        for (const choice of point.choices) expectChoice(choice);
      }

      const items = detailItems(script);
      expect(items.length, `${role} の細目数`).toBeGreaterThanOrEqual(80);
      const ids = new Set<string>();
      for (const item of items) {
        expect(ids.has(item.id), `細目IDの重複: ${item.id}`).toBe(false);
        ids.add(item.id);
        expect(Math.abs(item.points), `${item.id} の点数`).toBeGreaterThanOrEqual(1);
        expect(Math.abs(item.points), `${item.id} の点数`).toBeLessThanOrEqual(20);
        expect(['time', 'order', 'wording', 'content', 'record', 'care']).toContain(item.axis);
        expectRefs(item.refs, item.id);
      }
      const axes = new Set(items.map((item) => item.axis));
      for (const axis of ['time', 'order', 'wording', 'content', 'record', 'care']) {
        expect(axes.has(axis as DetailItem['axis']), `${role} に軸 ${axis} の細目がない`).toBe(true);
      }
    }
  });

  it('報告書の選択肢にも explain があり、細目が十分にある', () => {
    for (const role of ROLES) {
      const drafts = Object.values(roles[role].drafts ?? {});
      expect(drafts.length, `${role} の報告書`).toBeGreaterThanOrEqual(1);
      for (const draft of drafts) {
        for (const slot of draft.slots) {
          for (const option of slot.options ?? []) {
            expect(option.explain?.ja.length, `${option.id} の explain`).toBeGreaterThanOrEqual(40);
            expect(option.explain?.ja.length, `${option.id} の explain`).toBeLessThanOrEqual(120);
            expectRefs(option.refs, option.id);
          }
          for (const item of slot.items ?? []) expectRefs(item.refs, item.id);
        }
      }
    }
  });

  it('正解が本文の長さで分からない（最長と最短の差が1.3倍以内）', () => {
    for (const role of ROLES) {
      const script = roles[role];
      const groups = [
        ...script.points.map((p) => ({ label: p.id, items: p.choices })),
        ...Object.values(script.drafts ?? {}).flatMap((d) =>
          d.slots.filter((s) => (s.options ?? []).length >= 2).map((s) => ({ label: s.id, items: s.options ?? [] })),
        ),
      ];
      for (const group of groups) {
        const lengths = group.items.map((item) => jaLength(item.text));
        const shortest = Math.min(...lengths);
        const longest = Math.max(...lengths);
        expect(longest * 10, `${role}/${group.label}: 選択肢の長さが揃っていない（${shortest}〜${longest}）`)
          .toBeLessThanOrEqual(shortest * 13);

        const top = topIndex(group.items);
        if (top === null) continue;
        const topLength = jaLength(group.items[top]?.text);
        const longestOther = Math.max(...group.items.filter((_, i) => i !== top).map((item) => jaLength(item.text)));
        expect(topLength * 10, `${role}/${group.label}: 最高点が長すぎる（${topLength} vs ${longestOther}）`)
          .toBeLessThan(longestOther * 13);
      }
    }
  });

  it('最高点の位置がロール内で偏っていない', () => {
    for (const role of ROLES) {
      const script = roles[role];
      const pointPositions = script.points
        .map((p) => topIndex(p.choices))
        .filter((index): index is number => index !== null)
        .map((index) => index + 1);
      const slotPositions = Object.values(script.drafts ?? {})
        .flatMap((d: Draft) => d.slots)
        .filter((s) => (s.options ?? []).length >= 2)
        .map((s) => topIndex(s.options ?? []))
        .filter((index): index is number => index !== null)
        .map((index) => index + 1);
      for (const positions of [pointPositions, slotPositions]) {
        if (positions.length === 0) continue;
        const counts = new Map<number, number>();
        for (const position of positions) counts.set(position, (counts.get(position) ?? 0) + 1);
        const worst = Math.max(...counts.values());
        expect(worst, `${role} で最高点の位置が偏っている（${positions.join(',')}）`)
          .toBeLessThan(positions.length / 2);
      }
    }
  });

  it('ミスリードは判断ポイントの半数以上で、型を13種すべて使う', () => {
    const allTypes = new Set<string>();
    for (const role of ROLES) {
      const script = roles[role];
      const voicesById = new Map(script.voices.map((v) => [v.id, v]));
      for (const voice of script.voices) {
        if (voice.misleading) {
          expect((MISLEADING_TYPES as readonly string[]).includes(voice.type as string), `${role}: ${voice.id} の型`).toBe(true);
          allTypes.add(voice.type as string);
        }
      }
      let covered = 0;
      for (const point of script.points) {
        const has = (point.voices ?? []).some((id) => {
          const voice = voicesById.get(id);
          expect(voice, `${role}: 声 ${id} が見つからない`).toBeTruthy();
          return voice?.misleading === true;
        });
        if (has) covered += 1;
      }
      expect(covered * 2, `${role} のミスリードの網羅`).toBeGreaterThanOrEqual(script.points.length);
    }
    for (const type of MISLEADING_TYPES) expect(allTypes.has(type), `ミスリード型 ${type} がない`).toBe(true);
  });

  it('臆病ゲージと、正しい選択の直後の批判がある', () => {
    for (const role of ROLES) {
      const script = roles[role];
      const voicesById = new Map(script.voices.map((v) => [v.id, v]));
      expect(script.points.flatMap((p) => p.choices).some((c) => c.coward), `${role}: coward の選択肢`).toBe(true);
      for (const key of ['2', '3', '4'] as const) {
        const voice = voicesById.get(script.cowardVoices[key]);
        expect(voice, `${role}: 臆病ゲージ${key}の声`).toBeTruthy();
        expect(voice?.trigger).toEqual({ at: 'manual' });
      }
      const choiceById = new Map(script.points.flatMap((p) => p.choices.map((c) => [c.id, c] as const)));
      const after = script.voices.filter((v: Voice) => 'at' in v.trigger && v.trigger.at === 'after');
      const criticisesGood = after.some((voice) => {
        const trigger = voice.trigger;
        if (!('at' in trigger) || trigger.at !== 'after' || !trigger.choice) return false;
        const choice = choiceById.get(trigger.choice);
        return !!choice && choice.points > 0;
      });
      expect(criticisesGood, `${role}: 正しい選択の直後の批判`).toBe(true);
    }
  });

  it('記者会見は5問と条件付きの追加質問で、記録が要る回答の記録が各ロールにある', () => {
    const press = scenario.press;
    expect(press).toBeTruthy();
    expect(press?.questions.length).toBe(5);
    for (const q of press?.questions ?? []) {
      expect(q.answers.length).toBeGreaterThanOrEqual(2);
      expect(q.seconds).toBeGreaterThanOrEqual(20);
      expect(q.seconds).toBeLessThanOrEqual(45);
    }
    const extras = press?.extraQuestions ?? [];
    expect(extras.length).toBeGreaterThanOrEqual(2);
    expect(extras.some((e) => e.when.flags?.hidFromCustomer === true)).toBe(true);
    expect(extras.some((e) => e.when.flags?.deletionRequested === false)).toBe(true);
    expect(extras.some((e) => e.when.flags?.deletionRequested === true)).toBe(true);

    const noteIds = new Set(
      (press?.questions ?? [])
        .flatMap((q) => q.answers)
        .map((a) => a.requiresNote)
        .filter((id): id is string => typeof id === 'string'),
    );
    for (const extra of extras) {
      for (const answer of extra.question.answers) {
        if (typeof answer.requiresNote === 'string') noteIds.add(answer.requiresNote);
      }
    }
    expect(noteIds.size).toBeGreaterThanOrEqual(4);
    for (const role of ROLES) {
      const notableIds = new Set(
        roles[role].points.flatMap((p) => (p.notable ?? []).map((n) => n.id)),
      );
      for (const noteId of noteIds) {
        expect(notableIds.has(noteId), `${role}: 記者会見で使う記録 ${noteId} がない`).toBe(true);
      }
    }
  });

  it('嘘の回答は when の条件で出し分ける', () => {
    const extras = scenario.press?.extraQuestions ?? [];
    for (const extra of extras) {
      for (const answer of extra.question.answers) {
        if (answer.when) expect(answer.when.flags).toBeTruthy();
      }
    }
    const deleteFalse = extras.find((e) => e.when.flags?.deletionRequested === false);
    const deleteTrue = extras.find((e) => e.when.flags?.deletionRequested === true);
    expect(deleteFalse?.question.id).not.toBe(deleteTrue?.question.id);
    expect(deleteFalse?.question.answers.some((a) => a.points < -100)).toBe(true);
    expect(deleteTrue?.question.answers.some((a) => a.points > 50)).toBe(true);
  });

  it('文言は日本語のみで、HTMLを含まない', () => {
    const localized = collectLocalized(scenario);
    expect(localized.length).toBeGreaterThan(200);
    for (const text of localized) {
      expect(text.ja.length, 'ja が空').toBeGreaterThan(0);
      expect(text.en, 'v1 は英語本文を持たない').toBe('');
      expect(text.ja).not.toMatch(/<[^>]+>|\{@html\}/);
    }
  });
});
