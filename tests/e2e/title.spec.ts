// (1) タイトル表示と注記（悪いのは犯罪者）
import { expect, test } from '@playwright/test';
import { DEFECT_I18N, openTitle } from './helpers';

test.describe('タイトル', () => {
  test('製品名・目的・犯罪者の注記が出る', async ({ page }) => {

    await openTitle(page);

    await expect(page.locator('.title-name')).toHaveText('じゃ、あなたがやってみてよ');
    await expect(page.locator('.eyebrow')).toHaveText('インシデント対応シミュレーター');
    await expect(page.locator('.title-screen button.btn--primary')).toHaveText('はじめる');

    // 固定の注記（設計書 9章、C19/C21）
    const notices = page.locator('.notice-stack');
    await expect(notices).toContainText('サイバー攻撃で悪いのは、攻撃した犯罪者です');
    await expect(notices).toContainText('被害に遭った企業や人を責めるためのツールではありません');
    await expect(notices).toContainText('高得点が取れても、現実の対応が正しいとは限りません');
    await expect(notices).toContainText('このツールについて');

    // 設定・クレジットへ入れる
    await expect(page.getByRole('button', { name: '設定' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'クレジット' })).toBeVisible();
  });
});
