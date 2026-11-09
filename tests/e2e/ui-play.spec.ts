// プレイ中の画面の改善（依頼 2・5・6）の確認
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  openReview, openTitle, playToEnding, startNewPlay, waitForScreen,
} from './helpers';

async function htmlClasses(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.className);
}

test.describe('プレイ中の画面', () => {
  test('プロローグは入力せずに始められ、結果画面で空のまま対比される', async ({ page }) => {
    test.setTimeout(300_000);

    await openTitle(page);
    await page.locator('[data-screen="S01Title"] button.btn--primary').first().click();
    await waitForScreen(page, 'S03ScenarioSelect');
    await page.locator('[data-screen="S03ScenarioSelect"] .scenario-card button.btn--primary').first().click();
    await waitForScreen(page, 'S04RoleSelect');
    await page.locator('[data-screen="S04RoleSelect"] .role-card button.btn--primary').first().click();
    await waitForScreen(page, 'S02Prologue');

    // 入力する理由を画面で説明している
    await expect(page.locator('[data-screen="S02Prologue"] .explain'))
      .toContainText('プレイの最後にもう一度表示します');

    await page.getByRole('button', { name: '入力せずに始める' }).click();
    await waitForScreen(page, 'S05Main');

    await playToEnding(page);
    await expect(page.locator('[data-screen="S08Ending"]'))
      .toContainText('プロローグでは批判を書いていませんでした。');
    await expect(page.locator('[data-screen="S08Ending"]'))
      .toContainText('予想は書かれていません。');
  });

  test('結果画面に字幕バーも早送りの演出も残らない', async ({ page }) => {
    test.setTimeout(300_000);

    await openTitle(page);
    await startNewPlay(page);

    // プレイ中は字幕が出ている（結果画面での不在と比べるため）
    await page.keyboard.press('1');
    await expect(page.locator('.caption-host')).toBeVisible();

    await playToEnding(page);
    await expect(page.locator('[data-screen="S08Ending"]')).toBeVisible();
    await expect(page.locator('[data-caption-bar]')).toHaveCount(0);
    await expect(page.locator('.caption-host')).toHaveCount(0);
    expect(await htmlClasses(page)).not.toContain('fx-fastforward');

    await openReview(page);
    await expect(page.locator('[data-screen="S09Review"]')).toBeVisible();
    await expect(page.locator('[data-caption-bar]')).toHaveCount(0);
    await expect(page.locator('.caption-host')).toHaveCount(0);
    expect(await htmlClasses(page)).not.toContain('fx-fastforward');
  });
});
