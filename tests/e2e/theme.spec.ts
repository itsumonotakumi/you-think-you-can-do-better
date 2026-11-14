// 配色: 既定は白背景、設定でダークに切り替わり、再読み込み後も残る。
import { expect, test } from '@playwright/test';
import { openTitle } from './helpers';

test.describe('テーマ', () => {
  test('既定はライト、設定でダークにすると再読み込み後も維持される', async ({ page }) => {
    await openTitle(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: '設定' }).click();
    await expect(page.locator('[data-screen="S10Settings"]')).toBeVisible();

    await page.locator('#set-theme').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // 開いていた画面（設定）に戻る
    await expect(page.locator('[data-screen="S10Settings"]')).toBeVisible();
  });
});
