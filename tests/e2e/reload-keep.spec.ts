// 再読み込みしても、画面・進行・結果が消えないこと。
import { expect, test, type Page } from '@playwright/test';
import {
  openReview, openTitle, playToEnding, startNewPlay, waitForScreen,
} from './helpers';

const PLAYS_KEY = 'ytcdb:v1:plays';

async function playCounts(page: Page): Promise<Record<string, { count?: number }>> {
  return page.evaluate((key: string) => {
    const raw = localStorage.getItem(key);
    return raw === null ? {} : (JSON.parse(raw) as Record<string, { count?: number }>);
  }, PLAYS_KEY);
}

test('プレイ中に再読み込みすると同じ画面・同じ時刻で再開する', async ({ page }) => {
  test.setTimeout(120_000);
  await openTitle(page);
  await startNewPlay(page);

  const clock = page.locator('[data-screen="S05Main"] .clock .time');
  const playCount = page.locator('[data-screen="S05Main"] .topbar .play-count');
  await expect(playCount).toHaveText('1回目');

  // 1手進める（時刻が動く）
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  const before = await clock.textContent();
  expect(before).toBeTruthy();

  await page.reload();

  await waitForScreen(page, 'S05Main');
  await expect(clock).toHaveText(before!);
  await expect(playCount).toHaveText('1回目');
  const counts = await playCounts(page);
  expect(counts['no01-nebula/executive']?.count).toBe(1);
});

test('結果画面を再読み込みしても結果が残り、プレイ回数が増えない', async ({ page }) => {
  test.setTimeout(180_000);
  await openTitle(page);
  await startNewPlay(page);
  await playToEnding(page);

  const ending = page.locator('[data-screen="S08Ending"]');
  const rank = ending.locator('.stamp');
  const playCount = ending.locator('.play-count');
  const official = ending.locator('.score-grid dd').nth(2);
  const rankBefore = await rank.textContent();
  const officialBefore = await official.textContent();
  await expect(playCount).toHaveText('1回目');

  const before = await playCounts(page);
  expect(before['no01-nebula/executive']?.count).toBe(1);

  await page.reload();

  await waitForScreen(page, 'S08Ending');
  await expect(rank).toHaveText(rankBefore!);
  await expect(official).toHaveText(officialBefore!);
  await expect(playCount).toHaveText('1回目');

  // 結果の記録も回数も増えない
  const after = await playCounts(page);
  expect(after['no01-nebula/executive']?.count).toBe(1);
});

test('振り返り画面を再読み込みしても表示が残る', async ({ page }) => {
  test.setTimeout(180_000);
  await openTitle(page);
  await startNewPlay(page);
  await playToEnding(page);
  await openReview(page);

  const review = page.locator('[data-screen="S09Review"]');
  const playCount = review.locator('.play-count');
  await expect(playCount).toHaveText('1回目');
  const summary = await review.locator('.panel').first().textContent();
  expect(summary).toBeTruthy();

  await page.reload();

  await waitForScreen(page, 'S09Review');
  await expect(playCount).toHaveText('1回目');
  await expect(review.locator('.panel').first()).toHaveText(summary!);
  expect((await playCounts(page))['no01-nebula/executive']?.count).toBe(1);
});

test('本番モードの残り時間は再読み込みで増えない', async ({ page }) => {
  test.setTimeout(120_000);
  await openTitle(page);
  await page.locator('[data-screen="S01Title"] button.btn--primary').first().click();
  await waitForScreen(page, 'S03ScenarioSelect');
  await page.locator('[data-screen="S03ScenarioSelect"] .scenario-card button.btn--primary').first().click();
  await waitForScreen(page, 'S04RoleSelect');
  await page.locator('[data-screen="S04RoleSelect"] input[type="radio"][value="hard"]').check();
  await page.locator('[data-screen="S04RoleSelect"] .role-card button.btn--primary').first().click();
  await waitForScreen(page, 'S02Prologue');
  await page.locator('[data-screen="S02Prologue"] button.btn--primary').click();
  await waitForScreen(page, 'S05Main');

  const timer = page.locator('[data-screen="S05Main"] [role="timer"]');
  const secondsOf = async (): Promise<number> => {
    const text = (await timer.textContent()) ?? '';
    return Number((/\d+/.exec(text) ?? ['0'])[0]);
  };
  await page.waitForTimeout(1500);
  const before = await secondsOf();

  await page.reload();

  await waitForScreen(page, 'S05Main');
  await expect(timer).toBeVisible();
  const after = await secondsOf();
  expect(after).toBeLessThanOrEqual(before);
});

test('プロローグで入力した内容は再読み込みしても残る', async ({ page }) => {
  test.setTimeout(120_000);
  await openTitle(page);
  await page.locator('[data-screen="S01Title"] button.btn--primary').first().click();
  await waitForScreen(page, 'S03ScenarioSelect');
  await page.locator('[data-screen="S03ScenarioSelect"] .scenario-card button.btn--primary').first().click();
  await waitForScreen(page, 'S04RoleSelect');
  await page.locator('[data-screen="S04RoleSelect"] .role-card button.btn--primary').first().click();
  await waitForScreen(page, 'S02Prologue');

  const comment = page.locator('#prologue-comment');
  const hours = page.locator('#prologue-hours');
  await comment.fill('再読み込みしても残るはず');
  await hours.fill('3');

  await page.reload();
  await waitForScreen(page, 'S02Prologue');
  await expect(comment).toHaveValue('再読み込みしても残るはず');
  await expect(hours).toHaveValue('3');

  // 開始すると下書きは消える
  await page.locator('[data-screen="S02Prologue"] button.btn--primary').click();
  await waitForScreen(page, 'S05Main');
  const draft = await page.evaluate(() => localStorage.getItem('ytcdb:v1:prologueDraft'));
  expect(draft).toBeNull();
});

test('進行中の保存が壊れていればタイトルに戻る', async ({ page }) => {
  await openTitle(page);
  await page.evaluate(() => {
    localStorage.setItem('ytcdb:v1:progress', '{broken');
    localStorage.setItem('ytcdb:v1:screen', JSON.stringify({
      screen: 'S05', scenarioId: 'no01-nebula', backTo: 'S01', playRef: null, overlay: null,
    }));
  });

  await page.reload();
  await waitForScreen(page, 'S01Title');
});

test('ランキング送信に失敗したまま再読み込みすると、再送ボタンを出して自動送信しない', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__YTCDB_API_BASE__ = '/rank-api';
  });
  let posts = 0;
  await page.route('**/rank-api/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/api/plays') && route.request().method() === 'POST') {
      posts += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });

  await openTitle(page);
  await startNewPlay(page);
  await playToEnding(page);

  const ending = page.locator('[data-screen="S08Ending"]');
  await expect(ending.locator('[data-ranking-status="failed"]')).toBeVisible();
  const before = posts;
  expect(before).toBeGreaterThan(0);

  await page.reload();
  await waitForScreen(page, 'S08Ending');
  await expect(ending.locator('[data-ranking-status="failed"]')).toBeVisible();
  await expect(ending.locator('[data-ranking-retry]')).toBeVisible();
  // 再読み込みで勝手に送り直さない
  expect(posts).toBe(before);

  // 再送ボタンを押したときだけ送る
  await ending.locator('[data-ranking-retry]').click();
  await expect.poll(() => posts).toBe(before + 1);
});
