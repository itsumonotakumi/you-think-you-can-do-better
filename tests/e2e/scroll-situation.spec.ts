import { test, expect } from '@playwright/test';
import { startNewPlay } from './helpers';

test('選択肢を選ぶと「状況」まで画面が戻る', async ({ page }) => {
  await page.goto('/');
  await startNewPlay(page);
  const choice = page.locator('[data-screen="S05Main"] .choices button').first();
  await choice.scrollIntoViewIfNeeded();
  await choice.click();
  await expect(page.locator('#situation-heading')).toBeInViewport();
});
