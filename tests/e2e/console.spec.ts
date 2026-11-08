// (6) 一通り操作して、コンソールエラーが 0 件であること
import { expect, test } from '@playwright/test';
import {
  openTitle, playToEnding, startNewPlay, waitForScreen,
} from './helpers';

test.describe('コンソール', () => {
  test('タイトル→設定→本編→エンディング→振り返りでエラーが出ない', async ({ page }) => {
    test.setTimeout(300_000);

    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => {
      errors.push(`pageerror: ${error.message}`);
    });

    await openTitle(page);

    // 設定を開いて戻る（文言に依存しないよう構造で選ぶ）
    await page.locator('[data-screen="S01Title"] .row--center button').first().click();
    await waitForScreen(page, 'S10Settings');
    await page.locator('[data-screen="S10Settings"] > div.row > button.btn--ghost').click();
    await waitForScreen(page, 'S01Title');

    // 一周する
    await startNewPlay(page);
    await playToEnding(page);
    await expect(page.locator('[data-screen="S08Ending"] .stamp')).toBeVisible();

    await page.locator('[data-screen="S08Ending"] .actions button.btn--primary').click();
    await waitForScreen(page, 'S09Review');

    expect(errors, `コンソールエラー: ${errors.join(' / ')}`).toEqual([]);
  });
});
