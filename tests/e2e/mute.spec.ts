// どの画面からでも音を消せるボタン
import { expect, test } from '@playwright/test';
import { openTitle } from './helpers';

test.describe('ミュートボタン', () => {
  test('押すと音が消え、再読み込み後も設定画面と一致する', async ({ page }) => {
    await openTitle(page);

    const button = page.getByTestId('mute-button');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAccessibleName('音を消す');

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveAccessibleName('音を出す');

    // 保存され、再読み込みしても消えたまま
    await page.reload();
    await expect(page.getByTestId('mute-button')).toHaveAttribute('aria-pressed', 'true');

    // 設定画面のミュートとも同じ値
    await page.getByRole('button', { name: '設定' }).click();
    await expect(page.getByRole('checkbox', { name: 'ミュート' })).toBeChecked();

    await page.getByTestId('mute-button').click();
    await expect(page.getByRole('checkbox', { name: 'ミュート' })).not.toBeChecked();
  });
});
