import { describe, expect, it } from 'vitest';
// @ts-ignore -- @types/node は入れていない（依存追加禁止）。Vitest は Node 上で動く。
import { existsSync } from 'node:fs';
import { keyVisual, portrait, pressImage } from '../../../src/app/illustrations';

const SCENARIO_IDS = [
  'no01-nebula', 'no02-paybridge', 'no03-yamabiko', 'no04-goride', 'no05-kogane',
  'no06-amatsu', 'no07-connectcall', 'no08-kaname', 'no09-hamakaze', 'no10-nexus',
];
const ROLES = ['executive', 'officer', 'lead', 'analyst'];

function fileExists(relative: string): boolean {
  return existsSync(new URL(`../../../public/${relative}`, import.meta.url).pathname);
}

describe('イラストの URL', () => {
  it('BASE_URL を前置した相対パスを返す', () => {
    const url = keyVisual('no01-nebula');
    expect(url).toBeDefined();
    expect(url).toMatch(/illustrations\/no01-nebula-key\.webp$/);
    expect(url?.startsWith(import.meta.env.BASE_URL)).toBe(true);
  });

  it('人物画の名前は <scenarioId>-<role>.webp', () => {
    expect(portrait('no01-nebula', 'executive'))
      .toMatch(/illustrations\/no01-nebula-executive\.webp$/);
  });

  it('記者会見の画像は press.webp', () => {
    expect(pressImage()).toMatch(/illustrations\/press\.webp$/);
  });

  it('外部 URL を組み立てない', () => {
    for (const url of [keyVisual('no01-nebula'), portrait('no01-nebula', 'lead'), pressImage()]) {
      expect(url).not.toMatch(/^https?:/);
      expect(url).not.toContain('..');
    }
  });
});

describe('不正な id の拒否', () => {
  const badIds = [
    '', '..', '../etc/passwd', 'no01/nebula', 'no01 nebula', 'no01_nebula',
    'no01-nebula.webp', 'no01-nebula?x=1', 'ＮＯ01',
  ];

  for (const id of badIds) {
    it(`keyVisual(${JSON.stringify(id)}) は null`, () => {
      expect(keyVisual(id)).toBeNull();
    });

    it(`portrait(${JSON.stringify(id)}, 'executive') は null`, () => {
      expect(portrait(id, 'executive')).toBeNull();
    });
  }

  it('role に使えない文字が入れば null', () => {
    expect(portrait('no01-nebula', 'admin!')).toBeNull();
    expect(portrait('no01-nebula', '../executive')).toBeNull();
    expect(portrait('no01-nebula', '')).toBeNull();
  });
});

describe('用意済みの画像ファイル', () => {
  it('10シナリオの場面画像がある', () => {
    for (const id of SCENARIO_IDS) {
      expect(fileExists(`illustrations/${id}-key.webp`), id).toBe(true);
    }
  });

  it('40枚の人物画がある', () => {
    for (const id of SCENARIO_IDS) {
      for (const role of ROLES) {
        expect(fileExists(`illustrations/${id}-${role}.webp`), `${id}/${role}`).toBe(true);
      }
    }
  });

  it('記者会見の画像がある', () => {
    expect(fileExists('illustrations/press.webp')).toBe(true);
  });
});
