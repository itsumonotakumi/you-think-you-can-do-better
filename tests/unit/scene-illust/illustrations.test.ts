import { describe, expect, it } from 'vitest';
import { SCENE_PHASES, sceneImage } from '../../../src/app/illustrations';

const PHASES = ['contain', 'organize', 'investigate', 'notify', 'recover', 'after'];

describe('段階の挿絵の URL', () => {
  it('許可した6つの phase だけ URL を返す', () => {
    expect([...SCENE_PHASES]).toEqual(PHASES);
    for (const phase of PHASES) {
      const url = sceneImage('no01-nebula', phase);
      expect(url, phase).toBeDefined();
      expect(url, phase).toMatch(new RegExp(`illustrations/no01-nebula-scene-${phase}\\.webp$`));
      expect(url?.startsWith(import.meta.env.BASE_URL), phase).toBe(true);
    }
  });

  it('detect はキービジュアルを使うので対象外', () => {
    expect(sceneImage('no01-nebula', 'detect')).toBeNull();
  });

  it('外部 URL を組み立てない', () => {
    for (const phase of PHASES) {
      const url = sceneImage('no01-nebula', phase);
      expect(url).not.toMatch(/^https?:/);
      expect(url).not.toContain('..');
    }
  });
});

describe('不正な phase', () => {
  const badPhases = ['', 'detect', 'CONTAIN', 'contain ', ' contain', 'unknown', 'scene', '../contain',
    'contain/recover', 'contain.webp', 'contain?x=1', 'ｃontain'];

  for (const phase of badPhases) {
    it(`sceneImage('no01-nebula', ${JSON.stringify(phase)}) は null`, () => {
      expect(sceneImage('no01-nebula', phase)).toBeNull();
    });
  }
});

describe('不正な id', () => {
  const badIds = ['', '..', '../etc/passwd', 'no01/nebula', 'no01 nebula', 'no01_nebula',
    'no01-nebula.webp', 'no01-nebula?x=1', 'ＮＯ01'];

  for (const id of badIds) {
    it(`sceneImage(${JSON.stringify(id)}, 'contain') は null`, () => {
      expect(sceneImage(id, 'contain')).toBeNull();
    });
  }
});
