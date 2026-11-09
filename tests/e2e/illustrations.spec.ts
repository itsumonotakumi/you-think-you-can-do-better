// イラスト: シナリオ選択の場面画像が実際に読み込まれること。
import { expect, test, type Page } from '@playwright/test';
import { openTitle, waitForScreen } from './helpers';

async function openScenarioSelect(page: Page): Promise<void> {
  await openTitle(page);
  await page.locator('[data-screen="S01Title"] button.btn--primary').first().click();
  await waitForScreen(page, 'S03ScenarioSelect');
}

test.describe('イラスト', () => {
  test('シナリオ選択に場面画像が出て、画像が読み込まれる', async ({ page }) => {
    await openScenarioSelect(page);

    const image = page.locator('[data-screen="S03ScenarioSelect"] .scenario-card img').first();
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', /illustrations\/no01-nebula-key\.webp$/);
    await expect(image).toHaveAttribute('alt', /\S/);
    await expect(image).toHaveAttribute('width', '1280');
    await expect(image).toHaveAttribute('height', '721');
    await expect(image).toHaveAttribute('loading', 'lazy');

    // 画像が本当に取得できていること（パスだけ合っていて 404、を防ぐ）
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test('スマホ幅（375px）でも画像がはみ出さない', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openScenarioSelect(page);

    const image = page.locator('[data-screen="S03ScenarioSelect"] .scenario-card img').first();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    const box = await image.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
