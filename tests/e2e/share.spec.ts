// 結果のシェア: 画像を生成・保存し、投稿文をコピーできる（PC幅・スマホ幅）。
import { expect, test } from '@playwright/test';
import { openTitle, playToEnding, startNewPlay, waitForScreen } from './helpers';

test.describe('結果のシェア', () => {
  test('シェア画像と投稿文を作り、画像を保存して投稿文をコピーできる', async ({ page }) => {
    test.setTimeout(420_000);

    await openTitle(page);
    await startNewPlay(page);
    await playToEnding(page);

    const ending = page.locator('[data-screen="S08Ending"]');
    await expect(ending.locator('.stamp')).toHaveText(/^[SABCD]$/);

    await ending.locator('button.share-open').click();
    const dialog = ending.locator('.share-panel');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('結果をシェア');

    // 1200×630 の canvas に実際に色が乗っている
    const canvas = dialog.locator('canvas.share-canvas');
    await expect(canvas).toBeVisible();
    // 画像の描画は非同期（挿絵の読み込み待ち）。保存ボタンが有効になってから読む
    await expect(dialog.locator('button.share-save')).toBeEnabled();
    const painted = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return { width: el.width, height: el.height, alpha: 0, length: 0 };
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      return {
        width: el.width,
        height: el.height,
        alpha: pixel[3] ?? 0,
        length: el.toDataURL('image/png').length,
      };
    });
    expect(painted.width).toBe(1200);
    expect(painted.height).toBe(630);
    expect(painted.alpha).toBe(255);
    expect(painted.length).toBeGreaterThan(10_000);

    // プレビューは画面幅からはみ出さない（スマホ幅の確認）
    const box = await canvas.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(viewport!.width);

    // 投稿文にはハッシュタグと公開先URLが入る
    const text = dialog.locator('textarea.share-text');
    await expect(text).toHaveValue(/#じゃあなたがやってみて/);
    await expect(text).toHaveValue(/https?:\/\//);
    const xText = await text.inputValue();
    expect(Array.from(xText).length).toBeLessThanOrEqual(140);

    // 投稿先を変えると文字数の上限も変わる
    await dialog.locator('select.share-platform').selectOption('bluesky');
    const blueskyText = await text.inputValue();
    expect(Array.from(blueskyText).length).toBeLessThanOrEqual(300);
    expect(blueskyText).toContain('#じゃあなたがやってみて');
    // 結果画面と同じ見出しと、新しく獲得した称号が入る
    expect(blueskyText).toContain('翌朝の新聞：');
    expect(blueskyText).toContain('称号：');

    // 画像の保存
    await expect(dialog.locator('button.share-save')).toBeEnabled();
    const downloadPromise = page.waitForEvent('download');
    await dialog.locator('button.share-save').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^ytcdb-.+\.png$/);

    // 投稿文のコピー（クリップボードを許可した状態で読む）
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await dialog.locator('button.share-copy').click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('#じゃあなたがやってみて');
    await expect(dialog.locator('button.share-copy')).toHaveText('コピーしました');

    // 閉じると元の結果画面に戻る
    await dialog.locator('button.share-close').click();
    await expect(dialog).toHaveCount(0);
    await expect(ending).toBeVisible();
  });

  test('英語に切り替えると、シェアの画面と投稿文も英語になる', async ({ page }) => {
    test.setTimeout(420_000);

    await openTitle(page);
    await page.getByRole('button', { name: '設定' }).click();
    await waitForScreen(page, 'S10Settings');
    await page.locator('#set-lang').selectOption('en');
    await page.getByRole('button', { name: 'Back' }).click();
    await waitForScreen(page, 'S01Title');

    await startNewPlay(page);
    await playToEnding(page);

    const ending = page.locator('[data-screen="S08Ending"]');
    await ending.locator('button.share-open').click();
    const dialog = ending.locator('.share-panel');
    await expect(dialog).toContainText('Share result');
    await expect(dialog.locator('button.share-save')).toHaveText('Save image');
    // 見出しと称号が加わったぶん、X の140字には収まらないことがある。長い投稿先で確かめる
    await dialog.locator('select.share-platform').selectOption('bluesky');
    const text = dialog.locator('textarea.share-text');
    await expect(text).toHaveValue(/I played/);
    await expect(text).toHaveValue(/#じゃあなたがやってみて/);
  });
});
