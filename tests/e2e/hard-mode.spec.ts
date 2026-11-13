// 本番モード（#10）: モード選択、判断ごとの残り時間、時間切れの先送り、振り返りとプレイ回数。
import { expect, test, type Page } from '@playwright/test';
import { currentScreen, openReview, playToEnding, waitForScreen } from './helpers';

const PROGRESS_KEY = 'ytcdb:v1:progress';
const PLAYS_KEY = 'ytcdb:v1:plays';

/** localStorage の JSON を読む（画面の内部状態を確かめるためだけに使う） */
async function readJson(page: Page, key: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((k: string) => {
    const raw = localStorage.getItem(k);
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
  }, key);
}

/** タイトル → シナリオ → S04 まで進み、難易度を選ぶ */
async function chooseMode(page: Page, mode: 'normal' | 'hard'): Promise<void> {
  await page.goto('/');
  await waitForScreen(page, 'S01Title');
  await page.locator('[data-screen="S01Title"] button.btn--primary').first().click();
  await waitForScreen(page, 'S03ScenarioSelect');
  await page.locator('[data-screen="S03ScenarioSelect"] .scenario-card button.btn--primary').first().click();
  await waitForScreen(page, 'S04RoleSelect');
  await page.locator(`[data-screen="S04RoleSelect"] input[type="radio"][value="${mode}"]`).check();
}

/** S04 からロールを選び、プロローグを飛ばして本編へ */
async function startFromRoleSelect(page: Page): Promise<void> {
  await page.locator('[data-screen="S04RoleSelect"] .role-card button.btn--primary').first().click();
  await waitForScreen(page, 'S02Prologue');
  await page.locator('[data-screen="S02Prologue"] button.btn--primary').click();
  await waitForScreen(page, 'S05Main');
}

test('本番モードを選ぶと判断ごとの残り時間が出て、時間切れは先送りになる', async ({ page }) => {
  // 60秒を実際に待たずに確かめるため、ページ内の時計を進める
  await page.clock.install();

  await chooseMode(page, 'hard');
  await expect(page.locator('[data-screen="S04RoleSelect"] input[type="radio"][value="hard"]')).toBeChecked();
  await expect(page.locator('[data-screen="S04RoleSelect"] .mode-notice')).toBeVisible();
  await startFromRoleSelect(page);

  const timer = page.locator('[data-screen="S05Main"] [role="timer"]');
  await expect(timer).toBeVisible();
  await expect(timer).toContainText(/60/);

  const progress = await readJson(page, PROGRESS_KEY);
  expect(progress?.mode).toBe('hard');

  // 5秒たつと残りは55秒前後になる（数字で出す）
  await page.clock.fastForward(5_000);
  await expect(timer).toContainText(/5[0-9]/);

  // 制限時間を過ぎると「判断の先送り」で自動的に進む
  await page.clock.fastForward(60_000);
  await expect.poll(async () => {
    const state = await readJson(page, PROGRESS_KEY);
    return Array.isArray(state?.history) ? (state?.history as unknown[]).length : 0;
  }).toBe(1);

  if ((await currentScreen(page)) === 'S05Main') {
    await expect(page.locator('[data-screen="S05Main"] .timer-timeout')).toBeVisible();
  }

  const after = await readJson(page, PROGRESS_KEY);
  expect(after?.mode).toBe('hard');

  // 先送りした判断は「最も消極的な選択」なので、臆病な選択（coward）が選ばれる
  const history = after?.history as { choiceId: string }[] | undefined;
  expect(history?.[0]?.choiceId).toBe('p01-wait');
});

test('通常モードでは残り時間を出さない', async ({ page }) => {
  await chooseMode(page, 'normal');
  await expect(page.locator('[data-screen="S04RoleSelect"] input[type="radio"][value="normal"]')).toBeChecked();
  await startFromRoleSelect(page);

  await expect(page.locator('[data-screen="S05Main"]')).toBeVisible();
  await expect(page.locator('[data-screen="S05Main"] [data-hard-timer]')).toHaveCount(0);
  expect((await readJson(page, PROGRESS_KEY))?.mode).toBe('normal');
});

test('本番モードのプレイ回数はモードごとに分かれ、振り返りにモードが出る', async ({ page }) => {
  await chooseMode(page, 'hard');
  await startFromRoleSelect(page);

  // 開始時に本番モード用のキーで数えている（既存の通常モードのキーは増やさない）
  const plays = (await readJson(page, PLAYS_KEY)) ?? {};
  const keys = Object.keys(plays);
  expect(keys.some((key) => key.endsWith('/hard'))).toBe(true);
  expect(keys.some((key) => !key.endsWith('/hard'))).toBe(false);

  await playToEnding(page);
  await openReview(page);

  const badge = page.locator('[data-screen="S09Review"] .mode-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-mode', 'hard');
  await expect(page.locator('[data-screen="S09Review"] .panel').first()).toContainText(/本番|Full-on/);
});
