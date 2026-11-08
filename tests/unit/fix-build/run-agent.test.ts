import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

const script = join(process.cwd(), 'tools', 'dev', 'run-agent.sh');

function run(name: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync('bash', [script, name, 'prompt.md'], { encoding: 'utf8' });
}

describe('run-agent.sh の NAME 検証', () => {
  it('../ を含む名前を拒否する', () => {
    for (const name of ['..', '../evil', 'a/../../b']) {
      const result = run(name);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('NAME');
    }
  });

  it('スラッシュやシェルの記号を拒否する', () => {
    for (const name of ['a/b', 'a;rm -rf /', 'a b', 'a$(whoami)']) {
      const result = run(name);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('NAME');
    }
  });
});
