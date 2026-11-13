// 端末機能（クリップボード・Web Share API）の分岐。非対応でも壊れないことを固定する。
import { describe, expect, it, vi } from 'vitest';
import {
  canShareFiles, copyText, shareFiles,
} from '../../../src/app/share/browser';

interface FakeArea {
  value: string;
  style: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  select: () => void;
  remove: () => void;
}

function fakeDocument(execResult: boolean): { doc: Document; area: FakeArea } {
  const area: FakeArea = {
    value: '',
    style: {},
    setAttribute: () => undefined,
    select: () => undefined,
    remove: () => undefined,
  };
  const doc = {
    createElement: () => area,
    body: { appendChild: () => undefined },
    execCommand: () => execResult,
  } as unknown as Document;
  return { doc, area };
}

describe('copyText', () => {
  it('クリップボードが使えるときは writeText を使う', async () => {
    const writeText = vi.fn(async () => undefined);
    const nav = { clipboard: { writeText } } as unknown as Navigator;
    await expect(copyText('投稿文', nav, fakeDocument(true).doc)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('投稿文');
  });

  it('クリップボードが無いときは選択して copy を試す', async () => {
    const { doc, area } = fakeDocument(true);
    const nav = {} as Navigator;
    await expect(copyText('投稿文', nav, doc)).resolves.toBe(true);
    expect(area.value).toBe('投稿文');
  });

  it('どちらも失敗したら false', async () => {
    const nav = {
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    } as unknown as Navigator;
    await expect(copyText('投稿文', nav, fakeDocument(false).doc)).resolves.toBe(false);
  });
});

describe('canShareFiles', () => {
  it('share と canShare の両方があれば共有できる', () => {
    const nav = {
      share: async () => undefined,
      canShare: () => true,
    } as unknown as Navigator;
    expect(canShareFiles(new Blob(['x']), 'share.png', nav)).toBe(true);
  });

  it('Web Share API が無ければ共有しない', () => {
    expect(canShareFiles(new Blob(['x']), 'share.png', {} as Navigator)).toBe(false);
  });
});

describe('shareFiles', () => {
  it('画像・投稿文・URLを渡す', async () => {
    const share = vi.fn(async () => undefined);
    const nav = { share, canShare: () => true } as unknown as Navigator;
    const ok = await shareFiles(new Blob(['x']), 'share.png', '投稿文', 'https://example.com', nav);
    expect(ok).toBe(true);
    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0] as unknown as [ShareData];
    expect(payload[0].text).toBe('投稿文');
    expect(payload[0].url).toBe('https://example.com');
    expect(payload[0].files?.[0]).toBeInstanceOf(File);
  });

  it('共有を拒否されたら false', async () => {
    const nav = {
      share: async () => {
        throw new Error('cancel');
      },
      canShare: () => true,
    } as unknown as Navigator;
    await expect(shareFiles(new Blob(['x']), 'share.png', '投稿文', '', nav)).resolves.toBe(false);
  });

  it('canShare が false なら呼び出さない', async () => {
    const share = vi.fn(async () => undefined);
    const nav = { share, canShare: () => false } as unknown as Navigator;
    await expect(shareFiles(new Blob(['x']), 'share.png', '投稿文', '', nav)).resolves.toBe(false);
    expect(share).not.toHaveBeenCalled();
  });
});
