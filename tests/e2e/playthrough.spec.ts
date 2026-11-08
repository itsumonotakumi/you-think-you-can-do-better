// (2) 本編を最後まで進め、エンディングと振り返りまで確認する
import { expect, test } from '@playwright/test';
import {
  DEFECT_I18N, openReview, openTitle, playToEnding, waitForScreen,
} from './helpers';

test.describe('一周のプレイ', () => {
  test('はじめる→ロール選択→プロローグ→本編→記者会見→エンディング→振り返り', async ({ page }) => {
    // 不具合1（i18n 未初期化)のため、文言の確認ができない。修正後にこの行を消す。
    test.fixme(true, DEFECT_I18N);
    test.setTimeout(300_000);

    await openTitle(page);

    // S01 → S03（設計書 3.2 の流れ）
    await page.getByRole('button', { name: 'はじめる' }).click();
    await waitForScreen(page, 'S03ScenarioSelect');
    await expect(page.locator('.scenario-card')).toHaveCount(1);
    await expect(page.locator('.scenario-card__title').first())
      .toHaveText('安全を売る会社が、安全でなかった');

    // S03 → S04（No.1 の経営者）
    await page.locator('.scenario-card button.btn--primary').first().click();
    await waitForScreen(page, 'S04RoleSelect');
    const roleCard = page.locator('.role-card').first();
    await expect(roleCard.locator('.role-card__title')).toHaveText('経営者');
    await expect(roleCard.locator('.role-card__meta')).toContainText('次は 1回目');

    // S04 → S02（プロローグ）。入力は任意。
    await roleCard.locator('button.btn--primary').click();
    await waitForScreen(page, 'S02Prologue');
    await expect(page.locator('[data-screen="S02Prologue"] h1')).toHaveText('プロローグ');
    await page.locator('#prologue-comment').fill('対応が遅すぎる。誰が責任を取るのか。');
    await page.locator('#prologue-hours').fill('12');
    await page.getByRole('button', { name: 'はじめる' }).click();
    await waitForScreen(page, 'S05Main');

    // S05: 上部バーに「1回目」が出る
    await expect(page.locator('[data-screen="S05Main"] .play-count')).toHaveText('1回目');

    // S05〜S07: 数字キー「1」で進め、文案作成は部品を選んで確定
    await playToEnding(page);

    // S08: ランクと「1回目」
    await expect(page.locator('.stamp')).toHaveText(/^[SABCD]$/);
    await expect(page.locator('[data-screen="S08Ending"] .play-count')).toHaveText('1回目');
    await expect(page.locator('[data-screen="S08Ending"]')).toContainText('今回のランク');
    await expect(page.locator('[data-screen="S08Ending"]')).toContainText('サイバー攻撃で悪いのは、攻撃した犯罪者です');

    // S09: 振り返り
    await openReview(page);
    await expect(page.locator('[data-screen="S09Review"] h1')).toHaveText('振り返り');
    await expect(page.locator('[data-screen="S09Review"] .play-count')).toHaveText('1回目');
    await expect(page.locator('[data-screen="S09Review"]')).toContainText('サイバー攻撃で悪いのは、攻撃した犯罪者です');
    await expect(page.locator('[data-screen="S09Review"]')).toContainText('高得点が取れても、現実の対応が正しいとは限りません');
    await expect(page.getByRole('button', { name: '印刷' })).toBeVisible();
  });
});
