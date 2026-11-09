// No.10 ネクサス半導体 / 選択肢の偏り（位置・長さ）と解説の検査。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import executiveYaml from '../../../scenarios/no10-nexus/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no10-nexus/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no10-nexus/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no10-nexus/roles/analyst.yaml?raw';
import type { Draft, RoleScript } from '../../../src/engine/types';

const roles: Record<string, RoleScript> = {
  executive: parse(executiveYaml) as unknown as RoleScript,
  officer: parse(officerYaml) as unknown as RoleScript,
  lead: parse(leadYaml) as unknown as RoleScript,
  analyst: parse(analystYaml) as unknown as RoleScript,
};

const expected = {
  executive: { points: 17, choices: 68, draftOptions: 28 },
  officer: { points: 19, choices: 63, draftOptions: 72 },
  lead: { points: 20, choices: 80, draftOptions: 41 },
  analyst: { points: 20, choices: 81, draftOptions: 86 },
} as const;

function bestIndex(items: { points: number }[]): number {
  return items.reduce((best, item, index) => (item.points > items[best]!.points ? index : best), 0);
}

function ratio(values: number[]): number {
  return Math.max(...values) / Math.min(...values);
}

function optionsOf(role: RoleScript): { draft: string; slot: string; options: Draft['slots'][number]['options'] }[] {
  return Object.entries(role.drafts ?? {}).flatMap(([draftKey, draft]) =>
    draft.slots
      .filter((slot) => (slot.options ?? []).length > 0)
      .map((slot) => ({ draft: draftKey, slot: slot.id, options: slot.options })),
  );
}

describe('本文の長さ', () => {
  for (const [name, role] of Object.entries(roles)) {
    it(`${name}: 各判断の選択肢の長さが1.3倍以内`, () => {
      for (const point of role.points) {
        const lengths = point.choices.map((choice) => choice.text.ja.length);
        expect(ratio(lengths), `${point.id} の長さ: ${lengths.join(' / ')}`).toBeLessThanOrEqual(1.3);
      }
    });

    it(`${name}: 報告書の各スロットも1.3倍以内`, () => {
      for (const { draft, slot, options } of optionsOf(role)) {
        const lengths = options!.map((option) => option.text.ja.length);
        expect(ratio(lengths), `${draft}/${slot} の長さ: ${lengths.join(' / ')}`).toBeLessThanOrEqual(1.3);
      }
    });
  }
});

describe('解説と振り返り', () => {
  for (const [name, role] of Object.entries(roles)) {
    it(`${name}: 全選択肢に40〜120字の explain がある`, () => {
      const choices = role.points.flatMap((point) => point.choices);
      expect(choices.length).toBe(expected[name as keyof typeof expected].choices);
      for (const choice of choices) {
        expect(choice.explain, `${choice.id} に explain がない`).toBeTruthy();
        expect(choice.explain!.ja.length, `${choice.id} の explain`).toBeGreaterThanOrEqual(40);
        expect(choice.explain!.ja.length, `${choice.id} の explain`).toBeLessThanOrEqual(120);
        expect(choice.explain!.en).toBe('');
      }
    });

    it(`${name}: 全判断に80〜200字の lesson がある`, () => {
      expect(role.points.length).toBe(expected[name as keyof typeof expected].points);
      for (const point of role.points) {
        expect(point.lesson, `${point.id} に lesson がない`).toBeTruthy();
        expect(point.lesson!.ja.length, `${point.id} の lesson`).toBeGreaterThanOrEqual(80);
        expect(point.lesson!.ja.length, `${point.id} の lesson`).toBeLessThanOrEqual(200);
        expect(point.lesson!.en).toBe('');
      }
    });

    it(`${name}: 報告書の全選択肢に40〜120字の explain がある`, () => {
      const options = optionsOf(role).flatMap(({ options: opts }) => opts!);
      expect(options.length).toBe(expected[name as keyof typeof expected].draftOptions);
      for (const option of options) {
        expect(option.explain, `${option.id} に explain がない`).toBeTruthy();
        expect(option.explain!.ja.length, `${option.id} の explain`).toBeGreaterThanOrEqual(40);
        expect(option.explain!.ja.length, `${option.id} の explain`).toBeLessThanOrEqual(120);
        expect(option.explain!.en).toBe('');
      }
    });

    it(`${name}: 解説にHTMLやASCIIのカンマ・コロンを含まない`, () => {
      const texts = [
        ...role.points.flatMap((point) => [point.lesson!.ja, ...point.choices.map((choice) => choice.explain!.ja)]),
        ...optionsOf(role).flatMap(({ options }) => options!.map((option) => option.explain!.ja)),
      ];
      for (const text of texts) {
        expect(text).not.toMatch(/<[^>]+>|[,:]/);
      }
    });
  }
});

describe('最高点の位置', () => {
  for (const [name, role] of Object.entries(roles)) {
    it(`${name}: 判断の最高点が1か所に偏らない`, () => {
      const counts = new Map<number, number>();
      for (const point of role.points) {
        const position = bestIndex(point.choices) + 1;
        counts.set(position, (counts.get(position) ?? 0) + 1);
      }
      const values = [...counts.values()];
      expect(Math.max(...values) / role.points.length, `位置の分布: ${JSON.stringify([...counts])}`).toBeLessThanOrEqual(0.4);
      expect(values.filter((value) => value > 0).length, `位置の種類: ${JSON.stringify([...counts])}`).toBeGreaterThanOrEqual(3);
      // 以前は3番目が正解になりやすかった。
      expect((counts.get(3) ?? 0) / role.points.length).toBeLessThan(0.4);
    });

    it(`${name}: 報告書の最高点が先頭と末尾に偏らない`, () => {
      const slots = optionsOf(role).filter(({ options }) => (options ?? []).length >= 2);
      const first = slots.filter(({ options }) => bestIndex(options!) === 0).length;
      expect(first / slots.length, `${name} の先頭比率`).toBeGreaterThan(0.3);
      expect(first / slots.length, `${name} の先頭比率`).toBeLessThan(0.7);
      expect(slots.length).toBeGreaterThan(0);
    });
  }
});
