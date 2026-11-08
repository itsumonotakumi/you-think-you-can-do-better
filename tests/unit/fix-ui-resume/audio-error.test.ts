// 音の読み込み失敗を購読できること（S10 の警告表示が使う）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioAsset } from '../../../src/engine/types';

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};

  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        cancelScheduledValues() {},
      },
      connect() {},
      disconnect() {},
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      onended: null,
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    };
  }

  async resume() {}

  async decodeAudioData(): Promise<ArrayBuffer> {
    throw new Error('decode は使わない');
  }
}

const asset = (id: string, kind: AudioAsset['kind'], file: string): AudioAsset => ({
  id,
  kind,
  file,
  loop: kind === 'bgm',
  title: id,
  author: '',
  site: '',
  url: '',
  termsUrl: '',
  termsCheckedAt: '',
  conditions: {
    game: true,
    free: true,
    modify: true,
    creditRequired: false,
    creditText: '',
    themeOk: true,
    redistribution: '',
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../../../src/data/loader');
  vi.resetModules();
});

describe('audio.onLoadError', () => {
  it('読み込み失敗を購読者へ知らせ、解除できる', async () => {
    vi.resetModules();
    vi.doMock('../../../src/data/loader', () => ({
      loadAudioManifest: async () => [
        asset('calm', 'bgm', 'bgm/calm.mp3'),
        asset('press', 'bgm', 'bgm/press.mp3'),
        asset('select', 'se', 'se/select.mp3'),
      ],
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    vi.stubGlobal('AudioContext', FakeAudioContext);

    const { audio } = await import('../../../src/audio');
    const calls: number[] = [];
    const off = audio.onLoadError(() => calls.push(1));

    await audio.unlock();
    audio.playBgm('calm');
    await vi.waitFor(() => expect(calls.length).toBe(1));
    expect(audio.hasLoadError()).toBe(true);

    expect(typeof off).toBe('function');
    off();
    expect(() => off()).not.toThrow();
  });

  it('購読していなければ失敗しても例外にならない', async () => {
    vi.resetModules();
    vi.doMock('../../../src/data/loader', () => ({
      loadAudioManifest: async () => [asset('calm', 'bgm', 'bgm/calm.mp3')],
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    vi.stubGlobal('AudioContext', FakeAudioContext);

    const { audio } = await import('../../../src/audio');
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(() => audio.playBgm('calm')).not.toThrow();
    await vi.waitFor(() => expect(audio.hasLoadError()).toBe(true));
  });
});
