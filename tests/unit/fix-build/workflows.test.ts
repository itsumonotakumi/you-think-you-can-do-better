import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

function workflow(name: string): any {
  return parse(readFileSync(join(process.cwd(), '.github', 'workflows', name), 'utf8'));
}

function checkoutStep(steps: any[]): any {
  return steps.find((step) => String(step.uses ?? '').startsWith('actions/checkout@'));
}

describe('ci.yml', () => {
  it('checkout は認証情報を保存しない', () => {
    const data = workflow('ci.yml');
    expect(data.permissions).toEqual({ contents: 'read' });
    const step = checkoutStep(data.jobs.test.steps);
    expect(step?.with?.['persist-credentials']).toBe(false);
  });
});

describe('pages.yml', () => {
  it('ワークフロー全体は読み取りだけ', () => {
    const data = workflow('pages.yml');
    expect(data.permissions).toEqual({ contents: 'read' });
    expect(data.jobs.build.permissions).toBeUndefined();
  });

  it('pages と id-token は deploy ジョブだけに与える', () => {
    const data = workflow('pages.yml');
    expect(data.jobs.deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
    expect(checkoutStep(data.jobs.build.steps)?.with?.['persist-credentials']).toBe(false);
  });
});
