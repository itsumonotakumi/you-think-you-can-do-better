// (5) 中断してタイトルに戻ると「続きから」が出て、再開できる
// プレイ中は再読み込みで自動的に本編へ戻るため、タイトルへは中断操作で戻って確かめる。
import { expect, test } from '@playwright/test';
import { openTitle, startNewPlay, waitForScreen } from './helpers';

test.describe('続きから', () => {
  test('中断してタイトルに戻ると「続きから」で本編に戻れる', async ({ page }) => {
    test.setTimeout(120_000);

    await openTitle(page);
    await startNewPlay(page);

    // 1手だけ進めて、進行中のプレイを保存する
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => window.localStorage.getItem('ytcdb:v1:progress'));
    expect(saved).not.toBeNull();

    // 中断してタイトルへ（進行中の保存は残る）
    await page.locator('[data-screen="S05Main"] .abort').click();
    await page.locator('[data-screen="S05Main"] .abort-confirm').click();
    await waitForScreen(page, 'S01Title');

    // タイトルで再読み込みしても、タイトルと「続きから」が残る
    await page.reload();
    await waitForScreen(page, 'S01Title');
    const resumeButton = page.getByRole('button', { name: '続きから' });
    await expect(resumeButton).toBeVisible();
    await expect(page.locator('[data-screen="S01Title"]')).toContainText('経営者');

    await resumeButton.click();
    await waitForScreen(page, 'S05Main');
    await expect(page.locator('[data-screen="S05Main"] .play-count')).toHaveText('1回目');

    // 再開後も操作を続けられる
    await page.keyboard.press('1');
    await page.waitForTimeout(400);
    await expect(page.locator('[data-screen="ErrorScreen"]')).toHaveCount(0);
    await expect(page.locator('[data-screen="S05Main"]')).toBeVisible();
  });
});
