// 段階の切り替わりに出す挿絵: 画像が無くても画面が壊れないこと、狭い画面でもはみ出さないこと。
import { expect, test } from '@playwright/test';
import { openTitle, startNewPlay, waitForScreen } from './helpers';

/** 横スクロールが出ていないこと */
async function overflow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('挿絵は本文の上に出て、読み込めなくても判断は続けられる', async ({ page }) => {
  await openTitle(page);
  await startNewPlay(page);

  const situation = page.locator('[data-screen="S05Main"] section.situation');
  await expect(situation.locator('h2').first()).toBeVisible();

  // 画像があれば本文より上に出る（無ければ onerror で消えるだけ）
  const scene = page.locator('[data-screen="S05Main"] [data-part="scene-illustration"]');
  if ((await scene.count()) > 0 && (await scene.isVisible())) {
    const image = scene.locator('img');
    await expect(image).toHaveAttribute('decoding', 'async');
    await expect(image).toHaveAttribute('alt', /の場面|scene/i);
    const box = await image.boundingBox();
    const text = await situation.locator('p, .typed').first().boundingBox();
    expect(box).not.toBeNull();
    if (text) expect(box!.y).toBeLessThanOrEqual(text.y);
  }

  // 選択肢はそのまま選べる（待ち時間やモーダルを挟まない）
  const choice = page.locator('[data-screen="S05Main"] .choices button').first();
  await expect(choice).toBeEnabled();
});

test('幅360pxでも挿絵ではみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openTitle(page);
  await startNewPlay(page);
  await waitForScreen(page, 'S05Main');

  expect(await overflow(page)).toBeLessThanOrEqual(0);

  const image = page.locator('[data-screen="S05Main"] [data-part="scene-illustration"] img');
  if ((await image.count()) > 0 && (await image.isVisible())) {
    const box = await image.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  }
});
