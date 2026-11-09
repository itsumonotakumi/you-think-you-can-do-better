// イラストの組み込みを、ソースの段階で確認する（画像そのものは E2E で見る）。
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('../../../src/app/screens/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function read(name: string): string {
  const found = Object.entries(sources).find(([path]) => path.endsWith(`/${name}.svelte`));
  if (!found) throw new Error(`source not found: ${name}`);
  return found[1] ?? '';
}

const s02 = read('S02Prologue');
const s03 = read('S03ScenarioSelect');
const s04 = read('S04RoleSelect');
const s05 = read('S05Main');
const s07 = read('S07Press');

describe('画面ごとのイラスト', () => {
  it('S02 は冒頭に場面画像を出す', () => {
    expect(s02).toContain('keyVisual(');
    expect(s02).toMatch(/width="1280"/);
    expect(s02).toMatch(/height="721"/);
  });

  it('S03 はカードに場面画像を遅延読み込みする', () => {
    expect(s03).toContain('keyVisual(');
    expect(s03).toContain('loading="lazy"');
    expect(s03).toMatch(/width="1280"/);
    expect(s03).toMatch(/height="721"/);
  });

  it('S04 はロールごとに人物画を出す', () => {
    expect(s04).toContain('portrait(');
    expect(s04).toMatch(/width="480"/);
    expect(s04).toMatch(/height="480"/);
  });

  it('S05 は上部に自分のロールの人物画を出す', () => {
    expect(s05).toContain('portrait(');
    expect(s05).toMatch(/width="480"/);
    expect(s05).toMatch(/height="480"/);
    expect(s05).toMatch(/\.game-bar__portrait/);
  });

  it('S07 は冒頭に記者会見の画像を出す', () => {
    expect(s07).toContain('pressImage(');
    expect(s07).toMatch(/width="1280"/);
    expect(s07).toMatch(/height="721"/);
  });

  it('読み込みに失敗したら隠す', () => {
    for (const source of [s02, s03, s04, s05, s07]) {
      expect(source).toContain('onerror=');
      expect(source).toContain("style.display = 'none'");
    }
  });

  it('画像を含む画面も {@html} を使わない', () => {
    for (const source of [s02, s03, s04, s05, s07]) {
      expect(source).not.toContain('{@html');
    }
  });
});
