// (5) 再読込すると「続きから」が出て、再開できる
import { expect, test } from '@playwright/test';
import {
  DEFECT_I18N, DEFECT_RESUME, openTitle, startNewPlay, waitForScreen,
} from './helpers';

test.describe('続きから', () => {
  test('再読込で「続きから」が出て、押すと本編に戻る', async ({ page }) => {
    // 不具合1（i18n 未初期化）と不具合2（再開後の structuredClone 失敗）のため確認できない。
    // 修正後にこの行を消す。
    test.fixme(true, `${DEFECT_I18N} / ${DEFECT_RESUME}`);
    test.setTimeout(120_000);

    await openTitle(page);
    await startNewPlay(page);

    // 1手だけ進めて、進行中のプレイを保存する
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => window.localStorage.getItem('ytcdb:v1:progress'));
    expect(saved).not.toBeNull();

    await page.reload();
    await waitForScreen(page, 'S01Title');
    const resumeButton = page.getByRole('button', { name: '続きから' });
    await expect(resumeButton).toBeVisible();
    await expect(page.locator('[data-screen="S01Title"]')).toContainText('経営者');

    await resumeButton.click();
    await waitForScreen(page, 'S05Main');
    await expect(page.locator('[data-screen="S05Main"] .play-count')).toHaveText('1回目');

    // 再開後も操作を続けられる（不具合2が起きない）
    await page.keyboard.press('1');
    await page.waitForTimeout(400);
    await expect(page.locator('[data-screen="ErrorScreen"]')).toHaveCount(0);
    await expect(page.locator('[data-screen="S05Main"]')).toBeVisible();
  });
});
