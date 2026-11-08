// (4) 設定で英語に切り替えると UI が英語になる
import { expect, test } from '@playwright/test';
import { DEFECT_I18N, openTitle, waitForScreen } from './helpers';

test.describe('言語切替', () => {
  test('設定で English を選ぶとタイトルと設定画面が英語になる', async ({ page }) => {
    // 不具合1（i18n 未初期化)のため、文言の確認ができない。修正後にこの行を消す。
    test.fixme(true, DEFECT_I18N);

    await openTitle(page);
    await page.getByRole('button', { name: '設定' }).click();
    await waitForScreen(page, 'S10Settings');

    await page.locator('#set-lang').selectOption('en');
    await expect(page.locator('[data-screen="S10Settings"] h1')).toHaveText('Settings');
    await expect(page.locator('label[for="set-lang"]')).toHaveText('Language');
    await expect(page.locator('label[for="set-font"]')).toHaveText('Text size');

    await page.getByRole('button', { name: 'Back' }).click();
    await waitForScreen(page, 'S01Title');

    await expect(page.locator('.title-name')).toHaveText('You Think You Can Do Better?');
    await expect(page.locator('.title-screen button.btn--primary')).toHaveText('Start');
    await expect(page.locator('[data-screen="S01Title"]')).toContainText(
      'In a cyberattack, the criminals who carry it out are the ones at fault.',
    );
  });
});
