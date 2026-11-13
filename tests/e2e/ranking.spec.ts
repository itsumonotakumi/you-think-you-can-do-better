// #7 ランキングの導線・参加・表示。API はモックする（ネットワークへは出ない）。
import { expect, test, type Page } from '@playwright/test';
import {
  openReview, openTitle, playToEnding, startNewPlay, waitForScreen,
} from './helpers';

// 同一オリジンのパスにして CSP（connect-src 'self'）の下でも通信を通す。
// 画面側は開発時だけ window.__YTCDB_API_BASE__ を見る。
const API_BASE = '/rank-api';

interface Captured {
  submissions: Array<Record<string, unknown>>;
  rankingPeriods: string[];
  statsRequests: number;
}

async function enableRanking(page: Page): Promise<void> {
  await page.addInitScript((base) => {
    (window as unknown as Record<string, unknown>).__YTCDB_API_BASE__ = base;
  }, API_BASE);
}

async function mockApi(page: Page, captured: Captured): Promise<void> {
  await page.route('**/rank-api/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/api/plays')) {
      const body = route.request().postData();
      captured.submissions.push(body ? JSON.parse(body) as Record<string, unknown> : {});
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, score: 900, rank: 'A', position: 3, total: 40, percentile: 8 }),
      });
      return;
    }
    if (url.pathname.endsWith('/api/ranking')) {
      captured.rankingPeriods.push(url.searchParams.get('period') ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scenarioId: url.searchParams.get('scenario') ?? '',
          role: url.searchParams.get('role') ?? 'executive',
          mode: 'normal',
          period: url.searchParams.get('period') ?? 'week',
          entries: [
            { position: 1, nickname: 'いち', score: 1200, rank: 'S', at: '2026-11-13T00:00:00Z' },
            { position: 2, nickname: 'に', score: 1000, rank: 'A', at: '2026-11-13T00:00:00Z' },
            { position: 3, nickname: 'たろう', score: 900, rank: 'A', at: '2026-11-13T00:00:00Z' },
          ],
          total: 40,
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/api/stats')) {
      captured.statsRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scenarioId: url.searchParams.get('scenario') ?? '',
          role: url.searchParams.get('role') ?? 'executive',
          points: { 'p01-call': { 'p01-command': 42 } },
          total: 40,
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });
}

function emptyCapture(): Captured {
  return { submissions: [], rankingPeriods: [], statsRequests: 0 };
}

test.describe('ランキング', () => {
  test('API が未設定なら導線を出さない', async ({ page }) => {
    await openTitle(page);
    await expect(page.locator('[data-ranking-link]')).toHaveCount(0);
  });

  test('タイトルからランキングを見られる', async ({ page }) => {
    const captured = emptyCapture();
    await enableRanking(page);
    await mockApi(page, captured);

    await openTitle(page);
    await page.locator('[data-ranking-link]').click();
    await expect(page.locator('[data-screen="S12Ranking"]')).toBeVisible();

    await expect(page.locator('[data-screen="S12Ranking"] .ranking-row .nick').first())
      .toHaveText('いち');
    await expect(page.locator('[data-screen="S12Ranking"]')).toContainText('40人が参加');

    // 期間を切り替えると取り直す
    await page.getByRole('button', { name: '全期間' }).click();
    await expect.poll(() => captured.rankingPeriods.includes('all')).toBe(true);

    // プレイしていないので参加ボタンは出ない
    await expect(page.locator('[data-ranking-open]')).toHaveCount(0);

    await page.getByRole('button', { name: 'タイトルへ' }).click();
    await waitForScreen(page, 'S01Title');
  });

  test('初回プレイの結果を同意して送信し、順位が出る', async ({ page }) => {
    test.setTimeout(300_000);
    const captured = emptyCapture();
    await enableRanking(page);
    await mockApi(page, captured);

    await openTitle(page);
    await startNewPlay(page);
    await playToEnding(page);
    await waitForScreen(page, 'S08Ending');

    // 初回だけ参加できる
    const join = page.locator('[data-ranking-join]');
    await expect(join).toBeVisible();
    await join.click();
    await expect(page.locator('[data-screen="S12Ranking"]')).toBeVisible();

    await page.locator('[data-ranking-open]').click();
    // 送る内容・送らない内容を同意画面で確認できる
    const joinPanel = page.locator('[data-screen="S12Ranking"] .join');
    await expect(joinPanel).toContainText('シナリオ・ロール・選んだ選択肢・ニックネーム');
    await expect(joinPanel).toContainText('プロローグの書き込み・記録のメモ');

    await page.locator('[data-ranking-nickname]').fill('たろう');
    await page.locator('[data-ranking-agree]').check();
    await page.locator('[data-ranking-submit]').click();

    const result = page.locator('[data-ranking-result]');
    await expect(result).toContainText('順位 3 / 40人');
    await expect(result).toContainText('上位 8%');

    expect(captured.submissions).toHaveLength(1);
    const body = captured.submissions[0] ?? {};
    expect(body.nickname).toBe('たろう');
    expect(typeof body.clientId).toBe('string');
    expect((body.clientId as string).length).toBeGreaterThan(0);
    expect(body.turnstileToken).toBe('');
    expect(Array.isArray(body.choices)).toBe(true);
    expect((body.choices as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(body.drafts)).toBe(true);
    expect((body.drafts as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(body.press)).toBe(true);
    expect((body.press as unknown[]).length).toBeGreaterThan(0);
    // 点数は送らない（サーバーが再計算する）
    expect(Object.hasOwn(body, 'score')).toBe(false);

    // 送信後は自分の行が強調される
    await expect(page.locator('[data-screen="S12Ranking"] .ranking-row.is-self')).toHaveCount(1);
  });

  test('振り返りでは判断ごとの選択率を出し、本編では出さない', async ({ page }) => {
    test.setTimeout(300_000);
    const captured = emptyCapture();
    await enableRanking(page);
    await mockApi(page, captured);

    await openTitle(page);
    await startNewPlay(page);
    await playToEnding(page);
    await waitForScreen(page, 'S08Ending');

    // 本編の選択肢には選択率を出さない（正誤のヒントになるため）
    await expect(page.locator('[data-choice-stats]')).toHaveCount(0);

    await openReview(page);
    await expect(page.locator('[data-screen="S09Review"] [data-choice-stats]').first())
      .toContainText('この判断で42%がこれを選んだ');
    expect(captured.statsRequests).toBeGreaterThan(0);
  });
});
