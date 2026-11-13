// シェア画像の描画。canvas は fake にして、呼び出し内容だけを確かめる。
import { describe, expect, it } from 'vitest';
import {
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
  canvasToBlob,
  drawShareImage,
  renderShareCanvas,
  truncateToWidth,
  wrapText,
} from '../../../src/app/share/image';
import { makeCard } from './fixtures';

interface Call {
  name: string;
  args: unknown[];
}

interface FakeContext {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
}

function fakeContext(charWidth = 20): FakeContext {
  const calls: Call[] = [];
  const props: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    lineWidth: 1,
  };
  const proxy = new Proxy(props, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      if (prop === 'measureText') {
        return (text: string) => ({ width: Array.from(text).length * charWidth });
      }
      if (typeof prop === 'string') {
        return (...args: unknown[]) => {
          calls.push({ name: prop, args });
        };
      }
      return undefined;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  });
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls };
}

function texts(calls: Call[]): string[] {
  return calls
    .filter((call) => call.name === 'fillText')
    .map((call) => String(call.args[0]));
}

describe('drawShareImage', () => {
  it('1200×630の背景を塗り、題名・ロール・ランク・スコア・タグ・URLを描く', () => {
    const { ctx, calls } = fakeContext();
    drawShareImage(ctx, makeCard());

    expect(calls.some((call) => call.name === 'fillRect'
      && call.args[0] === 0 && call.args[1] === 0
      && call.args[2] === SHARE_IMAGE_WIDTH && call.args[3] === SHARE_IMAGE_HEIGHT)).toBe(true);

    const drawn = texts(calls);
    expect(drawn).toContain('ネビュラクラウド');
    expect(drawn).toContain('経営者 / 2回目');
    expect(drawn).toContain('A');
    expect(drawn).toContain('880');
    expect(drawn).toContain('#じゃあなたがやってみて');
    expect(drawn).toContain('https://example.com/ytcdb');
  });

  it('見出しと称号があれば描く', () => {
    const { ctx, calls } = fakeContext();
    drawShareImage(ctx, makeCard({ headline: '大障害', achievement: '初動の達人' }));
    const drawn = texts(calls);
    expect(drawn).toContain('翌朝の新聞');
    expect(drawn).toContain('大障害');
    expect(drawn).toContain('称号: 初動の達人');
  });

  it('見出しが無ければ見出しの欄を出さない', () => {
    const { ctx, calls } = fakeContext();
    drawShareImage(ctx, makeCard());
    expect(texts(calls)).not.toContain('翌朝の新聞');
  });

  it('挿絵があるときだけ drawImage を呼ぶ', () => {
    const plain = fakeContext();
    drawShareImage(plain.ctx, makeCard());
    expect(plain.calls.some((call) => call.name === 'drawImage')).toBe(false);

    const withImage = fakeContext();
    const image = { width: 1200, height: 630 } as unknown as CanvasImageSource;
    drawShareImage(withImage.ctx, makeCard(), { illustration: image });
    expect(withImage.calls.filter((call) => call.name === 'drawImage')).toHaveLength(1);
  });

  it('英語の見出しラベルを使う', () => {
    const { ctx, calls } = fakeContext();
    drawShareImage(ctx, makeCard({ lang: 'en', headline: 'Outage' }));
    expect(texts(calls)).toContain("Next morning's headline");
    expect(texts(calls)).toContain('Score');
  });

  it('save と restore の数が合う', () => {
    const { ctx, calls } = fakeContext();
    const image = { width: 100, height: 100 } as unknown as CanvasImageSource;
    drawShareImage(ctx, makeCard(), { illustration: image });
    const saves = calls.filter((call) => call.name === 'save').length;
    const restores = calls.filter((call) => call.name === 'restore').length;
    expect(saves).toBe(restores);
  });
});

describe('wrapText', () => {
  it('幅に収まるよう1文字ずつ折り返す', () => {
    const { ctx } = fakeContext();
    expect(wrapText(ctx, 'abcdefghij', 100)).toEqual(['abcde', 'fghij']);
  });

  it('改行はそのまま改行として扱う', () => {
    const { ctx } = fakeContext();
    expect(wrapText(ctx, 'ab\ncd', 100)).toEqual(['ab', 'cd']);
  });
});

describe('truncateToWidth', () => {
  it('幅に収まればそのまま、超えたら「…」を付ける', () => {
    const { ctx } = fakeContext();
    expect(truncateToWidth(ctx, 'abc', 100)).toBe('abc');
    expect(truncateToWidth(ctx, 'abcdefghij', 100)).toBe('abcd…');
  });
});

describe('renderShareCanvas / canvasToBlob', () => {
  it('canvas に描いて PNG を作れる', async () => {
    const { ctx, calls } = fakeContext();
    const canvas = {
      width: SHARE_IMAGE_WIDTH,
      height: SHARE_IMAGE_HEIGHT,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;

    await renderShareCanvas(canvas, makeCard({ illustrationUrl: '' }));
    expect(texts(calls)).toContain('ネビュラクラウド');

    const blob = new Blob(['png'], { type: 'image/png' });
    const fakeCanvas = {
      toBlob: (callback: (value: Blob | null) => void) => callback(blob),
    } as unknown as HTMLCanvasElement;
    expect(await canvasToBlob(fakeCanvas)).toBe(blob);
  });

  it('getContext が無ければ例外、toBlob が無ければ null', async () => {
    const invalid = { width: 1, height: 1, getContext: () => null } as unknown as HTMLCanvasElement;
    await expect(renderShareCanvas(invalid, makeCard({ illustrationUrl: '' }))).rejects.toThrow();
    expect(await canvasToBlob({} as HTMLCanvasElement)).toBeNull();
  });
});
