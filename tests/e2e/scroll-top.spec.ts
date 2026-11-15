import { expect, test } from '@playwright/test';

test('画面が切り替わると一番上から表示される', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    document.body.style.minHeight = '4000px';
    window.scrollTo(0, 1500);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  // クリックによる自動スクロールを避けるため、スクロール位置を保ったまま押す
  await page.getByRole('button', { name: '設定', exact: true }).dispatchEvent('click');
  await expect(page.locator('[data-screen="S10Settings"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
