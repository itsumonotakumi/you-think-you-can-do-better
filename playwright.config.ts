// E2E テスト（Playwright）。設計書 12章、テスト計画書 5章。
// ビルドしたデータを使い、PC 幅とスマホ幅の 2 プロジェクトで回す。
import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;
// tsconfig の types に node を足さないため、process は globalThis から読む
const isCI = Boolean((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CI);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'pc',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `npm run build:data && npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
