import { describe, expect, it } from 'vitest';

const svelteSources = import.meta.glob<string>('../../../src/app/**/*.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const storeSource = import.meta.glob<string>('../../../src/app/store.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

function read(name: string): string {
  const found = Object.entries(svelteSources).find(([path]) => path.endsWith(name));
  if (!found) throw new Error(`source not found: ${name}`);
  return found[1] ?? '';
}

const s05 = read('/screens/S05Main.svelte');
const s06 = read('/screens/S06Draft.svelte');
const app = read('/App.svelte');
const captionBar = read('/parts/CaptionBar.svelte');
const store = Object.values(storeSource)[0] ?? '';

describe('記録のID（会見の requiresNote と一致）', () => {
  it('notable はシナリオの id をそのまま記録する', () => {
    expect(s05).toContain('id: item.id');
    expect(s05).not.toMatch(/n:\$\{/);
  });

  it('重複判定も同じ id を使う', () => {
    expect(s05).toMatch(/notes\.some\(\(note\) => note\.id === item\.id\)/);
    expect(s05).toMatch(/notes\.some\(\(note\) => note\.id === n\.id\)/);
  });

  it('自由記述は free-<連番>', () => {
    expect(s05).toContain('nextFreeNoteId(');
    expect(s05).not.toMatch(/`f:\$\{/);
  });
});

describe('演出キューと字幕の一元化', () => {
  it('キュー処理は App.svelte が持つ', () => {
    expect(app).toContain('audio.runCues(');
    expect(app).toContain('runFxCues(');
    expect(app).toContain('claimCues(');
    expect(app).toContain('enqueueCaptions(');
    expect(app).toContain('cueCaptions(');
  });

  it('会見画面が先に音を処理しても字幕は作る', () => {
    expect(app).toContain('claimCaptionCues(');
  });

  it('S05 から重複したキュー処理を消した', () => {
    expect(s05).not.toContain('claimCues(');
    expect(s05).not.toContain('cueCaptions(');
  });

  it('字幕は store の待ち行列と履歴で持つ', () => {
    expect(store).toContain('export const captions');
    expect(store).toContain('export const captionHistory');
    expect(store).toContain('export function enqueueCaptions');
    expect(store).toContain('export function advanceCaption');
    expect(store).toContain('export function resetCaptions');
  });

  it('App は待ち行列の先頭を順に履歴へ送る', () => {
    expect(app).toContain('advanceCaption(');
    expect(app).toContain('$captions[0]');
  });

  it('字幕は S05 と S06 に出す（S07 は別担当）', () => {
    expect(s05).toContain('<CaptionBar');
    expect(s06).toContain('<CaptionBar');
  });

  it('字幕は待ち行列と履歴の両方を表示する', () => {
    expect(captionBar).toContain('$captions[0]');
    expect(captionBar).toContain('$captionHistory');
    expect(captionBar).not.toContain('slice(-3)');
  });
});

describe('攻撃者の場面の注記', () => {
  it('media: attacker の声が出たら犯罪者の注記を出す', () => {
    expect(s05).toContain("notice('criminal')");
    expect(s05).toContain("voice.media === 'attacker'");
  });
});
