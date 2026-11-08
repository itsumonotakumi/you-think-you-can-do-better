// CI と Pages の設定（main 以外を配信しない・本番依存の監査）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

function workflow(name: string): any {
  return parse(readFileSync(join(process.cwd(), '.github', 'workflows', name), 'utf8'));
}

describe('pages.yml', () => {
  it('build と deploy は main のときだけ動く', () => {
    const data = workflow('pages.yml');
    expect(data.jobs.build.if).toBe("github.ref == 'refs/heads/main'");
    expect(data.jobs.deploy.if).toBe("github.ref == 'refs/heads/main'");
  });
});

describe('ci.yml', () => {
  it('test ジョブで本番依存の監査を実行する', () => {
    const data = workflow('ci.yml');
    const runs = (data.jobs.test.steps as { run?: string }[]).map((step) => step.run ?? '');
    expect(runs).toContain('npm audit --omit=dev --audit-level=low');
  });
});
