// E2E の共通操作。文言（i18n）に依存せず、data-screen と画面構造だけで進める。
import { expect, type Page } from '@playwright/test';

/** 既知の不具合（画面側の修正待ち）。fixme の理由に使う */
export const DEFECT_I18N =
  '不具合1: src/main.ts が loadLocales/initI18n を呼んでいないため、全画面の文言が「未翻訳」になり、日本語・英語の表示を確認できない';
export const DEFECT_RESUME =
  '不具合2: 「続きから」で復帰した PlayState が Svelte の $state proxy のままエンジンへ渡り、structuredClone に失敗してエラー画面になる（S01Title.resume）';

export type ScreenId =
  | 'S01Title' | 'S02Prologue' | 'S03ScenarioSelect' | 'S04RoleSelect'
  | 'S05Main' | 'S06Draft' | 'S07Press' | 'S08Ending' | 'S09Review'
  | 'S10Settings' | 'S11Credits';

/** いま表示されている画面の data-screen */
export async function currentScreen(page: Page): Promise<string> {
  const el = page.locator('[data-screen]').first();
  await el.waitFor({ state: 'visible' });
  return (await el.getAttribute('data-screen')) ?? '';
}

export async function waitForScreen(page: Page, screen: ScreenId): Promise<void> {
  await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
}

export async function openTitle(page: Page): Promise<void> {
  await page.goto('/');
  await waitForScreen(page, 'S01Title');
}

/** タイトル → シナリオ選択 → 経営者ロール → プロローグ → 本編 */
export async function startNewPlay(page: Page): Promise<void> {
  await page.locator('[data-screen="S01Title"] button.btn--primary').first().click();
  await waitForScreen(page, 'S03ScenarioSelect');

  await page.locator('[data-screen="S03ScenarioSelect"] .scenario-card button.btn--primary').first().click();
  await waitForScreen(page, 'S04RoleSelect');

  // ROLES の並びは executive が先頭（No.1 ネビュラクラウドの経営者）
  await page.locator('[data-screen="S04RoleSelect"] .role-card button.btn--primary').first().click();
  await waitForScreen(page, 'S02Prologue');

  // 入力は任意なので、そのまま始める
  await page.locator('[data-screen="S02Prologue"] button.btn--primary').click();
  await waitForScreen(page, 'S05Main');
}

/** 文案作成: すべての部品で先頭の選択肢を選び、確定する */
export async function completeDraft(page: Page): Promise<void> {
  const slots = page.locator('[data-screen="S06Draft"] .slots fieldset');
  await slots.first().waitFor({ state: 'visible' });

  const count = await slots.count();
  for (let i = 0; i < count; i++) {
    const radio = slots.nth(i).locator('input[type="radio"]').first();
    if ((await radio.count()) === 0) continue; // auto の部品は選択欄なし
    await radio.check({ force: true });
  }

  const confirm = page.locator('[data-screen="S06Draft"] button.confirm');
  await expect(confirm).toBeEnabled();
  await confirm.click();
}

/**
 * 本編では数字キー「1」を押し続ける。文案作成は先頭の部品を選び、
 * 記者会見も「1」で答え、エンディングで止まる。
 */
export async function playToEnding(page: Page, maxSteps = 600): Promise<void> {
  for (let step = 0; step < maxSteps; step += 1) {
    const screen = await currentScreen(page);
    if (screen === 'S08Ending') return;

    if (screen === 'S06Draft') {
      await completeDraft(page);
    } else if (screen === 'S07Press' || screen === 'S05Main') {
      await page.keyboard.press('1');
    } else {
      throw new Error(`想定外の画面: ${screen}`);
    }
    await page.waitForTimeout(120);
  }
  throw new Error('エンディングに到達しませんでした');
}

/** エンディングから振り返りへ */
export async function openReview(page: Page): Promise<void> {
  await page.locator('[data-screen="S08Ending"] .actions button.btn--primary').click();
  await waitForScreen(page, 'S09Review');
}

/** エンディングからタイトルへ */
export async function backToTitle(page: Page): Promise<void> {
  await page.locator('[data-screen="S08Ending"] .actions button.btn--ghost').click();
  await waitForScreen(page, 'S01Title');
}
