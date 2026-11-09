// No.1 ネビュラクラウド / 選択肢の偏りと解説の検査。
// 文言の長さ・並び順で正解が分からないこと、振り返りの解説が揃っていることを固定する。
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import executiveYaml from '../../../scenarios/no01-nebula/roles/executive.yaml?raw';
import officerYaml from '../../../scenarios/no01-nebula/roles/officer.yaml?raw';
import leadYaml from '../../../scenarios/no01-nebula/roles/lead.yaml?raw';
import analystYaml from '../../../scenarios/no01-nebula/roles/analyst.yaml?raw';
import type { Localized, RoleScript } from '../../../src/engine/types';

const roles: Record<string, RoleScript> = {
  executive: parse(executiveYaml) as RoleScript,
  officer: parse(officerYaml) as RoleScript,
  lead: parse(leadYaml) as RoleScript,
  analyst: parse(analystYaml) as RoleScript,
};

function bestIndex(points: { points: number }[]): number {
  const max = Math.max(...points.map((p) => p.points));
  return points.findIndex((p) => p.points === max);
}

function assertLocalized(text: Localized | undefined, where: string, min: number, max: number): void {
  expect(text, `${where} がない`).toBeTruthy();
  expect(text?.en, `${where} の en は空にする`).toBe('');
  expect(text?.ja.length, `${where} の長さ`).toBeGreaterThanOrEqual(min);
  expect(text?.ja.length, `${where} の長さ`).toBeLessThanOrEqual(max);
}

for (const [name, role] of Object.entries(roles)) {
  describe(`${name}: 選択肢の長さと並び`, () => {
    it('各判断の選択肢の長さが揃っている（最長と最短の差が1.3倍以内）', () => {
      for (const point of role.points) {
        const lengths = point.choices.map((c) => c.text.ja.length);
        const ratio = Math.max(...lengths) / Math.min(...lengths);
        expect(ratio, `${point.id} の長さ差 ${lengths.join(',')}`).toBeLessThanOrEqual(1.3);
      }
    });

    it('最高点の選択肢が、いつも最長の文になっていない', () => {
      const points = role.points;
      let strictLongest = 0;
      for (const point of points) {
        const index = bestIndex(point.choices);
        const lengths = point.choices.map((c) => c.text.ja.length);
        const bestLength = lengths[index];
        const isUniqueLongest =
          bestLength === Math.max(...lengths) && lengths.filter((l) => l === bestLength).length === 1;
        if (isUniqueLongest) strictLongest += 1;
      }
      expect(strictLongest / points.length, `${name} で最長が正解になる割合`).toBeLessThanOrEqual(0.5);
      expect(strictLongest, 'どこかで低い点の選択肢が最長になっている').toBeGreaterThan(0);
    });

    it('最高点の位置が特定の順番に偏っていない', () => {
      const count: Record<number, number> = {};
      let maxChoices = 0;
      for (const point of role.points) {
        count[bestIndex(point.choices) + 1] = (count[bestIndex(point.choices) + 1] ?? 0) + 1;
        maxChoices = Math.max(maxChoices, point.choices.length);
      }
      expect(Object.keys(count).length, '正解の位置が1か所しかない').toBeGreaterThanOrEqual(3);
      for (const position of Object.keys(count)) {
        expect((count[Number(position)] ?? 0) / role.points.length, `正解が${position}番目に偏っている`).toBeLessThanOrEqual(0.5);
      }
      expect(maxChoices).toBeLessThanOrEqual(5);
    });

    it('選択肢のIDが重複しない', () => {
      for (const point of role.points) {
        const ids = point.choices.map((c) => c.id);
        expect(new Set(ids).size, `${point.id} の選択肢ID`).toBe(ids.length);
      }
    });
  });

  describe(`${name}: 振り返りの解説`, () => {
    it('各選択肢に40〜120字の解説がある', () => {
      for (const point of role.points) {
        for (const choice of point.choices) {
          assertLocalized(choice.explain, `${choice.id} の explain`, 40, 120);
        }
      }
    });

    it('各判断に80〜200字の lesson がある', () => {
      for (const point of role.points) {
        assertLocalized(point.lesson, `${point.id} の lesson`, 80, 200);
      }
    });

    it('文案作成の各選択肢にも40〜120字の解説がある', () => {
      for (const [key, draft] of Object.entries(role.drafts ?? {})) {
        for (const slot of draft.slots) {
          for (const option of slot.options ?? []) {
            assertLocalized(option.explain, `${key}/${slot.id}/${option.id} の explain`, 40, 120);
          }
        }
      }
    });

    it('文案作成の選択肢の長さも揃っている', () => {
      for (const [key, draft] of Object.entries(role.drafts ?? {})) {
        for (const slot of draft.slots) {
          if (!slot.options) continue;
          const lengths = slot.options.map((o) => o.text.ja.length);
          const ratio = Math.max(...lengths) / Math.min(...lengths);
          expect(ratio, `${key}/${slot.id} の長さ差 ${lengths.join(',')}`).toBeLessThanOrEqual(1.3);
        }
      }
    });

    it('文案作成の最高点が、いつも1番目に置かれていない', () => {
      const positions: number[] = [];
      for (const draft of Object.values(role.drafts ?? {})) {
        for (const slot of draft.slots) {
          if (!slot.options) continue;
          positions.push(bestIndex(slot.options) + 1);
        }
      }
      expect(positions.length).toBeGreaterThan(0);
      expect(new Set(positions).size, '1番目に固定されている').toBeGreaterThanOrEqual(2);
      for (const position of new Set(positions)) {
        const share = positions.filter((p) => p === position).length / positions.length;
        expect(share, `最高点が${position}番目に偏っている`).toBeLessThanOrEqual(0.6);
      }
    });
  });
}
