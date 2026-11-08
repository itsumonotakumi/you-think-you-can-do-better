import { describe, it, expect } from 'vitest';
import { audio, nextTensionLevel, resolveAudioUrl } from '../../../src/audio';
import { runFx, runFxCues } from '../../../src/app/effects';
import type { Cue } from '../../../src/engine/types';

describe('audio（AudioContext が無い環境）', () => {
  it('unlock 以降の呼び出しが例外にならず、無音で動く', async () => {
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(() => {
      audio.playBgm('tension_low');
      audio.playSe('notify_sns');
      audio.setVolumes({ bgm: 0.5, se: 0.7, muted: false });
      audio.updateFlame(80);
      audio.runCues([
        { kind: 'bgm', id: 'calm' },
        { kind: 'se', id: 'select' },
        { kind: 'voice', voiceId: 'v1', media: 'sns' },
      ] satisfies Cue[]);
    }).not.toThrow();
  });

  it('manifest が空でも読み込みエラーにしない', async () => {
    await audio.unlock();
    expect(audio.hasLoadError()).toBe(false);
  });

  it('素材の URL は BASE_URL + audio/ + file', () => {
    expect(resolveAudioUrl('bgm/calm.mp3')).toBe(`${import.meta.env.BASE_URL}audio/bgm/calm.mp3`);
    expect(resolveAudioUrl('se/select.mp3')).toBe(`${import.meta.env.BASE_URL}audio/se/select.mp3`);
  });

  it('muted でも例外にならない', async () => {
    await audio.unlock();
    audio.setVolumes({ bgm: 0.5, se: 0.7, muted: true });
    expect(() => {
      audio.playBgm('tension_high');
      audio.playSe('deadline_warn');
    }).not.toThrow();
  });
});

describe('炎上度のヒステリシス', () => {
  it('上がるときは 40・70 で切り替わる', () => {
    expect(nextTensionLevel(0, 0)).toBe(0);
    expect(nextTensionLevel(0, 39)).toBe(0);
    expect(nextTensionLevel(0, 40)).toBe(1);
    expect(nextTensionLevel(1, 69)).toBe(1);
    expect(nextTensionLevel(1, 70)).toBe(2);
    expect(nextTensionLevel(0, 70)).toBe(2);
  });

  it('下がるときは 35・65 を下回ると戻る', () => {
    expect(nextTensionLevel(1, 36)).toBe(1);
    expect(nextTensionLevel(1, 35)).toBe(1);
    expect(nextTensionLevel(1, 34)).toBe(0);
    expect(nextTensionLevel(2, 66)).toBe(2);
    expect(nextTensionLevel(2, 65)).toBe(2);
    expect(nextTensionLevel(2, 64)).toBe(1);
    expect(nextTensionLevel(2, 34)).toBe(0);
  });

  it('境目を行き来しても段階がばたつかない', () => {
    const level = nextTensionLevel(0, 45);
    expect(level).toBe(1);
    expect(nextTensionLevel(level, 38)).toBe(1);
    expect(nextTensionLevel(level, 34)).toBe(0);
  });
});

describe('effects', () => {
  it('document が無い環境でも例外にならない', () => {
    expect(() => {
      runFx('shake');
      runFx('flash', false);
      runFxCues(
        [
          { kind: 'fx', id: 'shake' },
          { kind: 'fx', id: 'flash' },
          { kind: 'fx', id: 'fastforward' },
          { kind: 'fx', id: 'night', on: false },
        ] satisfies Cue[],
        true,
      );
    }).not.toThrow();
  });
});
