// Playwright 設定の回帰チェック（設計書 12章: PC とスマホ幅、5179 番で配信）
import { describe, expect, it } from 'vitest';
import config from '../../../playwright.config';

describe('playwright.config', () => {
  it('baseURL と webServer が 5179 番を指す', () => {
    expect(config.use?.baseURL).toBe('http://localhost:5179');

    const server = config.webServer;
    expect(Array.isArray(server)).toBe(false);
    const single = server as { command?: string; url?: string };
    expect(single.url).toBe('http://localhost:5179');
    expect(single.command).toContain('npm run build:data');
    expect(single.command).toContain('--port 5179');
    expect(single.command).toContain('--strictPort');
  });

  it('PC（1280x800）とスマホ幅（390x844）の 2 プロジェクトを持つ', () => {
    const projects = config.projects ?? [];
    expect(projects.map((project) => project.name)).toEqual(['pc', 'mobile']);
    expect(projects[0]?.use?.viewport).toEqual({ width: 1280, height: 800 });
    expect(projects[1]?.use?.viewport).toEqual({ width: 390, height: 844 });
  });

  it('テストは tests/e2e 配下を対象にする', () => {
    expect(config.testDir).toBe('./tests/e2e');
  });
});
