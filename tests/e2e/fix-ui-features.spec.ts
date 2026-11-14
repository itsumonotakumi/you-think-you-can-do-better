// レビュー指摘 #6・#7・#8 のブラウザー確認。
// #8: ランキング無効（VITE_API_BASE 未設定）では画面も通信も出ない。
// #7: ランキングの難易度が直前のプレイで固定されず、表示・切替できる。
// #6: シェアと称号のダイアログがモーダルになり、閉じると元の要素へフォーカスが戻る。
import { expect, test, type Page } from '@playwright/test';
import {
  openTitle, playToEnding, prepareRankingNickname, startNewPlay, waitForScreen,
} from './helpers';

const API_BASE = '/rank-api';

async function enableRanking(page: Page): Promise<void> {
  await page.addInitScript((base) => {
    (window as unknown as Record<string, unknown>).__YTCDB_API_BASE__ = base;
  }, API_BASE);
}

/** ランキング API をモックし、要求された難易度を集める */
async function mockRanking(page: Page, modes: string[]): Promise<void> {
  await page.route('**/rank-api/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/api/ranking')) {
      modes.push(url.searchParams.get('mode') ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scenarioId: url.searchParams.get('scenario') ?? '',
          role: url.searchParams.get('role') ?? 'executive',
          mode: url.searchParams.get('mode') ?? 'normal',
          period: url.searchParams.get('period') ?? 'week',
          entries: [
            { position: 1, nickname: 'いち', score: 1200, rank: 'S', at: '2026-11-13T00:00:00Z' },
          ],
          total: 12,
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });
}

/** 画面の中にフォーカスがあるか（背面へ抜けていないか） */
async function focusInsideDialog(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((target: string) => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    return el.closest(target) !== null;
  }, selector);
}

async function chooseHardAndPlay(page: Page): Promise<void> {
  await openTitle(page);
  await page.locator('[data-screen="S01Title"] button.btn--primary').first().click();
  await waitForScreen(page, 'S03ScenarioSelect');
  await page.locator('[data-screen="S03ScenarioSelect"] .scenario-card button.btn--primary').first().click();
  await waitForScreen(page, 'S04RoleSelect');
  await prepareRankingNickname(page);
  await page.locator('[data-screen="S04RoleSelect"] input[type="radio"][value="hard"]').check();
  await page.locator('[data-screen="S04RoleSelect"] .role-card button.btn--primary').first().click();
  await waitForScreen(page, 'S02Prologue');
  await page.locator('[data-screen="S02Prologue"] button.btn--primary').click();
  await waitForScreen(page, 'S05Main');
  await playToEnding(page);
}

test.describe('ランキング無効ビルド', () => {
  test('S12 を開いても画面も通信も出ない', async ({ page }) => {
    await openTitle(page);

    let indexRequests = 0;
    await page.route('**/data/index.json*', async (route) => {
      indexRequests += 1;
      await route.continue();
    });

    // 無効ビルドでは導線が無いため、画面だけを直接開いて確かめる。
    // CSP（script-src 'self'）の下では inline script を足せないので、評価式で store を触る
    const setScreen = page.evaluate.bind(page) as unknown as (expression: string) => Promise<unknown>;
    await setScreen("import('/src/app/store.ts').then((m) => m.screen.set('S12'))");
    await page.waitForTimeout(800);

    await expect(page.locator('[data-screen="S12Ranking"]')).toHaveCount(0);
    expect(indexRequests).toBe(0);
  });
});

test.describe('ランキングの難易度', () => {
  test('プレイしていなくても通常と本番を切り替えられる', async ({ page }) => {
    const modes: string[] = [];
    await enableRanking(page);
    await mockRanking(page, modes);

    await openTitle(page);
    await page.locator('[data-ranking-link]').click();
    await expect(page.locator('[data-screen="S12Ranking"]')).toBeVisible();

    const hard = page.getByRole('button', { name: '本番', exact: true });
    const normal = page.getByRole('button', { name: '通常', exact: true });
    await expect(normal).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => modes.includes('normal')).toBe(true);

    await hard.click();
    await expect(hard).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => modes.includes('hard')).toBe(true);
  });

  test('本番モードの終了後は本番を表示し、通常へ切り替えられる', async ({ page }) => {
    test.setTimeout(420_000);
    const modes: string[] = [];
    await enableRanking(page);
    await mockRanking(page, modes);

    await chooseHardAndPlay(page);
    await waitForScreen(page, 'S08Ending');
    await page.locator('[data-ranking-join]').click();
    await expect(page.locator('[data-screen="S12Ranking"]')).toBeVisible();

    const hard = page.getByRole('button', { name: '本番', exact: true });
    const normal = page.getByRole('button', { name: '通常', exact: true });
    await expect(hard).toHaveAttribute('aria-pressed', 'true');
    await expect(normal).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => modes.includes('hard')).toBe(true);

    // 直前のプレイに関係なく、通常のランキングも見られる
    await normal.click();
    await expect(normal).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => modes.includes('normal')).toBe(true);
    await expect(page.locator('[data-screen="S12Ranking"] .ranking-row .nick').first())
      .toHaveText('いち');
  });
});

test.describe('共有ダイアログ', () => {
  test('Tab で背面へ抜けず、閉じるとシェアのボタンへ戻る', async ({ page }) => {
    test.setTimeout(420_000);
    await openTitle(page);
    await startNewPlay(page);
    await playToEnding(page);

    const ending = page.locator('[data-screen="S08Ending"]');
    const openButton = ending.locator('button.share-open');
    await openButton.click();
    const dialog = ending.locator('dialog.share-panel');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    for (let i = 0; i < 15; i += 1) await page.keyboard.press('Tab');
    expect(await focusInsideDialog(page, 'dialog.share-panel')).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(openButton).toBeFocused();
  });
});

test.describe('称号ダイアログ', () => {
  test('Tab で背面へ抜けず、閉じると称号一覧のボタンへ戻る', async ({ page }) => {
    await openTitle(page);

    const openButton = page.getByRole('button', { name: '称号一覧' });
    await openButton.click();

    const dialog = page.locator('[data-screen="S13Achievements"]');
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 15; i += 1) await page.keyboard.press('Tab');
    expect(await focusInsideDialog(page, '[data-screen="S13Achievements"]')).toBe(true);

    await page.getByRole('button', { name: 'タイトルへ戻る' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(openButton).toBeFocused();

    // Escape でも閉じられ、同じボタンへ戻る
    await openButton.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(openButton).toBeFocused();
  });
});
