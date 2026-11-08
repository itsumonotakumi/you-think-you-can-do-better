// (3) 2回目のプレイでは「2回目」と再プレイの注記が出る
import { expect, test } from '@playwright/test';
import {
  DEFECT_I18N, backToTitle, openTitle, playToEnding, startNewPlay, waitForScreen,
} from './helpers';

test.describe('2回目のプレイ', () => {
  test('ロール選択・本編・エンディングに「2回目」が出る', async ({ page }) => {
    // 不具合1（i18n 未初期化)のため、文言の確認ができない。修正後にこの行を消す。
    test.fixme(true, DEFECT_I18N);
    test.setTimeout(420_000);

    // 1回目を最後まで遊ぶ
    await openTitle(page);
    await startNewPlay(page);
    await playToEnding(page);
    await expect(page.locator('.stamp')).toHaveText(/^[SABCD]$/);
    await backToTitle(page);

    // 2回目を始める
    await page.locator('[data-screen="S01Title"] button.btn--primary').first().click();
    await waitForScreen(page, 'S03ScenarioSelect');
    await page.locator('.scenario-card button.btn--primary').first().click();
    await waitForScreen(page, 'S04RoleSelect');

    const roleCard = page.locator('.role-card').first();
    await expect(roleCard.locator('.role-card__title')).toHaveText('経営者');
    await expect(roleCard.locator('.role-card__meta')).toContainText('次は 2回目');
    await roleCard.locator('button.btn--primary').click();

    await waitForScreen(page, 'S02Prologue');
    await page.locator('[data-screen="S02Prologue"] button.btn--primary').click();
    await waitForScreen(page, 'S05Main');
    await expect(page.locator('[data-screen="S05Main"] .play-count')).toHaveText('2回目');

    await playToEnding(page);
    await expect(page.locator('[data-screen="S08Ending"] .play-count')).toHaveText('2回目');
    // F30: 2回目以降のエンディングに再プレイの注記
    await expect(page.locator('[data-screen="S08Ending"]')).toContainText('現実の事件に2回目はありません');
  });
});
