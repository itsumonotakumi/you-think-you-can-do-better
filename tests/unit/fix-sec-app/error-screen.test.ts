// エラー画面の「続きから」が S01 と同じ版の確認をするか
import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';

const sources = import.meta.glob<string>('/src/app/screens/ErrorScreen.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const source = Object.values(sources)[0] ?? '';

describe('ErrorScreen の再開', () => {
  it('版が違えば保存を消してシナリオ選択へ戻す', () => {
    expect(source).toContain('versionChanged(progress, sc)');
    expect(source).toContain('saveProgress(null)');
    expect(source).toContain('setPendingNotice(versionChangedNotice(');
    expect(source).toContain("screen.set('S03')");
  });

  it('版が同じなら S01 と同じ再開先へ進む', () => {
    expect(source).toContain('resumeScreen(progress)');
  });

  it('コンパイルできて {@html} を使わない', () => {
    expect(compile(source, { filename: 'ErrorScreen.svelte', generate: 'client' }).js.code.length)
      .toBeGreaterThan(0);
    expect(source).not.toContain('{@html');
  });
});
