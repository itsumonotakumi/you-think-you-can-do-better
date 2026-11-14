// #7 ランキングの導線・自動登録・削除・表示。API はモックする（ネットワークへは出ない）。
import { expect, test, type Page } from '@playwright/test';
import {
  openReview, openTitle, playToEnding, startNewPlay, waitForScreen,
} from './helpers';

// 同一オリジンのパスにして CSP（connect-src 'self'）の下でも通信を通す。
// 画面側は開発時だけ window.__YTCDB_API_BASE__ を見る。
const API_BASE = '/rank-api';

interface Captured {
  submissions: Array<Record<string, unknown>>;
  deletes: Array<Record<string, unknown>>;
  rankingPeriods: string[];
  statsRequests: number;
  /** 実際に遊んだ判断だけを 42% として返すためのモック（選択肢は送信内容から作る） */
  statsPoints: Record<string, Record<string, number>>;
}

async function enableRanking(page: Page): Promise<void> {
  await page.addInitScript((base) => {
    (window as unknown as Record<string, unknown>).__YTCDB_API_BASE__ = base;
  }, API_BASE);
}

function bodyOf(routeRequest: { postData(): string | null }): Record<string, unknown> {
  const body = routeRequest.postData();
  if (!body) return {};
  return JSON.parse(body) as Record<string, unknown>;
}

async function mockApi(page: Page, captured: Captured): Promise<void> {
  await page.route('**/rank-api/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/api/plays') && request.method() === 'POST') {
      const payload = bodyOf(request);
      captured.submissions.push(payload);
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      for (const entry of choices as Array<{ pointId?: unknown; choiceId?: unknown }>) {
        if (typeof entry.pointId === 'string' && typeof entry.choiceId === 'string') {
          captured.statsPoints[entry.pointId] = { [entry.choiceId]: 42 };
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, score: 900, rank: 'A', position: 3, total: 40, percentile: 8 }),
      });
      return;
    }
    if (url.pathname.endsWith('/api/plays') && request.method() === 'DELETE') {
      captured.deletes.push(bodyOf(request));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, deleted: 1 }),
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
          points: captured.statsPoints,
          total: 40,
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });
}

function emptyCapture(): Captured {
  return { submissions: [], deletes: [], rankingPeriods: [], statsRequests: 0, statsPoints: {} };
}

test.describe('ランキング', () => {
  test('API が未設定なら導線もニックネーム入力も出さない', async ({ page }) => {
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/')) apiRequests.push(request.url());
    });

    await openTitle(page);
    await expect(page.locator('[data-ranking-link]')).toHaveCount(0);

    // シナリオ選択からロール選択へ進んでも、ランキングの入力は出ない
    await page.locator('[data-screen="S01Title"] button.btn--primary').first().click();
    await waitForScreen(page, 'S03ScenarioSelect');
    await page.locator('[data-screen="S03ScenarioSelect"] .scenario-card button.btn--primary').first().click();
    await waitForScreen(page, 'S04RoleSelect');

    await expect(page.locator('[data-ranking-nickname]')).toHaveCount(0);
    await expect(page.locator('[data-ranking-warning]')).toHaveCount(0);
    await expect(
      page.locator('[data-screen="S04RoleSelect"] .role-card button.btn--primary').first(),
    ).toBeEnabled();
    expect(apiRequests).toEqual([]);
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

    // ニックネームの変更と削除の導線がある（まだプレイしていないので削除は 0 件）
    await expect(page.locator('[data-ranking-settings]')).toBeVisible();
    await expect(page.locator('[data-ranking-nickname]')).toBeVisible();
    await expect(page.locator('[data-ranking-delete]')).toBeVisible();

    await page.getByRole('button', { name: 'タイトルへ' }).click();
    await waitForScreen(page, 'S01Title');
  });

  test('プレイ前にニックネームを決め、終了時に自動で登録して削除できる', async ({ page }) => {
    test.setTimeout(420_000);
    const captured = emptyCapture();
    await enableRanking(page);
    await mockApi(page, captured);

    await openTitle(page);
    await startNewPlay(page, { nickname: 'たろう' });
    await playToEnding(page);
    await waitForScreen(page, 'S08Ending');

    // 同意チェックも送信ボタンも無い。ウィジェットのトークンが取れたら自動で送る
    await expect(page.locator('[data-ranking-agree]')).toHaveCount(0);
    await expect(page.locator('[data-ranking-submit]')).toHaveCount(0);
    await expect(page.locator('[data-ranking-panel]')).toBeVisible();

    await expect.poll(() => captured.submissions.length).toBe(1);
    await expect(page.locator('[data-ranking-panel]')).toHaveAttribute('data-ranking-status', 'done');
    await expect(page.locator('[data-ranking-panel]')).toContainText('順位 3 / 40人');
    await expect(page.locator('[data-ranking-panel]')).toContainText('上位 8%');

    const body = captured.submissions[0] ?? {};
    expect(body.nickname).toBe('たろう');
    expect(typeof body.clientId).toBe('string');
    expect((body.clientId as string).length).toBeGreaterThan(0);
    expect(body.turnstileToken).toBe('');
    expect(body.role).toBe('executive');
    expect(body.mode).toBe('normal');
    expect(typeof body.scenarioId).toBe('string');
    expect(typeof body.scenarioVersion).toBe('string');
    expect(Array.isArray(body.choices)).toBe(true);
    expect((body.choices as unknown[]).length).toBeGreaterThan(0);
    // 端末で作った削除用の鍵を送る（サーバーはハッシュだけ保存する）
    expect(body.deleteKey as string).toMatch(/^[0-9a-f]{64}$/);
    // 点数は送らない（サーバーが再計算する）
    expect(Object.hasOwn(body, 'score')).toBe(false);

    // ランキング画面へ移り、自分の記録を削除する
    await page.locator('[data-ranking-join]').click();
    await expect(page.locator('[data-screen="S12Ranking"]')).toBeVisible();
    await expect(page.locator('[data-screen="S12Ranking"] .ranking-row.is-self')).toHaveCount(1);

    await page.locator('[data-ranking-delete]').click();
    await expect(page.locator('[data-ranking-delete-confirm]')).toBeVisible();
    await page.locator('[data-ranking-delete-confirm]').click();

    await expect.poll(() => captured.deletes.length).toBe(1);
    const deleted = captured.deletes[0] ?? {};
    expect(deleted.clientId).toBe(body.clientId);
    expect(deleted.deleteKey).toBe(body.deleteKey);
    await expect(page.locator('[data-ranking-delete-status="ok"]')).toContainText('1件');

    // 削除のあとは、以後の自動登録を止める設定を選べる
    const optOut = page.locator('[data-ranking-delete-optout]');
    await expect(optOut).toBeVisible();
    await optOut.check();
    await expect(optOut).toBeChecked();
  });

  test('「ランキングに参加しない」なら自動登録しない', async ({ page }) => {
    test.setTimeout(420_000);
    const captured = emptyCapture();
    await enableRanking(page);
    await mockApi(page, captured);

    await openTitle(page);
    await startNewPlay(page, { nickname: 'だまって', optOut: true });
    await playToEnding(page);
    await waitForScreen(page, 'S08Ending');

    await expect(page.locator('[data-ranking-panel]')).toHaveAttribute('data-ranking-status', 'optout');
    await expect(page.locator('[data-ranking-panel]')).toContainText('登録しません');
    await page.waitForTimeout(500);
    expect(captured.submissions).toHaveLength(0);
  });

  test('振り返りでは判断ごとの選択率を出し、本編では出さない', async ({ page }) => {
    test.setTimeout(420_000);
    const captured = emptyCapture();
    await enableRanking(page);
    await mockApi(page, captured);

    await openTitle(page);
    await startNewPlay(page, { nickname: 'はなこ' });

    // 本編の選択肢には選択率を出さない（正誤のヒントになるため）
    await expect(page.locator('[data-screen="S05Main"] [data-choice-stats]')).toHaveCount(0);

    await playToEnding(page);
    await waitForScreen(page, 'S08Ending');

    // 自動送信で選択内容がサーバーに届いてから振り返りへ進む
    await expect.poll(() => captured.submissions.length).toBe(1);

    await openReview(page);
    await expect(page.locator('[data-screen="S09Review"] [data-choice-stats]').first())
      .toContainText('この判断で42%がこれを選んだ');
    expect(captured.statsRequests).toBeGreaterThan(0);
  });
});
