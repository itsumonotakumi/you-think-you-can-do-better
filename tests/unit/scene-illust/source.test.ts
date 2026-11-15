// 挿絵の組み込みをソースの段階で確認する（表示そのものは E2E で見る）。
import { describe, expect, it } from 'vitest';

const screens = import.meta.glob<string>('../../../src/app/screens/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const parts = import.meta.glob<string>('../../../src/app/parts/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function read(files: Record<string, string>, name: string): string {
  const found = Object.entries(files).find(([path]) => path.endsWith(`/${name}.svelte`));
  if (!found) throw new Error(`source not found: ${name}`);
  return found[1] ?? '';
}

const s05 = read(screens, 'S05Main');
const scene = read(parts, 'SceneIllustration');

describe('S05Main の挿絵', () => {
  it('段階の最初の point かどうかを配列の並びで判定する', () => {
    expect(s05).toContain('isFirstPointInPhase');
    expect(s05).toContain('sceneImage(');
    expect(s05).toContain('SceneIllustration');
  });

  it('挿絵は状況の本文より上に出す', () => {
    const image = s05.indexOf('<SceneIllustration');
    const body = s05.indexOf('<Typewriter');
    expect(image).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(-1);
    expect(image).toBeLessThan(body);
  });

  it('段階名の文言を alt に使う', () => {
    expect(s05).toContain("t('sa.images.scene'");
    expect(s05).toContain('common.phase.');
  });

  it('待ち時間やモーダルを足していない', () => {
    expect(s05).not.toContain('setTimeout');
    expect(s05).not.toContain('setInterval(scene');
  });

  it('{@html} を使わない', () => {
    expect(s05).not.toContain('{@html');
  });
});

describe('SceneIllustration', () => {
  it('16:9・横幅いっぱい・非同期デコードで出す', () => {
    expect(scene).toContain('decoding="async"');
    expect(scene).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
    expect(scene).toMatch(/width:\s*100%/);
    expect(scene).not.toContain('loading="lazy"');
  });

  it('読み込みに失敗したら画像ごと消す', () => {
    expect(scene).toContain('onerror=');
    expect(scene).toMatch(/\{#if failedSrc !== src\}/);
  });

  it('短いフェードインを持つ（演出を減らす設定では base.css が止める）', () => {
    expect(scene).toContain('@keyframes scene-fade');
    expect(scene).toContain('0.3s');
  });

  it('{@html} を使わない', () => {
    expect(scene).not.toContain('{@html');
  });
});
